# AI 新埋伏笔候选规格 —— 5d.2

日期：2026-07-06
类型：破 AI 结构化输出刀（第五阶段首个「AI 产结构化候选 → 用户确认 → 复用已证写入」链）。
上位：`docs/plans/2026-06-30-novel-creation-migration-plan.md` 第五阶段「伏笔记录 / 伏笔回收提醒」；直接续 5d.1（`docs/plans/2026-07-06-novel-foreshadowing-crud-5d1-spec.md` §9）。

## 背景与拆分

PO 决策：伏笔 AI 能力再拆两刀，先证新埋、再证回收。

- **5d.1（已收口）**：手动伏笔 CRUD + schema 迁移。证通「UI → saveNovel → novel.json 落盘 → 重载」整条落库链，零 AI。
- **5d.2（本刀）**：AI 新埋伏笔候选。目标只有一个——**证通「AI 读上下文 → 输出结构化候选 → 解析/兜底 → 用户点『加入记录』→ 复用 5d.1 已证通写入路径」这一条链**。只做「新埋」候选。
- **5d.3（后置，另起 spec）**：AI 回收候选 / 回收提醒。要匹配已有 planted 列表（错配风险）、确认 UI 更复杂、写入是 toggle/edit payoffChapterId 而非 add——复杂度和风险高一档，与新埋分开切。本刀不做。

只做新埋的理由（PO 已拍板，2026-07-06）：新埋候选的写入恰好是 5d.1 已证通的 `add` 路径，覆盖「AI→结构化候选→确认→写入」全链而复杂度减半；回收候选的匹配/确认/toggle 留 5d.3。

## 现状基线（已核实，2026-07-06）

- **写入路径已证通**：5d.1 的 `addForeshadowing`（`ChapterWorkbench.tsx`）→ `onUpdateNovel` → `NovelCreation.updateNovel` → 置 `dirty` + `revisionRef++` → 600ms 防抖 `saveCurrentNovel` → `novelService.saveNovel` → IPC → main。本刀「加入记录」直接复用该函数，**零新写入逻辑、零新 IPC**。
- **AI 调用入口已在**：`rendererBridge.generateText(request): Promise<{ ok; message; text? }>`，与章节评审/一致性/节奏/优化选区同一入口。本刀复用，零新 IPC。
- **`useAiCheck` 不可复用**：该 hook 注释钉死「勿外导、勿通用化、勿预埋写回」，其 `result` 是纯 `{ chapterId, content: string }`（非结构化）。候选是结构化数组，**本刀不改、不复用 `useAiCheck`**，在 `ChapterWorkbench` 另起一套 AI 候选状态机（busy/error/candidates/rawText），复用组件级 `runRef`/`requestIdRef` 跨作废语义。
- **无 AI-输出-JSON-解析先例**：全库无对 AI 文本做 `JSON.parse` 的既有代码（outline 走 `parseOutlineText` 行解析）。故本刀是首个解析 AI 结构化输出的刀，容错兜底须自建（见 §4）。
- **UI 落点已定**：5d.1 的 `ForeshadowingPanel`（工作台侧受控面板）。本刀 UI 并入该面板，但面板仍不碰 AI（见 §5）。
- **`ensureTextModel` 就绪门**：现有 AI 动作调用前用它确认文本模型就绪，本刀沿用同一门控。

## 1. AI 读取的上下文（口径钉死，PO 已拍板）

产新埋候选时喂给 AI 的上下文，严格限定：

- `activeChapter.title` / `activeChapter.outline` / `activeChapter.content`（当前章）
- `novel.summary`（小说梗概）
- `novel.blueprint`（蓝图，有则拼）
- `novel.idea`（灵感，有则拼）

**不喂**：不喂全书正文（太贵）、不喂其它章节、不喂已有 `foreshadowings` 列表（那是回收判断的料，后置 5d.3）、不做任何回收判断。

理由：只看当前章 AI 判断不了「值不值得记为伏笔」，梗概/蓝图给全局背景；全书正文 token 太贵。此边界是首刀成本/质量的平衡点，候选质量明显不够再于后续刀扩。

## 2. Prompt（`novelPrompts.ts` 新增）

新增 `buildForeshadowingCandidatesPrompt(novel: Novel, chapter: Chapter): TextMessage[]`（与现有 `build*Prompt` 同款签名与拼装风格）：

