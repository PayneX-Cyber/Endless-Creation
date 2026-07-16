# Comet Design Handoff

- Change: add-chapter-scene-structure
- Phase: design
- Mode: compact
- Context hash: 0a47e15930724b319cad1147dd86637cba40f1dd67d675fa2c28019a9c06c984

Generated-by: comet-handoff.sh

OpenSpec remains the canonical capability spec. This handoff is a deterministic, source-traceable context pack, not an agent-authored summary.

## openspec/changes/add-chapter-scene-structure/proposal.md

- Source: openspec/changes/add-chapter-scene-structure/proposal.md
- Lines: 1-37
- SHA256: f1bba2ac9656dce90e9c3456f3e9164ff6da4230d61c6bdf1c5a0206b72e5b83

```md
## Why

小说正文当前唯一权威模型是扁平的 `Chapter.content`，用户只能在章粒度码字，无法按场景组织与写作。项目已从 MVP 转为生产级长期使用，需要交付完整的 Novel → Volume → Chapter → Scene 四级写作能力。卷层已由 `add-novel-volume-structure`（schema v7）交付，本 change 承接路线的第二步：把正文权威模型下沉到场景。

## What Changes

- **BREAKING（数据层）**：`Novel` schema 从 version 7 升至 version 8；`Chapter` 新增 `scenes: Scene[]`。
- **BREAKING（数据层）**：删除 `Chapter.content` 字段；正文权威模型下沉为 `Scene.content`。v7 的 `content`、`versions[]`、`selectedVersionId` 原样迁入该章的默认 Scene。
- 新增章内场景的创建、重命名、排序与删除；每章恒定至少保留一个场景（迁移、新建章、删除场景三处守卫）。
- 定义统一场景展开顺序 `orderedScenes(chapter)`，成为章内正文与场景的唯一展开入口。
- 编辑器改为分场景编辑：`activeSceneId` 为实际编辑目标，撤销/重做历史按 `sceneId` 隔离，切换/排序/删除场景不串栈。
- AI 流式续写、版本历史（`ChapterVersion` 快照）、版本预览与写回全部下沉为场景粒度。
- 字数/进度、导出、Prompt 前文上下文、分析输入统一改为按 `orderedScenes(chapter)` 聚合章内正文。
- 跨章全文搜索纳入场景标题/大纲/正文，结果携带章号、场景号与瞬时 `sceneId`；正文命中先激活章与场景，再在对应场景 textarea 选中定位。
- v7→v8 迁移不虚构场景结构：默认场景持久化标题留空，UI 派生显示"场景 N"。
- 不新增场景专用 IPC，继续通过现有 `saveNovel(novel)` 整体持久化链保存；不新增第三方依赖。

## Capabilities

### New Capabilities

- `chapter-scene-structure`: 场景数据模型、v7→v8 兼容迁移、场景 CRUD/排序、`orderedScenes` 统一展开、分场景编辑与撤销栈隔离、场景级版本历史与 AI 续写、章内至少一场景不变量。

### Modified Capabilities

- `chapter-find-replace`: 查找与替换的作用目标从 `Chapter.content` 改为当前激活场景的 `Scene.content`。
- `chapter-undo-history`: 撤销/重做历史栈的隔离键从 `chapterId` 改为 `sceneId`；"切章清栈"扩展为切换场景即清栈，删除当前场景时仅清除该场景历史并激活相邻场景。
- `chapter-search`: 搜索范围纳入场景标题/大纲/正文，结果携带场景号与瞬时 `sceneId`，正文命中定位落到具体场景 textarea；章级命中切章后默认激活首个场景。

## Impact

- **Schema / 持久化**：同步修改 renderer、preload、main 三份 `Novel`/`Chapter` 类型与主进程 `sanitizeNovel`，新增 `Scene` 接口；version 7→8。Electron `sanitizeNovel` 与 Web `normalizeWebNovel` 迁移语义必须对称一致。复用现有整本 Novel 保存与原子写入，不新增 IPC。
- **前端编辑器**：`ChapterWorkbench` 改为分场景编辑，新增 `activeSceneId` 会话态与场景管理 UI；撤销/重做栈按 `sceneId` 隔离。
- **正文消费者**：删除 `Chapter.content` 后，导出、字数/进度、Prompt 前文上下文、分析输入、搜索等全部改读 `orderedScenes(chapter)` 聚合结果；由 TypeScript 编译期强制迁移所有消费点。
- **兼容性（锚点红线）**：伏笔 `plantedChapterId`/`payoffChapterId`、`EmotionPoint.chapterId`、人物图谱继续锚定 `chapterId`，本 change 不新增持久化 `sceneId` 引用；搜索结果中的 `sceneId` 仅为瞬时导航标识，不落库。分析输入按章内场景聚合，锚点粒度保持 chapter 级。
- **会话态**：`activeChapterId`/`activeSceneId` 均为 React 会话状态，不落库；重新打开小说默认激活首章首场景。
- **非目标**：不做跨章节移动场景（仅章内 CRUD/排序），不改卷层，不新增持久化场景级锚点，不新增依赖，不做 v8→v9。

```

