# AI 新埋伏笔候选实施计划 —— 5d.2

规格：`docs/plans/2026-07-06-novel-foreshadowing-ai-candidates-5d2-spec.md`
类型：破 AI 结构化输出刀（AI 产结构化候选 → 用户确认 → 复用 5d.1 已证写入）。零 schema、零新 IPC、不改 `useAiCheck`。

## 白名单（只改这些）

- `src/features/novel-creation/novelPrompts.ts` — 新增 `buildForeshadowingCandidatesPrompt` + 候选宽松解析/兜底辅助
- `src/features/novel-creation/ChapterWorkbench.tsx`（**禁整文件 Read，必 grep/awk**，见 [[read-tool-corrupts-chapterworkbench]]）
- `src/features/novel-creation/ForeshadowingPanel.tsx` — 加受控 AI 建议区
- `src/features/novel-creation/ChapterWorkbench.css` — 复用 `.novel-foreshadow*` 族补样式

**不改（已核实）**：`src/types/novel.ts` / `electron/main/index.ts` / `electron/preload/bridgeTypes.ts` / `src/services/rendererBridge.ts`（零 schema、零新 IPC）。**不改 `useAiCheck`**（不复用它承载候选、不外导）。

## 现状锚点（已 grep 核实 2026-07-06）

- `busy` 聚合是单行 `||`（`ChapterWorkbench.tsx:139`）：`generatingChapterId !== null || outlineBusy || review.busy || consistency.busy || rhythm.busy || optimizeTypeOpen || optimizeJob !== null`。→ 新 `foreshadowAiBusy` 加进这行即接入「AI 忙禁用导航」。
- `cancelGeneration`（:304）显式清 `setGeneratingChapterId(null)/setOutlineBusy(false)/review.setBusy(false)/consistency/rhythm` + `cancelTextGeneration(requestId)`。→ 必补 2 要求这里补清 `foreshadowAiBusy` + 候选 state。
- `ensureTextModel(onIssue)`（:39/多处）：调用前确认模型就绪，失败走 onIssue 回调。→ 伏笔 AI 照 `ensureTextModel(setForeshadowAiError)`。
- 组件级 `runRef` / `requestIdRef` 是跨作废总闸，三套检查与生成共用。→ 伏笔 AI 复用同一对 ref（不新增 ref）。
- `createId('foreshadow')` 已是 5d.1 落库 id 前缀；候选运行时临时 key 用 `createId('foreshadow-cand')` 区分。
- `limitText`/`tailText` 在 `novelPrompts.ts:328/333`（module 内私有）→ prompt 正文长度保护复用。
- `generateText` 入口：`rendererBridge.generateText({ requestId, channelId, channelLabel, baseUrl, apiKey, model, messages, temperature, maxTokens })`，返回 `{ ok, message, text? }`（见三套检查 run 内形态）。

## Task

