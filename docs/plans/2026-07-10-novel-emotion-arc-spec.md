# 情感曲线闭环 — 设计规格

**状态**：2026-07-11 已实施并完成构建与文本完整性验证。

**日期**：2026-07-10
**类型**：新增能力包（Phase 4 唯一未完成的勾选门槛）
**上游**：`docs/plans/2026-07-06-v1-roadmap-adjusted.md` 第 116 行 Phase 4 进入条件。
**基线**：`574b60b`（V1 Beta 收口已 push，数据层已验证稳定）。

---

## 0. 目标与边界

### 0.1 目标

按章节 AI 分析情绪 → 候选结果 → 用户确认 → 按 novelId 持久化 → 曲线渲染 → 重新分析。**完整闭环**，不得重加半成品入口（上轮 `11c79f4` 已删空壳假 tab）。

**Phase 4 口径（P2，不过度承诺）**：本包完成后**只解除情感曲线这一项勾选门槛**（路线图第 116 行）。Phase 4 进入还需路线图 117-120 行的其余条件——真实种子用户反馈、单用户成本与留存可观测、主流程无阻断 Bug、核心功能完善到可长期试用。本包不声称"完成即可进 Phase 4"。

### 0.2 防 AI 污染（贯穿全包，路线图风险 §144）

所有 AI 结构化写入必须 **先候选、再用户确认、后落库**。情绪分析结果先进组件 UI state（零落库），用户勾选确认后才 upsert。解析层 + 落库层双重护栏：chapterId 只认当前小说、score round+clamp、updatedAt 由落库函数生成不信任 AI。

### 0.3 明确不做（YAGNI / 后置）

- 不进 Novel schema（localStorage 落库，需导出/跨设备时再迁）。
- 不做多维情绪（首版单值+极性单折线）。
- 不做并发分析（首版顺序逐章，提速后置）。
- 不改 schema / IPC / 导出协议。
- 不碰账户 / OSS / 支付。

---

## 1. 数据模型与落库

**落库**：独立 localStorage，复用人物图谱按 novelId 模式，**不动 Novel schema / version / IPC / 导出协议**。

新建 `src/features/novel-creation/emotionArc.ts`。localStorage key：`endless-creation.novel-emotion-arcs`，结构 `Record<novelId, EmotionArc>`。

```typescript
// AI/UI 产出的裸候选（不含 updatedAt，时间戳不信任 AI）
export interface EmotionPointCandidate {
  chapterId: string;   // 由当前 chapter 注入，解析时不信任 AI 返回的 id
  score: number;       // -100~100
  reason: string;      // 一句依据
}

// 落库态（updatedAt 由 upsert 函数统一生成）
export interface EmotionPoint {
  chapterId: string;
  score: number;       // 已 round + clamp(-100,100)
  reason: string;
  updatedAt: string;
}

export interface EmotionArc {
  points: EmotionPoint[];  // 按 chapterId 索引，渲染时按 novel.chapters order 映射
  updatedAt: string;
}
```

**函数**（照抄图谱兜底范式，读取护栏更严）：

```typescript
// 读：逐字段运行时校验，不是 JSON.parse 后类型断言
export function readEmotionArc(novelId: string): EmotionArc | null;

// 写：传整个 novel 以便内部校验 chapterId 合法性；按 chapterId 合并（upsert，非整条覆盖）
// 返回 { ok, arc?, message? }：localStorage.setItem 因配额/权限抛错时 ok=false，
// 调用侧据此保留候选、显示错误，绝不误报确认成功。
export function upsertEmotionPoints(
  novel: Novel,
  points: EmotionPointCandidate[],
): { ok: boolean; arc?: EmotionArc; message?: string };
```

**落库失败语义（P1）**：`upsertEmotionPoints` 内 `try { setItem } catch { return { ok:false, message } }`。UI 确认按钮 handler 必须检查 `result.ok`——失败时**保留候选不丢弃**、显示错误提示（如「保存失败，请重试」），成功时才清候选、刷新曲线。