## openspec/changes/add-chapter-scene-structure/design.md

- Source: openspec/changes/add-chapter-scene-structure/design.md
- Lines: 1-89
- SHA256: bb8d869725956e3232578a2e7fa58d97a3680875bc1c256525298943e5053728

[TRUNCATED]

```md
## Context

本 change 是小说结构生产级升级的第二刀。第一刀 `add-novel-volume-structure`（已归档）落地了 Novel → Volume → Chapter 层级，只加卷元数据、不碰 `chapterId` 与 `chapter.content` 正文契约，为本刀铺路。本刀把正文权威模型从 `Chapter.content` 下沉到 `Scene.content`，交付完整四级写作能力（Novel → Volume → Chapter → Scene），并做 v7→v8 迁移。WHY 见 proposal.md。

设计承接路线约束："每次迁移只重写一层锚点，避免一步同时动两层"。change 1 只动了归属元数据；本刀只动正文这一层，叙事分析锚点（伏笔/情感点/图谱）刻意保持 chapter 级不动。

## Goals / Non-Goals

### Goals

- `Scene.content` 成为唯一正文权威模型；`Chapter.content` 字段彻底删除。
- 交付章内场景 CRUD/排序与分场景编辑体验（真四级写作，非四级大纲）。
- v7→v8 迁移：v7 章节正文/版本/选中版本整体迁入该章的默认场景。
- 所有正文消费者（编辑器、版本历史、AI 续写、导出、字数/进度、Prompt 上下文、搜索定位、分析输入聚合）统一改从场景展开结果取正文。
- 守住不变量 `∀ chapter，chapter.scenes.length ≥ 1`。

### Non-Goals

- 不做跨章节移动场景（仅章内 CRUD/排序）。
- 不新增持久化叙事锚点到场景：伏笔 `plantedChapterId`/`payoffChapterId`、`EmotionPoint.chapterId`、人物图谱仍只锚 `chapterId`。搜索定位用的 `sceneId` 是瞬时导航标识，不落库。
- 不保留 `Chapter.content` 派生字段。
- 不改卷层，不新增卷/场景专用 IPC，不新增第三方依赖。
- 不持久化编辑落点（`activeChapterId`/`activeSceneId` 均为会话态）。

## Decisions

### Decision 1: 正文权威下沉到 Scene，彻底删除 `Chapter.content`（A1）

**决定**：`Scene.content` 是唯一正文真相；`Chapter` 不再有 `content` 字段。所有消费者改读章内场景展开结果的聚合。

**理由**：让 TypeScript 编译器充当"消费者清单"——删字段后所有未迁移处直接编译红，比 grep 97 处引用可靠。且单一真相源，杜绝"写章还是写场景"的持续歧义。

**否决的备选**：
- A2「保留 `Chapter.content` 为 `@deprecated` 派生聚合值」——编译不报错，靠人肉查漏，且制造双写源漂移风险（正是 change 1 review 反复警惕的那类问题）。
- 「场景仅元数据、正文仍留 Chapter」（过渡层）——等于四级大纲而非四级写作，未兑现路线承诺，且未来仍需二次正文下沉迁移，双迁移换一次能力，不划算。用户已明确否决。

### Decision 2: 每章至少一个场景，作为全生命周期不变量

**决定**：`chapter.scenes.length ≥ 1` 恒成立，由三处守卫保证——迁移每章建默认场景（含空章）、新建章节同步建默认场景、删除场景删到最后一个时禁删。

**理由**：若只在迁移时保证，用户删光章内场景又会打回零场景状态，"第二套空章编辑逻辑"从后门复活。全程不变量让编辑器只需处理"≥1 场景"一种形态，`orderedScenes(chapter)[0]` 永远存在，`activeSceneId` 永远有合法落点。

**默认场景命名**：持久化标题留空，不虚构叙事名；UI 派生显示"场景 N"。承接 change 1"迁移不虚构第一卷"的克制原则。

### Decision 3: 分析锚点保持 chapter 级，正文粒度与分析粒度刻意不同

**决定**：伏笔、情感点、人物图谱继续只锚 `chapterId`；分析输入按章内场景顺序聚合正文喂入。本 change 不新增任何持久化 `sceneId` 引用。

**理由**：情感曲线、伏笔本是章节尺度的叙事分析，下沉到场景无产品必要，却会叠加"重建所有业务锚点引用"的地震式风险。守住这条，本刀才不失控。将来确有场景级伏笔需求，再加可选 `sceneId` 并保留父级 `chapterId`。

### Decision 4: 撤销/重做栈按 sceneId 隔离

**决定**：编辑器保留 `activeChapterId`（章容器/导航）与 `activeSceneId`（实际编辑目标）两个会话态；撤销/重做历史按 `sceneId` 隔离。切换/排序/跨场景操作不串栈；删当前场景仅清该场景历史并激活相邻场景。

**理由**：正文权威已在场景粒度，撤销栈若仍锚章级会跨场景串栈。这是正文下沉的必然连带改造。

**承接**：现有 `chapter-undo-history` 能力的"切章清栈"语义扩展为"切场景清栈/隔离"。

### Decision 5: 统一场景展开入口 `orderedScenes(chapter)`

**决定**：新增单一场景展开函数，类比 change 1 的 `orderedChapters(novel)`。所有需要"章内正文先后关系"的消费者（导出、Prompt 上下文、字数、搜索、分析聚合）统一经它展开，不得各自按 `scene.order` 散排。

**理由**：change 1 已验证"单一展开入口 + 消费者收敛"能根除顺序不一致。正文下沉沿用同一套路。

### Decision 6: 复用现有 schema 四副本对称 + Electron/Web 迁移对称

**决定**：`Scene` 接口 + `Chapter.scenes[]` 同步进四份协议副本（renderer 类型 / preload / main / rendererBridge）；Electron `sanitizeNovel` 与 Web `normalizeWebNovel` 两端 v7→v8 迁移语义必须逐条一致。版本号升 v8。持久化复用现有 `updateNovel → saveNovel` 链，不新增 IPC。

**理由**：change 1 review 抓出的最主要缺陷类别就是四副本/两端迁移不对称。作为硬约束前置。

## Risks / Trade-offs

- **改动面大（97 处 content 消费者）**：靠 Decision 1 删字段 + tsc 兜底找全，但仍是本刀最大工作量与回归面。接受，用编译期强制迁移换取无遗漏。
- **大 tsx 文件（ChapterWorkbench/NovelCreation）Read 会渲染幻影字节**：改动须靠 Grep 锚 ASCII 行 + tsc 验证，不硬怼多行插入。已知约束，工具层规避。
- **撤销栈按场景隔离的边界**（删当前场景、跨场景切换、场景排序）易出串栈 bug：留到 Design Doc 精确设计数据结构与清栈时机。
- **迁移不可逆性**：v8 删除 `chapter.content` 后无法自动回退 v7。接受（本地文件用户可自行备份，且 change 1 同样是单向迁移）。

## Migration Plan

- **数据**：v7 → v8。每个 chapter 建恰好一个默认场景；有正文章的 `content`/`versions`/`selectedVersionId` 整体搬入默认场景，空章建空默认场景。缺失/损坏 `scenes` 归一为"含一个空默认场景"。不虚构场景标题。

```

