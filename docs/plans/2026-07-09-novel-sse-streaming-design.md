# SSE 流式生成技术方案 / 接口切面（Phase 3 第一刀 · 设计稿）

日期：2026-07-09
定位：**纯设计文档，不含实现。** 把 SSE 流式生成的触发条件、事件协议、取消/串线规则、四层改动切面写清楚，作为后续派单的契约基线。实现按本文拆刀另派。

---

## 1. 触发条件（对齐 glossary 克制约束）

glossary 明确：SSE「需明确触发条件才引入」。本刀的触发条件已满足：

- V1 路线图 Phase 2（成本可见 + 导出线）已全部收口（P0/P1/P2/P3）。
- 路线图 Phase 3 第一条明确点名「SSE 流式生成接口」+「前端打字机实时渲染」。
- 主链路已狗粮验收零阻断（见 `docs/qa/p0-dogfood-2026-07-09.md`），具备做体验升级的基线。

**边界：** 本刀只引入流式**传输通道 + 打字机渲染**，不引入 SQLite / 向量库 / 多 Agent 编排（那些仍归 6-30 计划第六阶段，触发条件未到）。

---

## 2. 现状基线（实现前必须对齐的真实代码）

以下均为 2026-07-09 实测代码事实，非记忆：

### 2.1 主进程（`electron/main/index.ts`）
- 通道：`ipcMain.handle('api:generate-text', ...)` → `generateTextCompletion(request)`；取消 `ipcMain.handle('api:cancel-text-generation', requestId)`。
- 取消机制：模块级 `textGenerationControllers = Map<string, AbortController>()` + `timedOutTextGenerationRequests = Set<string>()`。
- `generateTextCompletion` 关键行为：
  - 进入即 `textGenerationControllers.get(requestId)?.abort()`（同 requestId 去重，防重复请求叠加）。
  - `new AbortController()` 写入 map，`setTimeout(..., 60_000)` 超时 abort（**字面量 60_000，非命名常量**）。
  - `fetch(url, { ..., signal: controller.signal })`，`body` 无 `stream` 字段（当前为一次性 JSON）。
  - URL：`${baseUrl.replace(/\/+$/, '')}/chat/completions`。
  - 响应经 `readTextGenerationResponse` 解析出 `text / errorMessage / inputTokens / outputTokens`。
  - `safeRecordAiUsage(request, usage, success)` 落成本账（含价格表估算，见 [[p1-cost-tracking-status]]）。
  - `finally` 里 `clearTimeout` + `textGenerationControllers.delete(requestId)`。
  - AbortError 分两态：`timedOutTextGenerationRequests.has(requestId)` → 超时文案，否则 → 已取消文案。

### 2.2 preload / bridge
- `electron/preload/index.ts`：`generateText`/`cancelTextGeneration` 直接 `ipcRenderer.invoke`。
- `electron/preload/bridgeTypes.ts` + `src/types/apiProvider.ts`：`ApiTextGenerationRequest`（含 requestId/channelId/channelLabel/projectId/requestType/baseUrl/apiKey/model/messages/temperature/maxTokens）、`ApiTextGenerationResult { ok, status?, message, text? }`。
- `src/services/rendererBridge.ts`：`generateText` electron 优先、无 bridge 走 `simulateTextGeneration`（Web 兜底）；`cancelTextGeneration` 无 bridge 返回「当前版本尚未接入」。

### 2.3 renderer 消费方（`ChapterWorkbench.tsx`，含 useAiCheck）
**7 个文本生成调用点全部遵循同一套 anti-串线契约：**
1. `const requestId = createId('text-request')`（每次调用唯一）。
2. `const runId = runRef.current + 1; runRef.current = runId`（单调递增守卫）。
3. `requestIdRef.current = requestId`。
4. `await rendererBridge.generateText({...})`。
5. **`if (runRef.current !== runId) return;`** —— 结果回来时若已被更新的调用超越，直接丢弃（防切章节/切项目串线）。
6. 取消路径：`runRef.current += 1; requestIdRef.current = null; if (requestId) void rendererBridge.cancelTextGeneration(requestId)`。

> ⚠️ `ChapterWorkbench.tsx` 用 Read 工具会渲染乱码（见 [[read-tool-corrupts-chapterworkbench]]），改这个文件走 grep/awk 取原始字节。