**落库护栏**（`upsertEmotionPoints` 内部）：
- chapterId 必须属于 `novel.chapters`，否则丢弃该点（防孤儿/AI 编造 id）。
- score 规则（越界 clamp、无效才丢，二者不重叠）：
  - **非有限数**（`Number.isFinite` 为 false：NaN / Infinity / 非数字类型）→ **丢弃该点**（真无效数据）。
  - **有限数但超范围**（如 150、999、-300）→ `Math.round` 后 `clamp(-100, 100)`，**保留**（越界但有意图，不丢）。
  - 有限数在范围内 → `Math.round`。
- reason：非字符串退空串。
- updatedAt：函数内 `new Date().toISOString()` 统一生成，**不接受候选里的任何时间戳**。
- 合并语义：传入点按 chapterId upsert 覆盖同章旧点；**未传入的章节旧点原样保留**。

**读取护栏**（`readEmotionArc` 内部）：try/catch 兜底；根非对象 / `points` 非数组退 null；逐点校验字段类型，非法点过滤。**读取的 score 规则更严（不做 clamp，只接受已合规值）**：仅接受**有限数且已位于 -100..100**的已存 score，否则**过滤该点**（已落库数据本应合规，越界值视为损坏而非修复——避免读取时静默改写历史）。reason 非字符串退空串，updatedAt 非字符串退当前时间。孤儿点（chapterId 已不在 novel.chapters）在**渲染时**过滤，不在读取时删（避免误删可恢复数据）。

**三方向 score 规则汇总（消歧）**：
| 环节 | 非有限数（NaN/非数） | 有限数越界（如 150） | 有限数合规 |
|---|---|---|---|
| AI 解析 `parseEmotionResult` | → invalid（丢弃） | round + clamp 进候选 | round 进候选 |
| 落库合并 `mergeEmotionPoints` | 丢弃该点 | round + clamp 保留 | round 保留 |
| 本地读取 `readEmotionArc` | 过滤该点 | **过滤该点**（不 clamp，视为损坏） | 接受 |

**纯合并函数 + 存储分层（P，为可测性）**：`upsertEmotionPoints` 拆成两层，把纯逻辑与 localStorage IO 分离，让自检能内存测：

```typescript
// 纯函数：无 IO，输入现有 arc + novel + 候选，输出合并后的 arc。全部护栏（chapterId 校验、
// score clamp/丢弃、reason、updatedAt 注入、按 chapterId 合并）在此。自检直接喂内存数据测这个。
export function mergeEmotionPoints(
  current: EmotionArc | null,
  novel: Novel,
  points: EmotionPointCandidate[],
  now: string,           // 由调用方传入时间戳（纯函数不自取时钟，便于自检断言）
): EmotionArc;

// IO 包装：读根 Record → 取本书 arc → mergeEmotionPoints → 写回时保留其他小说 → setItem
export function upsertEmotionPoints(
  novel: Novel,
  points: EmotionPointCandidate[],
): { ok: boolean; arc?: EmotionArc; message?: string };
```

**IO 层写回护栏（P1，防误删其他小说曲线）**：存储根是 `Record<novelId, EmotionArc>`。`upsertEmotionPoints` 必须：
1. 读整个根 Record（`allArcs`），取 `allArcs[novel.id]` 作为 current 传给 `mergeEmotionPoints`。
2. 写回时 **spread 保留其他小说**：`setItem(KEY, JSON.stringify({ ...allArcs, [novel.id]: nextArc }))`——**绝不**整根覆盖成只含本书一项。
3. `setItem` 抛错（配额/权限）→ 返回 `{ ok:false, message }`，不改内存也不误报。

**最小自检（P，照 `storeZip.ts` 的 `assertStoreZipSelfCheck` 模式）**：

```typescript
// 运行时自检：app 启动时跑一次，断言失败抛错（覆盖非平凡逻辑，防回归）
// 直接测纯函数 mergeEmotionPoints，喂内存 arc + 构造的 novel，不碰真实 localStorage
export function assertEmotionArcSelfCheck(): void;
```

