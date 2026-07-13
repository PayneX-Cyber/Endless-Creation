## Why

长篇写作中，AI 续写和一致性检查只能看到"本章尾部 + 上一章尾部"的固定字符窗口（`novelPrompts.ts` 里 1500/800/600 字截断），看不到早期章节埋下的关键设定、人物设定和伏笔。写到几十章时 AI 开始改人设、丢设定、偏离世界观。项目已有结构化的设定（`SettingEntry`）和伏笔（`Foreshadowing`），但它们目前完全不进入任何 AI prompt。本 change 让用户手动"钉住"少量关键设定/伏笔，作为固定上下文注入 AI，用最小成本缓解 AI 失忆——这是 RAG（阶段六后置）的轻量前置版，不做语义检索、不引入向量库。

## What Changes

- 用户可从已有设定/伏笔中手动勾选（钉住）少量条目作为"固定上下文"。
- 被钉住的条目在两处 AI 调用中注入 prompt：**章节续写**（`generateChapterBody`）与**一致性检查**（`consistency`）。review/rhythm/optimize 三处不注入（控制 token 成本，成本可见是项目优先级）。
- 钉选数量设**硬上限**（默认 8 条，设定与伏笔合计），达上限后禁用继续钉选并提示，防止把每次调用的 token 撑爆。
- **BREAKING（数据层）**：钉选状态进 `Novel` schema（新增 `pinnedSettingIds`、`pinnedForeshadowingIds`），version `4 → 5` 迁移。走现有 `saveNovel` 原子写，随小说本体持久化并进入导出，跨设备保留。这是本模块首次为此类"辅助态"数据破"不动 schema、走 localStorage"的既有惯例——刻意选择，以一次性还清"localStorage 数据不进导出"的债。
- 悬空引用容错：被钉的设定/伏笔若已被删除，注入时按当前存在的条目过滤跳过，不报错、不阻断生成。

## Capabilities

### New Capabilities
- `pinned-ai-context`: 用户手动钉选结构化设定/伏笔，将其作为固定上下文注入指定的 AI 调用；含钉选状态的持久化（schema v5）、硬上限、悬空引用容错、注入点范围。

### Modified Capabilities
<!-- 无。现有 openspec/specs/ 仅 ai-workflow-governance，与本 change 无关；不涉及其 spec 级需求变更。 -->

## Impact

- **Schema（BREAKING）**：`src/types/novel.ts`、`electron/preload/bridgeTypes.ts`、`electron/main/index.ts` 三份 `Novel` 接口副本同步新增两字段；`electron/main/index.ts` 增 version 4→5 迁移（老小说加载时补空数组，不丢原数据）。
- **持久化**：复用现有 `saveNovel`（temp→rename 原子写 + 按 id 串行队列），无新增 IPC 通道。
- **导出协议**：钉选字段随 Novel 进入导出（Markdown/Word/ZIP 走现有 Novel 序列化，无需专门改导出逻辑，但字段会出现在数据中）。
- **AI 调用**：`novelPrompts.ts` 的 `buildChapterFromOutlinePrompt` 与 `buildChapterConsistencyPrompt` 新增"固定上下文"段；注入内容来自当前钉选且存在的设定/伏笔。每次这两类调用的 input token 会增加（受硬上限约束）。
- **UI**：设定/伏笔的钉选入口（`SettingPanel.tsx` / `ForeshadowingPanel.tsx` 或工作台，具体入口在 design 定）。
- **成本**：注入两处调用会增加 token 消耗，已通过硬上限 + 仅注入两处控制；走现有成本追踪归账。
- **不涉及**：向量库/语义检索、新依赖、卷/场景层级、章节重排、全文搜索。