- system：定位「小说伏笔识别助手」，职责=从当前章正文里找出**作者可能想在后文回收的伏笔/线索**（埋设的悬念、被强调的物件、未解释的反常、人物暗示等），只产「新埋」候选，不做回收判断。**要求严格输出 JSON 数组，最多 3 条**（只挑最值得记的，宁缺毋滥），每条 `{ "title": string, "note": string }`：`title`=伏笔简述（短句），`note`=为什么这可能是伏笔 / 后文可怎么回收（可空串）。明确：只输出 JSON，不加解释、不加代码围栏、不加标题；找不到就输出 `[]`。
- user：按 §1 边界拼 `novel.summary` / `novel.blueprint`(有则) / `novel.idea`(有则) / 当前章 title+outline+content，风格照 `buildOptimizeSelectionPrompt`（`.filter(Boolean).join('\n')`）。正文可按现有 `limitText`/`tailText` 习惯做长度保护（避免超长；具体阈值实施定，但须有上限）。

**不做**：不产 `plantedChapterId`/`payoffChapterId`/`status`（这些由确认时代码填，见 §3）；不让 AI 碰 id / 时间戳 / 已有伏笔。

## 3. 候选 → 写入（复用 5d.1，口径钉死）

- AI 返回并解析成功 → 得到候选数组 `{ title, note }[]`，渲染为候选卡片（见 §5）。候选**仅存在于 ChapterWorkbench 运行时 state，不落库**。
- 用户点某候选的「加入记录」→ 用该候选构造 5d.1 的 `ForeshadowingDraft` 并调**现有** `addForeshadowing`：
  - `title` = 候选 title；`note` = 候选 note；
  - `plantedChapterId` = **该候选生成时所读章节的 id（`sourceChapterId`）**，**不是**接受时的 `activeChapterId`。理由：AI 生成候选后、用户点「加入记录」前可能已切换章节，若用当前 `activeChapterId` 会把候选错挂到无关章节。故每条候选在生成时记录 `sourceChapterId = activeChapter.id`，接受时读该字段（用户后续可在手动编辑里改挂，走 5d.1 已有编辑）；
  - `payoffChapterId` 空；`status` 由 `addForeshadowing` 固定写 `'planted'`。
- **切章清空候选（口径钉死）**：`activeChapterId` 变化时，清空运行时候选列表 + 原文 + 错误（候选与生成它的那一章强绑定，切章即失效，杜绝跨章误挂）。`sourceChapterId` 仅作接受时兜底的双保险，主策略是切章即清。
- 加入后该候选从候选列表移除（`onDismissAiCandidate` 同款移除，避免重复加入）。
- 用户点「忽略」→ 仅从运行时候选列表移除，不写库。
- **本刀不新增任何写入函数**：写入全部走 5d.1 已证通的 `addForeshadowing`；候选的接受/忽略只是运行时 state 增删。

## 4. 解析与兜底（本刀核心新面，口径钉死）

AI 输出解析走「宽松解析 + 失败降级」，**绝不因 AI 输出写脏数据**：

- 解析：先剥常见代码围栏（` ```json ... ``` ` / ` ``` ... ``` `）再 `JSON.parse`；要求结果是数组，逐条取 `title`(非空 string 才留) 与 `note`(string 兜底空串)；非法条目丢弃。**解析后截断至最多 3 条**（parser 侧硬上限，与 prompt 呼应，防 AI 无视指令吐十几条脏 UI）。
- **解析成功但为空数组** → 显示「AI 未从本章识别出明显伏笔」提示，不报错、不写库。
- **解析失败 / 结果非数组 / 全部条目非法** → **显示 AI 原始文本** + 明确提示「未能识别为候选，可自行手动记录」，**不写库、不崩**（照 5d.1 spec §9 原则）。
- AI 调用本身失败（`result.ok===false` 或无 `text`）→ 显示 `aiError` 文案（如「AI 生成失败，请稍后重试。」），不写库。
- 解析辅助函数放 `novelPrompts.ts`（与 `parseOutlineText` 同文件同款容错风格），或 `novelShared.ts`；不放 `ForeshadowingPanel`（面板不碰解析）。

## 5. UI 与组件边界（PO 已拍板，2026-07-06）

**落点：并入 5d.1 的 `ForeshadowingPanel`，单入口；但 AI 调用/解析/状态全留在 `ChapterWorkbench`，面板不碰 AI。**