覆盖硬语义（用固定 now 与内存构造的 novel，含章节 A/B/C）：
1. **部分 upsert 不删旧点**：current 含 A/B 两点，merge 只传 B → 结果仍含 A（旧点原样）、B 被更新。
2. **无效数据丢弃**：传入越界 chapterId（不在 novel.chapters）+ score=NaN + score 缺失/非数 → 这些点**丢弃**，同批合法点正常落。
3. **越界 clamp 保留**：score=150 → clamp 到 100；score=-300 → clamp 到 -100；score=33.7 → round 到 34。**越界不丢，只有非有限数才丢**（与 §1 落库护栏一致，消除"999 过滤 vs 150 clamp"矛盾）。

---

## 2. AI 分析链路

复用现有 AI 管道 `rendererBridge.generateText`。prompt 构建 + 解析放 `emotionArc.ts`，与 `characterGraph.ts` 同构。

```typescript
export type TextMessage = { role: 'system' | 'user'; content: string };

// 传 novel（受限上下文）+ chapter + 序号/总数；固定评分标尺保证各次独立调用可比较
export function buildEmotionPrompt(novel: Novel, chapter: Chapter, index: number, total: number): TextMessage[];

// 判别式联合，不返回裸 null 让调用侧猜（照 ParsedCharacterGraph 范式）
export type ParsedEmotionPoint =
  | { kind: 'ok'; point: EmotionPointCandidate }
  | { kind: 'invalid' };
// chapterId 由传入 chapter 注入，不信任 AI 返回的 id。
// score：非有限数（NaN/非数/缺字段）→ kind:'invalid'；有限数 → round + clamp(-100,100) 后进候选。
// candidate 里的 score 已是 round+clamp 后的合规值，落库合并时不会再触发丢弃。
export function parseEmotionResult(text: string, chapter: Chapter): ParsedEmotionPoint;
```

**上下文范围（P2，防每次请求重复塞全书正文）**：`buildEmotionPrompt` 的"全书上下文"**严格限定**为——作品标题、简介、蓝图、创意、章节位置（index/total）、**仅当前章正文**。当前章正文照 `characterGraph.ts` 的 `limitText` 限长（取头尾各半 + 省略号，上限比照 6000 字符量级）。**不把其他章正文塞进请求**。`index/total` 由**先按 `chapter.order` 排序后**的待分析集合计算，保证位置语义正确。

**固定评分标尺**（写死在 prompt，防各章孤立评分漂移）：
- `-100` 极度低落/压抑，`0` 中性/平稳，`+100` 极度高昂/积极；绝对值=情绪强度。
- AI 只返回 `{score, reason}`，**chapterId 始终由当前 chapter 注入**。

**执行流程**（组件层，非 emotionArc.ts）：

分析单位=逐章一次调用。全书分析=遍历所有有正文章逐次调；单章重分析=只调一章。**复用同一函数**。

1. 确定待分析章集合（全书=所有 `content.trim()` 非空章 / 单章=指定章）。无正文章不分析。
2. `runId` 自增（防迟到响应串线，照 SSE 取消防串线范式）。
3. **顺序**逐章 `generateText`（首版不并发）。每次请求：
   - `projectId: novel.id`、`requestType: 'novel.emotionArc'`（成本正确归账，字段已核对工作台现有调用支持）。
   - 携带 requestId 以便取消。
   - 响应回来先比对 runId，**不匹配（迟到）直接丢弃**。
4. 每章结果：
   - 成功 → candidate 进结果集，标记 `success`。
   - **失败** → 标记 `failed`，**继续**下一章。
   - **用户取消** → 调 `cancelTextGeneration(requestId)` 中止在途请求，**立即停**；当前章标 `canceled`，未开始章标 `unanalyzed`；已完成的留候选。
5. 跑完/取消 → 进候选预览态（§3）。

**护栏**：分析全程**零落库**，结果只进组件 UI state，确认后才 upsert。busy 期间入口按钮禁用（防并发触发）。