Full source: openspec/changes/add-chapter-scene-structure/design.md

## openspec/changes/add-chapter-scene-structure/tasks.md

- Source: openspec/changes/add-chapter-scene-structure/tasks.md
- Lines: 1-42
- SHA256: d0a10abe569ea3b18a88b71bcb924ed03aca6cf49bc5c5e83d0803306a934629

```md
## 1. Scene schema v8 与兼容迁移

- [ ] 1.1 在 `src/types/novel.ts`、`electron/preload/bridgeTypes.ts`、`electron/main/index.ts` 同步新增 `Scene` 接口与 `Chapter.scenes: Scene[]`，删除 `Chapter.content` 字段，并将 Novel version 从 7 升为 8；`ChapterVersion`、`selectedVersionId` 随正文一并下沉到 `Scene`
- [ ] 1.2 扩展主进程 `sanitizeNovel`：v7 每个 chapter（含空章、仅大纲无正文章）建恰好一个默认 Scene，v7 的 `content`/`versions`/`selectedVersionId` 原样迁入默认场景；默认场景持久化标题留空；损坏/缺失 scenes 归一为至少一个空场景，场景 order 按分组归一
- [ ] 1.3 更新 Electron `createNovel`/`createChapter` 与 renderer Web fallback 的 `normalizeWebNovel`：新章初始化恰好一个默认场景、version 8；Web 与 Electron 迁移语义对称一致

## 2. orderedScenes 与场景结构纯函数

- [ ] 2.1 新建独立小模块实现 `orderedScenes(chapter)`：场景按 order 升序、order 相同以原数组位置稳定兜底；不原地修改入参
- [ ] 2.2 在同一模块实现场景创建/重命名/排序/安全删除，以及默认场景初始化的共用逻辑；删除到最后一个场景时拒绝（保证 `scenes.length ≥ 1`）；所有入口共用同一 order 归一逻辑
- [ ] 2.3 实现章内正文聚合 `chapterText(chapter)` = `orderedScenes` 正文按序拼接，供字数/导出/Prompt/分析统一消费
- [ ] 2.4 为场景纯函数补充项目现有风格的自检，覆盖默认场景不变量、稳定排序、组内 order 归一、删到最后一个被拒、迁移聚合

## 3. 分场景编辑器与撤销栈隔离

- [ ] 3.1 `ChapterWorkbench` 改为分场景编辑：新增 `activeSceneId` 会话态，切章默认激活首场景，场景切换切换编辑目标
- [ ] 3.2 场景管理 UI：章内场景列表、新建/重命名/排序/删除，最后一个场景删除按钮禁用，控件具备明确 aria-label
- [ ] 3.3 撤销/重做历史栈隔离键从 `chapterId` 改为 `sceneId`：切换场景即清栈，删除当前场景仅清除该场景历史并激活相邻场景，跨场景/跨章不串栈
- [ ] 3.4 查找/替换作用目标改为当前激活场景的 `Scene.content`，替换写入进该场景历史栈

## 4. 场景级版本历史与 AI 续写

- [ ] 4.1 版本历史（`ChapterVersion` 快照）、`selectedVersionId`、版本预览与写回全部下沉为场景粒度
- [ ] 4.2 AI 流式续写落到当前激活场景，写回与取消防串线按 scene 粒度；AI 写回不进撤销栈保持不变

## 5. 正文消费者编译期迁移

- [ ] 5.1 删除 `Chapter.content` 后，`novelExport`、`novelProgress`/`NovelStats` 字数、`novelPrompts` 前文上下文改读 `chapterText(chapter)` 聚合；`NovelSummary.wordCount`/`filledChapterCount` 按场景聚合重算
- [ ] 5.2 `characterGraph`、`emotionArc` 分析输入改按 `orderedScenes` 聚合章内正文；伏笔 `plantedChapterId`/`payoffChapterId`、`EmotionPoint.chapterId`、图谱锚点保持 chapterId 不变，本 change 不新增持久化 sceneId 引用
- [ ] 5.3 全仓扫描并消灭残留 `chapter.content` 直接引用，由 tsc 编译期兜底确认所有消费点已迁移

## 6. 搜索纳入场景与场景内定位

- [ ] 6.1 跨章搜索扫描范围纳入场景标题/大纲/正文，结果携带章号、场景号与瞬时 `sceneId`（不落库）
- [ ] 6.2 正文命中定位：先激活章与对应场景，再在该场景 textarea 选中并滚动到命中位置；章级/大纲命中仅切章并默认激活首场景；定位失效不报错

## 7. 验证与交付

- [ ] 7.1 运行 `npm.cmd run build`，确保 renderer tsc + Vite 与 Electron tsc 全部 exit 0
- [ ] 7.2 运行文本完整性扫描 `python "C:\Users\x1176\.codex\skills\endless-creation-guardrails\scripts\scan_text_integrity.py" "F:\AIProject\Endless Creation\src"` 得 `TEXT INTEGRITY OK`；`git diff --check` 无空白错误
- [ ] 7.3 GUI 真机验收 spec 场景：v7→v8 迁移（含空章）、场景 CRUD/删到最后一个禁删、分场景编辑与撤销栈隔离、AI 续写/版本 scene 粒度、字数/导出/Prompt/分析按场景聚合、搜索场景内定位、重启持久化默认激活首章首场景、分析锚点仍按 chapterId
- [ ] 7.4 逐项勾选 tasks 后，仅提交本 change 的源文件与 artifacts，保持平台/工具未跟踪目录不入库，并以单个 coherent feature commit 收口

```

