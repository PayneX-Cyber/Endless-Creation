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

**决定**：`Scene` 接口（含可选场景 `outline`）+ `Chapter.scenes[]` 同步进四份协议副本（renderer 类型 / preload / main / rendererBridge）；Electron `sanitizeNovel` 与 Web `normalizeWebNovel` 两端 v7→v8 迁移语义必须逐条一致。版本号升 v8，首次加载 v7 后立即复用现有原子保存链持久化 v8，避免重启重建 Scene ID。其余持久化复用现有 `updateNovel → saveNovel` 链，不新增 IPC。

**理由**：change 1 review 抓出的最主要缺陷类别就是四副本/两端迁移不对称。作为硬约束前置。

## Risks / Trade-offs

- **改动面大（97 处 content 消费者）**：靠 Decision 1 删字段 + tsc 兜底找全，但仍是本刀最大工作量与回归面。接受，用编译期强制迁移换取无遗漏。
- **大 tsx 文件（ChapterWorkbench/NovelCreation）Read 会渲染幻影字节**：改动须靠 Grep 锚 ASCII 行 + tsc 验证，不硬怼多行插入。已知约束，工具层规避。
- **撤销栈按场景隔离的边界**（删当前场景、跨场景切换、场景排序）易出串栈 bug：留到 Design Doc 精确设计数据结构与清栈时机。
- **迁移不可逆性**：v8 删除 `chapter.content` 后无法自动回退 v7。接受（本地文件用户可自行备份，且 change 1 同样是单向迁移）。

## Migration Plan

- **数据**：v7 → v8。每个 chapter 建恰好一个默认场景；有正文章的 `content`/`versions`/`selectedVersionId` 整体搬入默认场景，空章建空默认场景。缺失/损坏 `scenes` 归一为"含一个空默认场景"。不虚构场景标题。
- **两端对称**：Electron 主进程消毒与 Web fallback 迁移走同一语义，先消毒场景再校验不变量。
- **回退**：无自动回退；迁移前依赖用户/系统级文件备份。
- **持久化**：全部经现有 `saveNovel(novel)` 整体写入链，不新增卷/场景 IPC。

## Open Questions

- 版本历史降到场景粒度后，版本预览/写回的具体 UI 落点与 `ChapterVersion` 结构调整——留 Design Doc。
- `orderedScenes` 稳定排序兜底规则、场景 `order` 归一化时机——留 Design Doc。
- 搜索结果同时携带章号 + 场景号 + 瞬时 `sceneId` 的定位请求数据结构（类比现有 `ChapterLocateRequest`）——留 Design Doc。