**卸载/切换终止（P1，防后台继续计费）**：EmotionArcPanel 随 tab 条件渲染而卸载、随 `novel.id` 变化而换书。必须：
- `useEffect` 清理函数（组件卸载时）+ `novel.id` 变化时：**递增 runId**（作废在途循环）、`cancelTextGeneration(当前 requestId)` 中止在途请求、停止逐章循环（循环体每轮开头检查 runId 是否仍为当前值，否则 break）。
- runId 用 `useRef` 持有（跨渲染稳定），循环内闭包捕获启动时的 runId 快照，与 ref 当前值比对。
- 保证切走 tab / 换小说 / 关面板后，后台不再发起或消费任何 emotionArc 请求。

---

## 3. 候选预览 + 确认 UI

**形态：预览 + 可勾除个别章 + 一次确认。**

### 3.0 面板三态

EmotionArcPanel 有三个互斥态，UI 按态切换：

- **曲线态**（默认）：显示已确认曲线 + 空态；主操作「分析情绪」（全书）；已确认/失败章点上有「重新分析本章」（§3.2.1）。
- **分析中态**：逐章进行中，显示进度（如「分析中 3/10」）+ 当前章标题；**必须提供「停止分析」按钮**——点击触发取消协议（`cancelTextGeneration(在途 requestId)` + 递增 runId + 停循环），当前章标 canceled、未开始章标 unanalyzed、已完成留候选进入候选态。分析中禁用「分析情绪」「重新分析本章」（防并发触发）。
- **候选态**：分析跑完/停止后，显示候选预览 + 清单 + 确认（§3.1-3.3）。

### 3.1 曲线预览区（SVG，零依赖，复用图谱 viewBox 手绘）

- **已确认点画实线**（读现有 arc），**当前勾选候选画虚线/浅色**叠加。零线 score=0 水平基准，正上负下。
- **虚线实时反映当前勾选项**：取消某章勾选 → 该章虚线立即消失、其旧实线保留（所见即落库）。
- **旧值优先于空缺**：失败/取消/未分析章**若已有确认值，仍画旧实线点**；只有连旧值都没有时才显示**空心缺口标记**（见下）。
- **折线不跨缺口连接**：缺口两侧不连线，不编造不存在的过渡。
- **空心缺口标记（消解"缺口不画点 vs 所有章点可重分析"矛盾）**：无任何分值的章，在其 X 轴对应位置画一个**空心占位标记**（如空心圈/浅色虚框，视觉上明确区别于实心分值点）。它**不表示 score、不参与折线连接**，但**可点击/键盘聚焦**，聚焦后弹出的详情层提供「重新分析本章」（§3.2.1）。即：所有章在 X 轴都有一个可交互标记——有分值的是实心点、无分值的是空心缺口标记——但只有实心点参与折线。

### 3.2 候选清单区（每章一行）

- 成功候选：复选框（默认勾选）+ 章节标题 + 分值 + 依据。支持全选 / 清空 / 单章取消勾选。
- 失败/取消/未分析章：只显示状态标签（「分析失败」/「已取消」/「未分析」），**不可勾选**、不参与落库。

### 3.2.1 单章重分析入口（P1，位置锁定）

单章重分析必须有真实入口，不能只在协议层存在。**入口位置锁定为「SVG 章标记详情弹出层」，单一入口不做两处**：
- **曲线态**下，点击/键盘聚焦某章的 SVG 标记（**实心分值点** 或 **空心缺口标记**，§3.1）→ 弹出该章详情（章节标题 + 分值或"暂无分值" + 依据）。详情层内提供**「重新分析本章」按钮**。
- 该详情层对**所有章标记**都有此按钮：已确认章（实心点，有分值）→ 重分析覆盖；失败/取消/未分析章（空心缺口标记，无分值）→ 同一按钮补齐缺口。**不在候选清单行、不在别处另设入口**（避免两处维护）。
- 点击 → 走 §2 同一逐章路径，只分析该章（待分析集合=单章），跑完进候选态，用户确认后 upsert 覆盖该章。
- 无正文章节的点详情里，「重新分析本章」禁用 + 提示「本章暂无正文」（与 §2 无正文不分析一致）。