## openspec/changes/add-chapter-scene-structure/specs/chapter-find-replace/spec.md

- Source: openspec/changes/add-chapter-scene-structure/specs/chapter-find-replace/spec.md
- Lines: 1-47
- SHA256: 6efbbfef71539ea237f6a505eca2d91ef651ba0aaa7827c3aae59fcb413466e9

```md
## MODIFIED Requirements

### Requirement: 章内查找

系统 SHALL 为当前激活场景的正文提供查找入口，接受关键词，在该场景 `content` 中定位所有匹配项。系统 MUST 标示匹配总数与当前项序号，并支持在匹配项之间逐个跳转。查找为纯读操作，MUST NOT 修改正文。

#### Scenario: 关键词命中多处

- **WHEN** 用户在查找框输入一个在当前激活场景正文中多次出现的关键词
- **THEN** 系统标示匹配总数
- **AND** 定位到第一个匹配项并在正文中选中/高亮该处

#### Scenario: 逐个跳转

- **WHEN** 存在多个匹配项，用户点击"下一个"/"上一个"
- **THEN** 系统在匹配项之间移动当前项，并在正文中选中/高亮当前匹配

#### Scenario: 无匹配

- **WHEN** 关键词在当前激活场景正文中不存在
- **THEN** 系统显示无匹配提示，不选中任何位置

#### Scenario: 空关键词

- **WHEN** 查找关键词为空或仅空白
- **THEN** 系统不执行查找，不产生匹配结果

### Requirement: 章内替换

系统 SHALL 支持替换当前匹配项与全部替换。替换仅作用于当前激活场景的 `content`，MUST NOT 跨场景或跨章。替换后的正文变更 SHALL 经现有场景正文自动保存链持久化。

#### Scenario: 替换当前项

- **WHEN** 存在当前匹配项，用户输入替换文本并点击"替换"
- **THEN** 系统仅替换当前匹配项，正文更新
- **AND** 自动定位到下一个匹配项（若有）

#### Scenario: 全部替换

- **WHEN** 用户点击"全部替换"
- **THEN** 系统将当前激活场景正文中所有匹配项替换为替换文本
- **AND** 正文更新并经自动保存链持久化

#### Scenario: 替换后可撤销

- **WHEN** 用户执行一次替换（当前项或全部）后按撤销
- **THEN** 该替换作为一步被撤销，正文恢复到替换前

```