- [ ] **T1 — Prompt + 解析辅助（`novelPrompts.ts`）**
  - `buildForeshadowingCandidatesPrompt(novel: Novel, chapter: Chapter): TextMessage[]`：system 定位「小说伏笔识别助手」，只产新埋候选、不做回收判断，**严格输出 JSON 数组、最多 3 条**（宁缺毋滥），每条 `{ "title": string, "note": string }`，只输 JSON、无解释无代码围栏、找不到输 `[]`；user 按 §1 拼 `summary`/`blueprint`(有则)/`idea`(有则)/当前章 title+outline+content，风格照 `buildOptimizeSelectionPrompt` 的 `.filter(Boolean).join('\n')`，正文用 `limitText`/`tailText` 做上限保护。
  - **小修 1 — 解析返回判别结果（口径钉死）**：`parseForeshadowingCandidates(text: string)` **不返回裸数组**（裸数组让调用侧分不清「AI 真返回 `[]`」与「非数组/全非法」两种语义完全不同的情况）。返回判别式联合类型：
    - `{ kind: 'ok'; candidates: { title: string; note: string }[] }`——`JSON.parse` 成功、结果是数组、且**至少留下 1 条合法条目**。`candidates` 已 `.slice(0, 3)` 硬截断。
    - `{ kind: 'empty' }`——`JSON.parse` 成功、结果是数组、但**空数组或全部条目非法**（→ 调用侧显示「未识别出明显伏笔」，不显原文）。
    - `{ kind: 'invalid' }`——剥围栏后 `JSON.parse` 抛异常、或结果**非数组**（→ 调用侧显示原文降级 + 「可手动记录」）。
    解析：先剥代码围栏（```` ```json ```` / ```` ``` ````）再 `JSON.parse`；逐条 `title` 非空 string 才留、`note` string 兜底空串、非法条目丢弃。**本函数只负责解析判别，不持原文**；`invalid` 时原文由调用侧从原始 `text` 取。调用侧据 `kind` 三分支处理，**绝不靠空数组猜语义**。
  - 与 `parseOutlineText` 同文件同款容错风格。不放 `ForeshadowingPanel`。

- [ ] **T2 — ChapterWorkbench AI 候选状态机（不复用 useAiCheck）**
  - 新 state：`foreshadowAiBusy: boolean`、`foreshadowAiError: string`、`foreshadowAiRawText: string`、`foreshadowCandidates: { id: string; title: string; note: string; sourceChapterId: string }[]`。
  - **小修2 — 派生禁用原因**：`const foreshadowGenerateDisabledReason = (!activeChapter || !activeChapter.content.trim()) ? '请先选择有正文的章节' : ''`（渲染期计算，传入面板的 `aiGenerateDisabledReason`）。ChapterWorkbench 独家持有业务判断，面板只收结果串。
  - `generateForeshadowingCandidates()`：门控（无 `activeChapter` 或 `content.trim()` 为空 → 设「请先选择有正文的章节」提示、不调 AI；与派生 reason 同源，函数内仍兜底再判一次，防调用侧漏门控）→ `ensureTextModel(setForeshadowAiError)` → 记 `sourceChapterId = activeChapter.id` → 复用 `runRef`/`requestIdRef` 跨作废（同三套检查形态）→ `generateText`（messages 用 T1 prompt）→ 成功则 `parseForeshadowingCandidates`，**按返回的 `kind` 三分支处理，不靠空数组猜**：
    - `kind: 'ok'` → 候选数组附 `sourceChapterId` + `createId('foreshadow-cand')` 存入 `foreshadowCandidates`；清 `foreshadowAiRawText`/`foreshadowAiError`。
    - `kind: 'empty'`（数组为空或全部条目非法）→ 设 `foreshadowAiError`=「未识别出明显伏笔」提示；`foreshadowAiRawText` 留空（这不是解析失败，无需展原文）。
    - `kind: 'invalid'`（非数组 / JSON 解析异常）→ 设 `foreshadowAiRawText`=原始 text + `foreshadowAiError`=「未能识别为候选，可自行手动记录」。
    - 以上均不写库。`generateText` 调用本身失败（`result.ok===false` 或无 `text`）→ 设 `foreshadowAiError`=调用失败文案，不进解析。全程守 `foreshadowAiBusy`。
  - `acceptForeshadowingCandidate(candidateId)`：按 id 取候选 → 构造 `ForeshadowingDraft`（title/note，`plantedChapterId = 候选.sourceChapterId`，payoff 空）→ 调**现有** `addForeshadowing` → 从候选列表移除。
  - `dismissForeshadowingCandidate(candidateId)`：仅从候选列表移除。
  - **必补 2 — busy 聚合**：`foreshadowAiBusy` 加进 `busy`（:139 那行 `||`）。
  - **必补 2 — 取消**：`cancelGeneration`（:304）补 `setForeshadowAiBusy(false)` + 清候选 state。
  - **必补 2 — 关闭面板**：伏笔面板 `onClose` 时若 `foreshadowAiBusy` → 调 `cancelGeneration`（或等价清理）再关，杜绝隐形卡死。
  - **必补 1 — 切章清空**：`activeChapterId` 变化的 effect 里清 `foreshadowCandidates`/`foreshadowAiRawText`/`foreshadowAiError`（切章即失效）。