---

## 3. 事件协议（本刀核心契约）

### 3.1 上行请求：`ApiTextGenerationRequest` 加一个可选开关
```ts
interface ApiTextGenerationRequest {
  // ...现有字段不变
  stream?: boolean; // 默认 undefined/false = 走现有一次性路径，零回归
}
```
**向后兼容原则：** `stream` 不传或 false，行为与今天完全一致（现有 7 个调用点无需改也不回归）。只有显式 `stream: true` 才走新链路。

### 3.2 下行事件：主进程 → renderer 的推送通道
现状 `invoke` 是一问一答，无法中途推送。流式需新增**单向事件通道**（`ipcMain` 无法主动 push，用 `webContents.send` + preload `ipcRenderer.on`）。

新增事件频道 `api:text-generation-chunk`，payload 统一信封：
```ts
type TextStreamEvent =
  | { requestId: string; kind: 'delta'; text: string }      // 增量文本片段
  | { requestId: string; kind: 'done'; text: string;        // 完成，text=全量兜底
      inputTokens: number; outputTokens: number; estimatedCost: number }
  | { requestId: string; kind: 'error'; message: string }   // 失败（含 HTTP 非 2xx / 空结果）
  | { requestId: string; kind: 'aborted'; reason: 'cancel' | 'timeout' }; // 取消/超时分态
```

**协议规则（防串线的关键，派单必须实现）：**
- 每个事件**必带 `requestId`**。renderer 侧监听器必须 `if (event.requestId !== activeRequestIdRef.current) return;` 丢弃过期流——这是 §2.3 runId 守卫在流式下的等价物，且更严格（一次性调用只需在结果回来时判一次，流式要在**每个 chunk** 判）。
- `delta` 只带增量，不带累积全量（减小 IPC 体积）；renderer 侧自己拼接。
- `done` 带 `text` 全量作为兜底（供拼接校验 / 断流重建），并把 token/成本一起回传——**成本仍在主进程算**（renderer 拿不到也不该算），复用现有 `estimateAiCost`。
- 终态三选一互斥：`done` / `error` / `aborted`，收到任一即该 requestId 生命周期结束，后续同 requestId 事件一律丢弃。

### 3.3 `api:generate-text` invoke 的返回值（流式下）
`stream: true` 时，`invoke` 仍返回 `ApiTextGenerationResult`，但语义变为「**启动结果**」：
- `{ ok: true, message: '流式已启动' }` —— 内容通过事件通道来，text 字段留空。
- `{ ok: false, message: '...' }` —— 启动即失败（参数缺失等），此时不会有任何 chunk 事件。

renderer 据此判断：invoke ok 才开始等 chunk；invoke 失败直接报错、不挂监听。

---

## 4. 取消 / 串线规则（路线图明写的验收陷阱）

路线图 Phase 3 验收硬口径：**「取消后不会继续写入旧结果」「前端状态不会因为切换章节/项目串线」**。这是本刀隐藏成本的大头，规则钉死：

| 场景 | 主进程动作 | renderer 动作 |
| --- | --- | --- |
| 用户主动取消 | `cancelTextGeneration(requestId)` → `controller.abort()` → 发 `aborted{reason:'cancel'}` | `runRef.current += 1`，停止拼接，丢弃后续该 requestId 事件 |
| 超时（60s） | 现有 setTimeout abort，`timedOutTextGenerationRequests` 标记 → 发 `aborted{reason:'timeout'}` | 同上，展示超时文案 |
| 切章节/切项目 | 无需感知（renderer 侧作废） | 新调用抬高 runId；旧流的 chunk 因 `requestId !== activeRequestIdRef` 被丢弃；同时 `void cancelTextGeneration(旧requestId)` 让主进程停 fetch 省 token |
| 同 requestId 重复请求 | 进入即 `.get(requestId)?.abort()`（现有行为保留） | createId 保证 requestId 唯一，实际不会撞 |

**关键不变量：** renderer 侧「当前活跃流」的唯一真相是 `activeRequestIdRef.current` + `runRef.current`。任何 chunk 到达先过这两道闸，过不了就丢——**主进程可以慢，但 renderer 绝不写入非活跃流的字节**。

