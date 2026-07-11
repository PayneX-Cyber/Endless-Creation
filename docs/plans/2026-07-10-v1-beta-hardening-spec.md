# V1 Beta 收口包执行方案

日期：2026-07-10
定位：进入 Phase 4 前，把「种子用户能独立完成一个项目」的缺口一次性复核清楚。**只修阻断或明显体验 Bug，不新增支付/套餐/OSS，不新增功能。**
上游：`docs/plans/2026-07-06-v1-roadmap-adjusted.md` §「V1 Beta 收口包（已完成）」。
状态：**2026-07-11 已实施并完成隔离运行时验收**。代码提交 `d390c72`。

## 这一包的性质

复核 + 修阻断，不是造新功能。所以本方案不是「设计新能力」，而是把路线图钉死的 5 项范围**细化成可照着执行的复核清单**：每项写清「查哪个文件的哪条链路 / 跑什么运行时验证 / 什么算阻断必修 / 什么记录后置」。

分两类工作：
- **代码级审计**：持久化防护、成本聚合隔离、导出链路。
- **隔离运行时验收**：使用独立 Electron `userData`、本地 mock AI 服务和隐藏窗口执行整链路，不读取或写入真实 API 配置。

## 修复判定基准（贯穿全包）

- **阻断级（本包必修）**：导致数据丢失 / 串账 / 导出失败 / 白屏 / 静默失败的缺陷。
- **明显体验级（本包可修）**：不丢数据但明显影响「独立完成一个项目」的体验硬伤。
- **记录后置（本包不修，登记进路线图）**：正常单窗口手动路径不可达、或属规模化能力（多窗口并发、OSS、账户）的隐患。

---

## §1 勘察结论（2026-07-10 已完成，真实字节支撑）

三条持久化链路的落点与防护现状（读代码确认，非记忆）：

| 链路 | 落库位置 | 防护现状 | 结论 |
|------|----------|----------|------|
| 小说本体 | `electron/main/index.ts` `saveNovel` (815-835) | per-id 串行队列 `novelSaveQueues` + tmp 文件 + `fs.rename` 原子写 | **稳**。同一本并发保存被串行化，写过程原子。 |
| 人物图谱 | `NovelCreation.tsx` `saveCharacterGraph`/`readCharacterGraph` (1216-1228) | localStorage 同步 API + try/catch 兜底 + 按 novelId 隔离 | **稳**。同步无并发，解析失败退 fallback。 |
| AI usage 记录 | `electron/main/index.ts` `appendAiUsage` | 模块级串行队列 + tmp 文件 + `fs.rename` 原子写 | **已加固**，见 §2。 |

**核心发现已修复。** AI usage 已与小说本体采用相同的串行写入和原子替换策略。

## §2 已实施：AI usage 记录原子性

**位置**：`electron/main/index.ts` `appendAiUsage`。

提交 `d390c72` 完成两项最小修复：

1. 模块级 Promise 队列串行所有 append，消除同一主进程内多窗口并发覆盖。
2. 写入同目录 `.tmp` 文件后用 `fs.rename` 原子替换，避免直接重写目标文件造成截断。

队列通过 `previous.catch(() => undefined)` 从前次失败恢复，调用方仍 `await` 本次实际写入结果。

**不改的**：不动 usage 的数据结构、不分文件、不改 `loadAiUsage`/`safeRecordAiUsage`/价格表。零 schema、零 IPC 新增。

## §3 成本聚合与隔离复核

路线图 §129：真实 AI 调用后单本小说看板稳定非零，按小说聚合且不串账。

**代码级已确认**：
- `loadAiUsage(projectId)` (main:300-306) 按 `record.projectId` 过滤，`NovelStats.tsx` 按 novel.id 拉取聚合（成本看板已在上一轮改为按 novel.id 隔离，见提交历史 `dda45c1`）。
- `safeRecordAiUsage` (367-388) 无 projectId 直接 return (369)，即无 projectId 的调用不落账——确认落账口径。

**运行时结果**：本地 mock AI 并发完成三次调用，两本小说分别得到 `2 / 1` 条记录；ID 唯一，tokens 和估算成本均非零；重启后数量不变。

## §4 导出三链路复核

路线图 §128：Markdown、Word、ZIP 三条入口、结果、失败提示。

**代码级已确认**（上一轮 `11c79f4` 已把导出迁到 `novelExport.ts`，四函数 SHA-256 迁移前后一致）：
- 复制 MD / 导出 .md：空正文提示「暂无可复制/可导出的正文」。
- Word：空内容提示「暂无可导出的内容」。
- ZIP：无正文照常出带占位 + novel.json 的包（现状行为，不加拦截）。
- 三态提示：成功 / 「已取消导出」/「导出失败，请重试」；复制另有「复制失败，请手动复制」。

**运行时结果**：导出函数共验证 15 个状态断言：空内容 3、成功 5、取消 3、失败 4；Markdown、Word HTML、ZIP 文件头及正文载荷均正确。原生保存对话框外观保留为人工抽查项。

## §5 隔离狗粮结果

使用独立 Electron profile 验证，不复制真实 profile，不写真实 API 配置：

- [x] 创建两本小说并保存正文、设定、伏笔。
- [x] 本地 mock AI 并发生成三次，usage 无覆盖且按 novelId 隔离。
- [x] 关闭并重启 Electron 后，正文、设定、伏笔、图谱和 usage 均保留。
- [x] Markdown 复制、Markdown 文件、Word、ZIP 的内容和状态口径通过。
- [x] 成本记录 tokens、估算成本均非零。

原生保存对话框由 Electron 平台提供，本次未自动化其视觉点击；取消返回值及用户提示已覆盖，不影响收口结论。

## §6 实际交付

- 代码提交：`d390c72 fix: 加固 AI usage 记录持久化`。
- 代码改动仅 `electron/main/index.ts`，`16` 行变更。
- 除已修复的 usage 持久化风险外，隔离狗粮未发现新的阻断项。
- 临时 profile、mock 数据、验收脚本和隐藏窗口均已清理。

## §7 验证手段（本项目无测试框架）

- `npm.cmd run build`（renderer tsc+vite + electron tsc 双端）必绿。
- 文本完整性扫描：`python "C:\Users\x1176\.codex\skills\endless-creation-guardrails\scripts\scan_text_integrity.py" "F:\AIProject\Endless Creation\src"`。
- `git diff --check`。
- `appendAiUsage` 改动只在 `electron/main/index.ts`，不碰 renderer/schema/IPC 契约。
- 隔离 Electron profile + 本地 mock AI 服务完成 §5 自动化运行时验收。

## §8 明确不做

- 不新增功能、不新增 AI 能力、不改 schema/IPC/prompt。
- 不新增跨进程锁、分片 usage 文件或数据库；当前 Electron 单主进程队列已覆盖产品运行模型。
- 不做情感曲线（独立能力包，Beta 收口通过后再启，见路线图 Phase 4 进入条件）。
- 不碰账户/OSS/支付。