- 职责切分（关键边界）：
  - `ChapterWorkbench.tsx` 持有 AI 候选状态机（busy / error / candidates / rawText）、调 `generateText`、调解析、构造 draft 调 `addForeshadowing`。与三套 AI 检查同一层。
  - `ForeshadowingPanel.tsx` **仍是受控组件，绝不接触 AI bridge / prompt / 解析 / JSON**。只多接几个 props 渲染「AI 建议」区：
    - `aiCandidates: { id: string; title: string; note: string }[]`（运行时候选，id 为运行时临时 key；`sourceChapterId` 由 ChapterWorkbench 侧状态持有并在接受时使用，不必透传进面板渲染）
    - `aiBusy: boolean`
    - `aiError: string`（解析失败/调用失败的提示文案）
    - `aiRawText: string`（**口径钉死**：解析失败时 AI 的原始输出原文，独立 prop，不与 `aiError` 混塞；面板在原文降级区渲染。解析成功或无原文时为空串。之所以拆成独立 prop：错误提示文案与 AI 原文语义不同，混进一个字段会让面板难以分别渲染「提示」与「原文块」）
    - `onGenerateAiCandidates: () => void`
    - `onAcceptAiCandidate: (candidateId: string) => void`
    - `onDismissAiCandidate: (candidateId: string) => void`
- 面板 UI：在现有手动 CRUD 列表之上/之下加「AI 建议」区——一个「AI 找伏笔」按钮（`aiBusy` 时禁用+转圈文案）、候选卡片列表（每卡片显示 title + note + 「加入记录」「忽略」两个按钮）、错误/原始文本降级显示区。
- 候选卡片点「加入记录」→ `onAcceptAiCandidate` → ChapterWorkbench 走 `addForeshadowing`；点「忽略」→ `onDismissAiCandidate`。
- 样式并入 `ChapterWorkbench.css`（复用 5d.1 的 `.novel-foreshadow*` 命名族），不新建 CSS。
- **busy 聚合（口径钉死）**：伏笔 AI 忙碌状态（记为 `foreshadowAiBusy`）**必须并入组件级全局 `busy`**（与章节评审/一致性/节奏/优化选区/生成同一 `busy` 聚合），使「AI 忙碌禁用工作台导航」（dc8c9bd 已立规矩）对本刀同样生效——不得让伏笔 AI 请求游离于全局 busy 之外。
- **取消语义（口径钉死）**：现有 `cancelGeneration`（跨作废总闸）**必须同时清 `foreshadowAiBusy`**（连同候选运行时 state），复用组件级 `runRef`/`requestIdRef` 跨作废语义；不得只清三套检查而漏掉伏笔 AI，否则取消后全局 busy 隐形卡死。
- **关闭面板行为（口径钉死）**：关闭「伏笔记录」面板时若伏笔 AI 正在跑，**必须取消该请求并清 `foreshadowAiBusy`**（走 `cancelGeneration` 或等价路径）。杜绝「面板已关、全局 busy 仍被伏笔 AI 隐形占用、导航永久禁用」的死态。
- **并发防护**：`foreshadowAiBusy` 时「AI 找伏笔」按钮禁用 + 转圈文案，避免并发多请求。
- **无章/空正文门控（口径钉死）**：工作台未选章节、或当前章正文为空（`activeChapter` 不存在或 `content.trim()` 为空）时，「AI 找伏笔」**不可生成**——按钮禁用并显示「请先选择有正文的章节」提示，**不调用 AI**（喂空正文既产不出有意义候选又白耗 token）。手动 CRUD 不受此门控影响，无章也能记伏笔。

## 6. 严格边界（不做什么）

- **只做新埋候选**：不产回收候选、不匹配已有伏笔、不 toggle/edit payoffChapterId、不做回收提醒。全部后置 5d.3。
- 不改 `useAiCheck`、不复用它承载候选、不外导它。
- 不新增写入函数：写入只走 5d.1 已证通的 `addForeshadowing`。
- 不新增 IPC；不动 schema（5d.1 已加 `foreshadowings` / `version:4`，本刀零 schema 改动）。
- 不改删章逻辑、不动章节/多版本/大纲/生成/导出/优化选区/复制。
- 面板不碰 AI bridge / prompt / 解析。
- 不做候选去重跨会话记忆、不做候选质量评分、不做批量一键全加（逐条确认）。
- 不进蓝图导航（3a.2 已定导航只放 3 真实项）。

## 7. 验收

AI→候选→确认→写入链是本刀主证目标：