**流式打字机的额外坑（派单标注）：** 一次性调用取消后最多是丢一个完整结果；流式取消时 UI 上**已经渲染了半截文本**。取消动作要定义清楚——是保留已落地的半截（可编辑）还是回滚清空？建议：**保留半截 + 标记「已取消」**，不回滚（符合创作场景，用户可能想留着改）。这条要 PO 拍。

---

## 5. 四层改动切面（供后续拆刀派单，本文不实现）

| 层 | 文件 | 改动 | 回归风险 |
| --- | --- | --- | --- |
| 主进程 | `electron/main/index.ts` | `generateTextCompletion` 分叉：`stream` 为真时走 SSE fetch（body 加 `stream:true`）、逐块 `webContents.send('api:text-generation-chunk', event)`、解析 SSE `data:` 行、累积 usage、终态发 done/error/aborted | 中：非流式路径必须零改动 |
| preload | `index.ts` + `bridgeTypes.ts` | 新增 `onTextGenerationChunk(cb)` 订阅 + 退订；`ApiTextGenerationRequest` 加 `stream?` | 低 |
| 类型 | `src/types/apiProvider.ts` + `electronBridge.ts` | `stream?` 字段 + `TextStreamEvent` 类型 + 订阅方法签名 | 低 |
| bridge | `src/services/rendererBridge.ts` | `generateText` 透传 stream；新增 `onTextGenerationChunk`；**Web 兜底** `simulateTextGeneration` 也要能模拟 delta（否则无 electron 时打字机不动） | 中：Web 兜底别漏 |
| UI | `ChapterWorkbench.tsx` / useAiCheck | 挂 chunk 监听、按 requestId 过滤、拼接 delta、done 时收尾、卸载/切换时退订 | **高：串线/内存泄漏主战场** |

**SSE 解析注意（主进程）：** OpenAI 兼容流是 `text/event-stream`，每行 `data: {json}`，最后 `data: [DONE]`。要处理：TCP 分包（一个 chunk 可能含半行/多行）、`[DONE]` 哨兵、`choices[].delta.content` 取增量、usage 通常只在最后一个非-DONE 包或需 `stream_options:{include_usage:true}`（**派单要验证目标 provider 是否支持 usage-in-stream，不支持则 outputTokens 退化为按字符估算，成本会不准——这条要在实现刀里明确降级策略**）。

---

## 6. 建议拆刀顺序（派单粒度）

1. **刀 A（协议 + 主进程）：** 加 `stream?` 字段、SSE fetch 分叉、事件信封、`webContents.send`。验收：主进程能把一次真实流式调用的 delta 打到日志/事件，非流式路径回归零变化。
2. **刀 B（bridge + preload 订阅）：** 打通订阅/退订 + Web 兜底模拟 delta。验收：renderer 能收到 chunk 事件。
3. **刀 C（UI 打字机 + 取消串线）：** 一个调用点（建议先「章节评审」或「生成章节」）接流式渲染，跑通取消/切章节不串线。验收：路线图 Phase 3 两条硬口径。
4. **刀 D（推广）：** 其余调用点按需接入或保持一次性（不是所有调用都值得流式，如伏笔候选这类结构化 JSON 反而不该流式渲染）。

**不做：** 全站流式化、动效、多 Agent。刀 D 明确「按需」——结构化 JSON 输出（伏笔候选/一致性检查）流式渲染无意义，保持一次性。

---

## 7. 待 PO 拍板项

1. **取消时已渲染的半截文本**：保留+标记（建议）还是回滚清空？（§4）
2. **首个接入流式的调用点**：章节正文生成（最长、打字机收益最大）还是章节评审？（§6 刀 C）
3. **usage-in-stream 不支持时的成本降级**：按字符估算 outputTokens（成本略不准）能否接受，还是流式调用不记成本只记 tokens=0？（§5）


## 8. 拍板结论（2026-07-09）

1. **取消后的半截文本保留，不回滚。** UI 标记为“已取消”，用户可继续编辑或手动清空；取消只保证后续旧流不再写入。
2. **首个接入点选“章节正文生成”。** 这是最长文本、最符合打字机体验的路径；章节评审等结构化/半结构化输出暂不流式化。
3. **usage 缺失时走本地估算，不记 0。** 输入按 prompt 字符数估算，输出按已流式文本字符数估算；成本看板继续显示估算值，并保留“估算成本”语义。