### 3.3 底部操作

- 「确认落库」→ 只对**当前勾选的成功候选**按 chapterId `upsertEmotionPoints`；未勾选章、失败/取消/未分析章旧数据保留。**零勾选时禁用**。
- 「取消」→ 整批候选丢弃，零落库，回到已确认曲线态。

**语义**：确认是增量合并（upsert），不是整条替换。重分析某几章 → 只有那几章勾选项被更新，其余章历史情绪值原样保留。

---

## 4. 曲线渲染 + 入口

### 4.1 渲染（纯 SVG，零依赖）

- **X 轴**：章节顺序（按 `novel.chapters` order，非 chapterId 索引顺序）。
- **Y 轴**：score -100~100，零线居中，正上负下。
- **实线**=已确认点连线（跨缺口断开）；**虚线**=当前勾选候选。
- **章标记**：有分值章画**实心点**（参与折线），无分值章画**空心缺口标记**（§3.1，不参与折线）。二者**均三态可达**：hover + 点击 + 键盘聚焦（tabindex + focus）；`aria-label` 实心点含章节标题/分值/依据，空心标记含章节标题 + "暂无分值"。点击/聚焦弹详情层（§3.2.1 单章重分析入口）。
- **密集章**：章多时**减少 X 轴文字密度**（抽稀标签，如每 N 章一个），但**保留全部章标记**（点/缺口标记不抽稀）。
- **空态**：章节为 0 或全无情绪数据 → 空状态提示「还没有情绪分析」+ **直接提供「分析情绪」主操作**（真功能空态，非假占位）。

### 4.2 入口：恢复项目详情页「情感曲线」tab

- `PROJECT_VIEW_TABS` 恢复为 **8 项**（情感曲线与世界设定/人物关系同级，全书级分析视图）。
- **从 `8c016cc:src/app/icons.tsx` 取回 `ChartIcon` 原始字节**，不另造图标。
- 不放章节工作台（情感曲线是全书视图、逐章分析是全书操作，放单章语义不符）。

新建 `src/features/novel-creation/EmotionArcPanel.tsx` 承载分析触发 + 候选预览 + 曲线渲染，由 NovelCreation 的 emotion tab 挂载。

---

## 5. 影响文件（预估）

| 文件 | 改动 |
|---|---|
| `src/features/novel-creation/emotionArc.ts` | **新增**：类型 + mergeEmotionPoints（纯函数核）+ read/upsert（IO 层，返回 {ok,arc?,message?}）+ buildPrompt/parse + assertEmotionArcSelfCheck |
| `src/features/novel-creation/EmotionArcPanel.tsx` | **新增**：面板三态（曲线/分析中含停止/候选）+ 卸载切换终止 + 候选预览 + 单章重分析入口 + SVG 曲线 + 确认 |
| `src/features/novel-creation/EmotionArcPanel.css` | **新增**（独立文件）：SVG 曲线 / 候选清单 / 响应式 / 焦点态 / 深色态样式；不再扩大 NovelCreation.css |
| `src/features/novel-creation/NovelCreation.tsx` | 恢复 emotion tab（8 项）+ ChartIcon import + 挂载 EmotionArcPanel |
| `src/app/icons.tsx` | 从 8c016cc 恢复 ChartIcon 定义 |
| `docs/plans/2026-07-06-v1-roadmap-adjusted.md` | Phase 4 进入条件情感曲线项打勾 / 标注已实现（仅此一项，不动其余门槛） |

**不改**：`src/types/novel.ts`、`electron/preload/bridgeTypes.ts`、`electron/main/index.ts`、`src/services/rendererBridge.ts`（零 schema/IPC 改动）。

---

## 6. 验收清单