## openspec/changes/add-chapter-scene-structure/specs/chapter-scene-structure/spec.md

- Source: openspec/changes/add-chapter-scene-structure/specs/chapter-scene-structure/spec.md
- Lines: 1-157
- SHA256: a3937225113dc0ebe863763ef437448e607c3d138689d4033d3f2aaa75776025

[TRUNCATED]

```md
## ADDED Requirements

### Requirement: 场景数据模型与 v7→v8 兼容迁移

系统 SHALL 将小说 schema 升级为 version 8，为 `Chapter` 增加 `scenes: Scene[]`，并删除 `Chapter.content` 字段。正文权威模型 MUST 下沉为 `Scene.content`。既有 `chapterId` 及其业务引用（伏笔、情感点、人物图谱）MUST 保持不变，本 change MUST NOT 新增任何持久化的 `sceneId` 业务锚点。

#### Scenario: 有正文章节迁移到默认场景

- **WHEN** 系统加载一部 version 7 且某章含 `content`、`versions[]`、`selectedVersionId` 的小说
- **THEN** 系统将该章归一为 version 8，并创建恰好一个默认场景
- **AND** 该章的 `content`、`versions[]`、`selectedVersionId` 原样迁入该默认场景
- **AND** 章上的 `content` 字段被移除

#### Scenario: 空章节迁移到空默认场景

- **WHEN** 系统加载一部 version 7 且某章 `content` 为空的小说
- **THEN** 系统为该章创建一个 `content` 为空串的默认场景
- **AND** 不虚构场景标题（持久化标题留空）

#### Scenario: 场景数据缺失或损坏

- **WHEN** 章节的 `scenes` 缺失、不是数组或包含非法场景条目
- **THEN** 系统丢弃非法条目
- **AND** 若清理后该章没有任何场景，系统补建一个空默认场景，保证每章至少一个场景
- **AND** 小说仍可正常加载和编辑

#### Scenario: 章节锚点保持稳定

- **WHEN** 小说从 v7 迁移到 v8 或场景在章内增删/排序
- **THEN** 章节 id、伏笔引用、情感曲线点与人物图谱引用均不被重建或改写
- **AND** 分析输入按该章场景顺序聚合正文，锚点粒度保持 chapter 级

### Requirement: 每章至少一个场景不变量

系统 SHALL 在迁移、新建章节与删除场景所有路径上保证每个章节恒定至少包含一个场景（`chapter.scenes.length >= 1`）。编辑器 MUST NOT 需要处理零场景章节的分支。

#### Scenario: 新建章节初始化默认场景

- **WHEN** 用户新建一个章节
- **THEN** 系统为该章初始化恰好一个空默认场景
- **AND** 复用与迁移一致的默认场景初始化逻辑

#### Scenario: 禁止删除最后一个场景

- **WHEN** 某章仅剩一个场景
- **THEN** 该场景的删除操作不可用
- **AND** 章节始终保留至少一个场景

### Requirement: 统一场景展开

系统 SHALL 通过 `orderedScenes(chapter)` 按 `Scene.order` 升序展开章内场景，作为章内正文与场景顺序的唯一入口。所有依赖章内正文或场景先后关系的功能 MUST 使用同一展开结果。展开 MUST NOT 原地修改传入的 chapter/novel。

#### Scenario: 场景按 order 展开

- **WHEN** 某章包含多个场景
- **THEN** 系统按 `Scene.order` 升序返回场景
- **AND** order 相同时以原数组位置稳定兜底

#### Scenario: 章内正文聚合

- **WHEN** 任一功能需要整章正文（导出、字数、Prompt 上下文、分析输入）
- **THEN** 该功能按 `orderedScenes(chapter)` 顺序聚合各场景 `content`
- **AND** 聚合结果与场景展示顺序一致

#### Scenario: 顺序消费者保持一致

- **WHEN** 场景顺序或场景正文发生变化
- **THEN** 导出、字数/进度、Prompt 前文上下文、分析输入与搜索均使用相同的章内场景顺序

### Requirement: 场景创建、重命名、排序与安全删除

系统 SHALL 在章节工作台提供场景的创建、重命名、上移、下移与删除。场景的 `order` MUST 在变更后归一为从 0 起的连续整数。所有场景结构操作 MUST 返回新的 Novel（不原地修改），并经现有 `saveNovel(novel)` 链持久化。

#### Scenario: 新建场景

- **WHEN** 用户在某章新建场景
- **THEN** 新场景追加到该章场景末尾
- **AND** 系统通过现有整本 Novel 保存链持久化

#### Scenario: 重命名场景

```