1. **候选生成**：当前章有内容 → 点「AI 找伏笔」→ 出现候选卡片（title+note），过程 `aiBusy` 有反馈。
2. **确认写入（复用 5d.1 落库）**：点某候选「加入记录」→ 该条出现在手动伏笔列表（`plantedChapterId`=**生成时章节 `sourceChapterId`**、`status`=planted）→ 关闭重开 / 重载小说 → 伏笔仍在（证走通 5d.1 落库链）。
3. **切章不误挂（必补 1）**：在 A 章生成候选 → 切到 B 章 → 候选列表清空（切章即清）；即便边界情形绕过清空，接受时也按 `sourceChapterId`=A 挂载，绝不挂到 B。
4. **忽略**：点「忽略」→ 候选消失、不写库。
5. **加入后去重**：已「加入记录」的候选从候选列表移除，不可重复加入。
6. **候选上限（必补 4）**：即便 AI 吐超过 3 条，UI 也最多渲染 3 条（parser 侧硬截断亲证）。
7. **无章/空正文门控（必补 3）**：未选章节或当前章正文为空时，「AI 找伏笔」按钮禁用 + 显示「请先选择有正文的章节」，点击不触发任何 AI 调用；手动 CRUD 不受影响。
8. **空结果兜底**：AI 返回 `[]` → 显示「未识别出明显伏笔」提示，不报错、不写库。
9. **解析失败兜底**：AI 返回非法 JSON / 非数组 → 显示原始文本 + 「可手动记录」提示，不崩、不写库。
10. **AI 调用失败兜底**：generateText 失败 → 显示错误文案，不写库。
11. **busy 聚合 / 取消 / 关闭死态（必补 2）**：伏笔 AI 忙时全局导航按现有规矩禁用；`cancelGeneration` 后 `foreshadowAiBusy` 清零、导航恢复；AI 跑动中关闭伏笔面板 → 请求取消、`foreshadowAiBusy` 清零、无隐形卡死。
12. **面板边界**：`ForeshadowingPanel` 内无 `generateText`/`JSON.parse`/prompt 引用（grep 亲证）。
13. **零回归**：手动伏笔 CRUD（5d.1）+ 章节评审/一致性/节奏/优化选区/复制/导出/多版本 入口与行为不变；`deleteChapterById` 逐字未动。
14. build 双绿（renderer tsc+vite / electron tsc）。
15. 双目录文本扫描 + 坏文案 grep 零命中。
16. 完整 diff 原始字节核对：未越界改 AI 检查/optimize/outline/generation/导出/多版本/删章；未改 `useAiCheck`；未动 schema。

## 8. 文件清单（白名单，PO 已拍板）

1. `src/features/novel-creation/novelPrompts.ts` — 新增 `buildForeshadowingCandidatesPrompt` + 候选解析/兜底辅助函数（宽松 JSON 解析）
2. `src/features/novel-creation/ChapterWorkbench.tsx` — AI 候选状态机（busy/error/candidates/rawText）+ 调 generateText + 调解析 + 构造 draft 走**现有** `addForeshadowing` + 向 `ForeshadowingPanel` 传 AI props；**禁整文件 Read，必 grep/awk**（见 [[read-tool-corrupts-chapterworkbench]]）
3. `src/features/novel-creation/ForeshadowingPanel.tsx` — 加 AI 建议区（受控，只接 props 渲染候选/busy/error/原文；**绝不碰 AI bridge / prompt / 解析**）；顺手把 5d.1 面板顶部注释「零 AI」改成准确口径「不调 AI bridge、不解析、不落库」（面板本刀起会渲染 AI 建议区，「零 AI」已不准确，但边界实质不变——仍不主动调 AI/解析/写库）
4. 样式：并入 `src/features/novel-creation/ChapterWorkbench.css`（复用 `.novel-foreshadow*` 族），不新建 CSS

**不改（已核实）**：`src/types/novel.ts` / `electron/main/index.ts` / `electron/preload/bridgeTypes.ts` / `src/services/rendererBridge.ts`——本刀零 schema 改动、零新 IPC，写入复用 5d.1 已证通函数。

## 9. 后置（5d.3 及以后）

- **5d.3 AI 回收候选 / 回收提醒**：AI 读正文 + 未回收（planted）列表 → 输出「回收候选」并匹配回具体伏笔 → 用户确认 → 走 5d.1 的 toggle/edit（`status:'paidOff'` + `payoffChapterId`）。含匹配错配处理、回收确认 UI。
- 伏笔回收提醒的主动化（章节生成时提示）、关系图、资产库联动、时间线——各自独立，均不在伏笔刀内。

相关 [[novel-module-roadmap]]、[[feedback_mvp_scoping]]、[[novel-5d1-qa-status]]、[[novel-useaicheck-refactor-status]]、[[read-tool-corrupts-chapterworkbench]]。