### A. 数据落库与护栏
1. 分析确认后 → 刷新 + 重启 app：情绪曲线按 novelId 保留。
2. **两本小说互不覆盖（P1）**：小说 A、B 各自分析确认 → 更新 A 的曲线不删 B 的曲线（写回 spread 保留其他 novelId），反之亦然；重启后两本都在。
3. upsert 语义：对部分章重分析确认 → 仅那些章更新，其余章旧值不变。
4. 落库合并护栏（clamp/丢弃分野）：越界 score（150/-300/999）→ **clamp 保留**到 ±100；非有限 score（NaN/非数）→ **丢弃该点**；越界 chapterId → 丢弃该点；同批合法点正常落。
5. 读取护栏：已存 score 若越界或非有限 → 读取时**过滤该点**（不 clamp，视为损坏，不静默改写历史）。
6. updatedAt 由函数生成（AI 返回的时间戳不落库）。
7. 孤儿点（章节删除后）渲染时过滤，不报错。
8. **落库失败语义（P1）**：模拟 setItem 抛错（配额/权限）→ 确认返回 ok=false、候选保留不丢、显示错误提示，不误报成功。
9. **最小自检（P2）**：`assertEmotionArcSelfCheck` 启动跑通，覆盖三条（部分 upsert 不删旧点 / 无效丢弃 / 越界 clamp 保留）；手动破坏一条断言 → 自检抛错（证明有效）。测纯函数 `mergeEmotionPoints`，不碰真实 localStorage。

### B. AI 分析链路
10. 全书分析：逐章顺序调用（先按 order 排序），成功章进候选。
11. 单章重分析：复用同一路径，只分析指定章。
12. **单章重分析入口（P1，位置锁定）**：曲线态点击/聚焦某章 SVG 标记（实心点或空心缺口标记）→ 详情弹层内「重新分析本章」按钮（所有章标记均有，无正文章禁用）；点击走单章路径、确认后 upsert 覆盖该章。入口仅此一处，候选清单行不另设。
13. 失败继续：某章 AI 失败 → 标记失败、继续后续章。
14. 取消即停：取消 → cancelTextGeneration 中止在途、当前章 canceled、后续 unanalyzed、已完成留候选。
15. **停止分析按钮（P）**：分析中态有「停止分析」按钮，点击触发取消协议、进入候选态（保留已完成）。
16. runId 防迟到：取消后旧请求迟到响应不进候选。
17. **卸载/切换终止（P1）**：分析进行中切走 tab / 换小说 / 关面板 → 递增 runId、取消在途请求、循环停止、无后续 generateText 调用（成本不再增长）。
18. 成本归账：分析后 NovelStats 看板调用数增加、requestType='novel.emotionArc'、按 novel.id 归账。
19. 分析全程零落库（确认前 localStorage 无写入）。

### C. 候选确认 UI
20. 成功候选默认全选；全选/清空/单章取消勾选可用。
21. 虚线实时反映勾选：取消勾选 → 虚线更新、旧实线保留。
22. 失败/取消/未分析章不可勾选、不参与落库。
23. 零勾选时「确认落库」禁用。
24. 取消整批 → 零落库、回已确认态。

### D. 曲线渲染 + 入口
25. 详情页 8 tab（情感曲线回归），ChartIcon 显示。
26. 实线（已确认）+ 虚线（候选）叠加、零线基准、正上负下。
27. 折线不跨缺口连接；有旧值章显示旧实线而非空缺。
28. **空心缺口标记**：无分值章画空心标记、不参与折线，但可点击/聚焦触发单章重分析；有分值章画实心点。
29. SVG 标记（实心点/空心缺口）hover/点击/键盘聚焦三态可达，aria-label 含标题/分值（或"暂无分值"）/依据。
30. 密集章 X 轴标签抽稀但全部章标记保留。
31. 空态提供「分析情绪」主操作。

### E. 技术与交付
32. `npm.cmd run build` 双端绿。
33. 文本完整性扫描通过（`~/.codex/skills/endless-creation-guardrails/scripts/scan_text_integrity.py`）。
34. `git diff --check` 通过。
35. 无 schema/IPC/导出协议改动（diff 审计四禁改文件零改动）。
36. 单个增量 commit（整包交付，不拆小刀）。