Full source: openspec/changes/add-chapter-scene-structure/specs/chapter-scene-structure/spec.md

## openspec/changes/add-chapter-scene-structure/specs/chapter-search/spec.md

- Source: openspec/changes/add-chapter-scene-structure/specs/chapter-search/spec.md
- Lines: 1-68
- SHA256: 35225bc71443806410ef1143cd557dbb111f23f0b78184adfcd2fd0e6c21c0a5

```md
## MODIFIED Requirements

### Requirement: 跨章全文搜索

系统 SHALL 提供搜索入口，接受关键词，按统一卷序展开当前小说的所有章节，并对每章按 `orderedScenes(chapter)` 展开其场景，扫描章节 `title`、`outline` 与各场景的 `title`、`outline`、`content`，返回命中列表。每条结果 MUST 包含基于统一卷序计算的章号、命中场景在章内的场景号、章节标题与包含关键词的摘要片段。搜索为纯读操作，MUST NOT 修改小说数据。

#### Scenario: 关键词命中多章

- **WHEN** 用户输入一个在多个章节场景正文中出现的关键词并触发搜索
- **THEN** 系统按统一卷序列出所有命中，每条含章号、场景号、标题与命中处的摘要片段
- **AND** 摘要片段中关键词可辨识（高亮或标注）

#### Scenario: 搜索大纲与标题

- **WHEN** 关键词只出现在某章的 `outline`/`title` 或某场景的 `title`/`outline` 中
- **THEN** 该命中仍出现在结果中，并标明命中来源

#### Scenario: 章号跟随卷序

- **WHEN** 卷顺序、章节归属或卷内章节顺序发生变化后再次搜索
- **THEN** 搜索结果顺序与统一卷序展开结果一致
- **AND** 每条结果的章号等于该章节在统一展开结果中的位置加一

#### Scenario: 未分卷结果居末

- **WHEN** 正式卷章节与未分卷章节均命中关键词
- **THEN** 未分卷章节的结果排在所有正式卷命中结果之后

#### Scenario: 无命中

- **WHEN** 关键词在任何章节的 title/outline 或任何场景的 title/outline/content 中都不存在
- **THEN** 系统显示无结果提示，不报错

#### Scenario: 空关键词

- **WHEN** 用户在关键词为空或仅空白时触发搜索
- **THEN** 系统不执行搜索，不产生结果列表

#### Scenario: 场景号跟随场景序

- **WHEN** 章内场景顺序发生变化后再次搜索
- **THEN** 命中结果的场景号等于该场景在 `orderedScenes(chapter)` 中的位置加一

### Requirement: 搜索结果定位到章内位置

点击搜索结果时，系统 SHALL 切换到该命中章节。命中来源为场景正文（`content`）时，系统 SHALL 激活命中场景并在其正文编辑器中滚动到命中位置并选中命中文本；命中来源为章节标题/大纲或场景标题/大纲时，系统仅切换到该章节并激活相关场景、不在正文中定位。若目标章节不是当前激活章节，MUST 先切章再执行上述定位；结果携带的 `sceneId` 仅为瞬时定位标识，MUST NOT 写入任何持久化字段。

#### Scenario: 正文命中切章并选中定位

- **WHEN** 用户点击一条命中来源为场景正文的搜索结果
- **THEN** 系统切换到该章节并激活命中场景
- **AND** 该场景正文编辑器滚动到关键词命中位置并选中命中文本

#### Scenario: 标题或大纲命中仅切章

- **WHEN** 用户点击一条命中来源为标题或大纲的搜索结果
- **THEN** 系统切换到该章节
- **AND** 不在正文编辑器中选中或定位任何位置

#### Scenario: 命中位置在当前章

- **WHEN** 用户点击的正文命中结果属于当前已激活章节
- **THEN** 系统激活命中场景并直接在其正文编辑器中定位到命中位置并选中，无需切章

#### Scenario: 命中内容已变化

- **WHEN** 搜索后正文被编辑导致命中偏移不再有效，用户点击该结果
- **THEN** 系统仍切换到该章节与场景，定位失败时不报错、不选中错误位置

```