- [ ] **T3 — ForeshadowingPanel 受控 AI 建议区（面板不碰 AI）**
  - 新 props：`aiCandidates`、`aiBusy`、`aiError`、`aiRawText`、`aiGenerateDisabledReason`、`onGenerateAiCandidates`、`onAcceptAiCandidate`、`onDismissAiCandidate`。
  - **小修2 — 禁用原因受控 prop**：`aiGenerateDisabledReason: string`（空串=可点；非空=按钮禁用并把该串作为提示文案渲染）。**面板不自己算无章/空正文**——由 ChapterWorkbench 判断后传入（面板仍不碰业务判断）。「AI 找伏笔」按钮的 `disabled` = `aiBusy || Boolean(aiGenerateDisabledReason)`。
  - UI：手动 CRUD 列表旁加「AI 建议」区——「AI 找伏笔」按钮（`aiBusy` 禁用+转圈文案；`aiGenerateDisabledReason` 非空时禁用+显示该原因文案）、候选卡片列表（title+note+「加入记录」「忽略」）、`aiError` 提示区 + `aiRawText` 原文降级区（拆开渲染）。
  - **面板内绝不出现 `generateText`/`JSON.parse`/prompt 引用**（§7.9 grep 亲证）。
  - 顺手把面板顶部 5d.1 注释「零 AI」改成「不调 AI bridge、不解析、不落库」（渲染 AI 建议区后「零 AI」不再准确，边界实质不变）。

- [ ] **T4 — 挂载 + 样式**
  - ChapterWorkbench 里给 `<ForeshadowingPanel>` 传 8 个新 props（含 `aiGenerateDisabledReason` 派生串、`onClose` 的取消逻辑）。
  - `ChapterWorkbench.css` 复用 `.novel-foreshadow*` 族补 AI 建议区/候选卡片样式，不新建 CSS。
  - 不碰 AI 检查/optimize/outline/generation/导出/多版本/复制；不改 `deleteChapterById`。

- [ ] **T5 — 验证（主 agent 独立复核，不采信工程师汇报）**
  - build 双绿（renderer tsc+vite / electron tsc）。
  - 双目录文本扫描 + 坏文案 grep 零命中。
  - `ForeshadowingPanel` 内 `generateText`/`JSON.parse`/prompt 引用 grep 零命中（§7.9）。
  - 完整 diff 原始字节核对：未越界改 AI 检查/optimize/outline/generation/导出/多版本/删章；未改 `useAiCheck`；未动 schema/IPC。
  - **GUI 实测（PO 亲测，§7 全条）**：候选生成/确认写入重载后一致（`plantedChapterId`=sourceChapterId）/忽略/加入去重/空结果兜底/解析失败显原文/调用失败/**切章不误挂**/**门控**/**busy 聚合+取消+关闭死态**/候选≤3。

## 流程

spec commit → plan commit → 派前端工程师（派单写死白名单 + 硬警告：只改白名单 / ChapterWorkbench 禁整文件 Read 必 grep-awk / ForeshadowingPanel 不碰 AI bridge·prompt·解析 / 不改 useAiCheck / 不新增 IPC·schema / 写入只走现有 addForeshadowing / 四必补口径逐条落地）→ 主 agent 独立复核 → PO GUI 实测 → 实现 commit。

相关 [[novel-5d1-qa-status]]、[[novel-module-roadmap]]、[[feedback_mvp_scoping]]、[[novel-useaicheck-refactor-status]]、[[read-tool-corrupts-chapterworkbench]]。