## openspec/changes/add-chapter-scene-structure/specs/chapter-undo-history/spec.md

- Source: openspec/changes/add-chapter-scene-structure/specs/chapter-undo-history/spec.md
- Lines: 1-66
- SHA256: 7ccb4c4a4e100f079fe0c60ab6945dd10d35049f6ac01a826e553812cecaebeb

```md
## MODIFIED Requirements

### Requirement: 正文编辑多步撤销/重做

系统 SHALL 为当前激活场景正文编辑维护一个撤销历史栈，支持多步撤销（Ctrl+Z）与重做（Ctrl+Y 或等价快捷键）。因受控 textarea 破坏了浏览器原生 undo，系统 MUST 接管这些快捷键（阻止默认行为）并从自建历史栈执行撤销/重做。撤销/重做后的正文 SHALL 经现有场景正文自动保存链持久化。

#### Scenario: 多步撤销手动编辑

- **WHEN** 用户手动输入若干段正文后连续按撤销
- **THEN** 系统逐步回退到之前的正文状态

#### Scenario: 重做已撤销的编辑

- **WHEN** 用户撤销若干步后按重做
- **THEN** 系统逐步重新应用被撤销的正文状态

#### Scenario: 撤销/重做自身不再进栈

- **WHEN** 用户执行撤销或重做
- **THEN** 该撤销/重做产生的正文写入不会作为新的一步进入历史栈（不产生循环）

### Requirement: 历史栈进栈边界

历史栈 SHALL 只记录手动编辑与查找替换的写入。AI 续写写回、流式逐字生成的 delta、以及撤销/重做自身触发的写入 MUST NOT 进入历史栈。

#### Scenario: 手动编辑进栈

- **WHEN** 用户手动在正文编辑器打字
- **THEN** 该编辑进入历史栈，可被撤销

#### Scenario: 查找替换写入进栈

- **WHEN** 用户通过查找替换修改正文（替换当前项或全部替换）
- **THEN** 该替换作为一步进入历史栈，可被撤销

#### Scenario: AI 写回不进栈

- **WHEN** AI 续写结果写回正文
- **THEN** 该写回不作为可撤销的手动编辑步骤进入历史栈

#### Scenario: 流式生成不逐字进栈

- **WHEN** 正文正在以流式逐字方式生成
- **THEN** 逐字 delta 不产生逐字历史记录

### Requirement: 切章清栈

撤销历史栈 SHALL 按 `sceneId` 隔离。切换到另一个场景（含切换到另一章导致的场景切换）时，系统 SHALL 使撤销不会跨场景回退到其他场景的正文。删除当前场景时，系统 SHALL 仅清除该场景的历史栈并激活相邻场景。

#### Scenario: 切章后不跨章撤销

- **WHEN** 用户在 A 章某场景编辑后切换到 B 章
- **THEN** A 章场景的历史栈不再对 B 章激活场景生效
- **AND** 在 B 章按撤销不会回退到 A 章的正文内容

#### Scenario: 切换场景后不跨场景撤销

- **WHEN** 用户在同章场景 A 编辑后切换到场景 B
- **THEN** 场景 A 的历史栈不再对场景 B 生效
- **AND** 在场景 B 按撤销不会回退到场景 A 的正文内容

#### Scenario: 删除当前场景仅清除该场景历史

- **WHEN** 用户删除当前激活场景（该章仍有其他场景）
- **THEN** 系统仅清除该场景的撤销历史，不影响其他场景的历史
- **AND** 激活相邻场景后其自身历史照常工作

```
