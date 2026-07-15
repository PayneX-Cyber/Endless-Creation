---
comet_change: add-chapter-scene-structure
role: technical-design
canonical_spec: openspec
---

# Design Doc：add-chapter-scene-structure（正文权威模型下沉到 Scene）

## Context

卷层已由 `add-novel-volume-structure`（schema v7）交付。本 change 承接路线第二步：把正文权威模型从扁平 `Chapter.content` 下沉到 `Scene.content`，交付完整 Novel → Volume → Chapter → Scene 四级写作能力。

上游事实源：`openspec/changes/add-chapter-scene-structure/` 下 proposal.md、design.md、tasks.md 与四个 delta spec（新增 `chapter-scene-structure`；修改 `chapter-find-replace`/`chapter-undo-history`/`chapter-search`）。本文档是对 OpenSpec 高层 design.md 的深度技术细化，不重写需求。

现状关键实现内核（CodeGraph 核实）：
- 撤销栈：`ChapterWorkbench` 的 `historyRef` + `resetEditorHistory`/`pushEditorHistory`/`undoEditorHistory`/`redoEditorHistory`（`novelEditorTools.tsx`），靠 `[activeChapterId]` effect 在切章时读 `activeChapter.content` 重置。
- 流式取消防串线：`runRef`/`requestIdRef`/`streamTextRef` 三件套，只处理 requestId 匹配的活跃流 delta。
- 版本历史：`ChapterVersion` 快照 + `MAX_CHAPTER_VERSIONS=5` + `selectedVersionId`，`writeVersionToChapter`/`restoreVersion`。
- 正文消费者：97 处 `chapter.content` 引用横跨 13 文件（导出、字数/进度、Prompt 上下文、分析、搜索）。

## Goals / Non-Goals

### Goals
- `Scene.content` 成为唯一正文权威；删除 `Chapter.content` 字段；v7→v8 迁移。
- 章内场景标题/可选大纲编辑与 CRUD/排序；`scenes.length ≥ 1` 全生命周期不变量。
- `orderedScenes(chapter)` 成为章内场景/正文唯一展开入口；`chapterText(chapter)` 为唯一正文聚合入口。
- 分场景编辑，撤销栈按场景隔离；版本历史与 AI 续写下沉场景粒度。
- 全部正文消费者改读聚合结果；跨章搜索纳入场景并定位到场景 textarea。

### Non-Goals
- 不做跨章节移动场景（仅章内 CRUD/排序）。
- 不新增持久化 sceneId 业务锚点（伏笔/情感/图谱仍锚 chapterId）。
- 不保留 `Chapter.content` 派生字段；不改卷层；不新增 IPC/依赖；不做 v8→v9。
- 撤销栈不实现 `Map<sceneId, EditorHistory>` 跨场景缓存恢复。

## Decisions

### D1：`chapterText(chapter)` 无缝聚合（唯一正文聚合入口）
权威定义（用户确认）：
```ts
orderedScenes(chapter)
  .map(scene => scene.content)
  .filter(content => content.trim())
  .join('\n\n')
```
只过滤 trim 后为空的场景，**不 trim 非空正文**（保留用户原文首尾空白，不改一个字符）。空章（一个空默认场景）聚合出空串，字数为 0，与现状一致。场景边界不泄漏到成品正文。导出、字数/进度、Prompt 前文上下文、分析输入统一消费此函数。

**理由**：场景是写作组织单位而非成品结构；`\n\n` 段落级拼接读起来是连续整章。空场景过滤避免幽灵空行。

### D2：`orderedScenes(chapter)` 唯一展开入口
场景按 `order` 升序，order 相同以原数组位置稳定兜底；不原地修改入参。与 change 1 `orderedChapters` 同构。

### D3：`scenes.length ≥ 1` 不变量（三处守卫）
迁移（每章建默认场景）、新建章（`createChapter` 初始化一个默认场景）、删除场景（删到最后一个时拒绝，UI 按钮禁用）三处共同保证。默认场景持久化标题留空，UI 派生显示"场景 N"（不虚构叙事命名，同 change 1"不虚构第一卷"）。

### D4：撤销栈以 `activeSceneId` 为切换边界，变化即 reset
撤销/重做历史栈以 `activeSceneId` 为切换边界：`activeSceneId` 变化即调用 `resetEditorHistory` 重置，**不为每个 Scene 保存独立 `Map<sceneId, EditorHistory>`，不实现"切回后恢复旧撤销栈"**。现有 `[activeChapterId]` reset effect 改锚 `activeSceneId`、读 `activeScene.content`。删除当前场景时选相邻场景（优先后一个，无则前一个）作为新 `activeSceneId`，触发 reset 即清除原场景历史。

**理由**：与现有切章清栈同构，用户心智一致；Map 缓存引入"历史过期""切走场景被删"等边界，YAGNI。

### D5：流式续写防串线机制不变，写入目标改 activeScene
`runRef`/`requestIdRef`/`streamTextRef` 三件套逐字机制不变，只把写回目标从 `activeChapter` 改为 `activeScene`。AI 前驱上下文仍按统一章节/场景顺序衔接（`orderedChapters` × `orderedScenes`）。AI 写回不进撤销栈的现有语义保持。

### D6：版本历史下沉 scene 粒度
`ChapterVersion`/`MAX_CHAPTER_VERSIONS`/`selectedVersionId` 整体从 Chapter 移到 Scene；`writeVersionToChapter`→`writeVersionToScene`，版本预览/写回按场景粒度。

### D7：Schema v7→v8 与迁移对称
`Scene` 接口（含可选 `outline`）+ `Chapter.scenes: Scene[]` 同步进四份协议副本（`src/types/novel.ts`、`electron/preload/bridgeTypes.ts`、`electron/main/index.ts`、`src/services/rendererBridge.ts`）；删 `Chapter.content`（A1，由 tsc 编译期强制迁移所有消费者）。Electron `sanitizeNovel` 与 Web `normalizeWebNovel` 迁移语义对称一致；首次加载 v7 后立即通过既有原子保存链持久化 v8，避免重启重建 Scene ID。`filledChapterCount` = `chapterText(chapter)` 非空的章数；`wordCount` 按 `chapterText` 聚合重算。version 7→8。

### D8：锚点红线保持 chapter 级；瞬时 sceneId 仅供导航
伏笔 `plantedChapterId`/`payoffChapterId`、`EmotionPoint.chapterId`、人物图谱继续锚定 `chapterId`，本 change 不新增**持久化** sceneId 业务锚点。**允许搜索结果携带瞬时 `sceneId` 用于导航定位（用完即弃、不落库）**；禁止的是持久化分析锚点。分析输入按章内场景聚合（`chapterText`），锚点粒度保持 chapter 级。

### D9：会话态不落库
`activeChapterId`/`activeSceneId` 均为 React 会话状态，不进 schema；重新打开小说默认激活首章首场景。

## Risks / Trade-offs
- **删 `Chapter.content` 影响 97 处** → 接受 tsc 编译期红作为消费者清单，比 grep 可靠；逐处改读 `chapterText`/`orderedScenes`。
- **迁移丢正文** → v7→v8 自检强制覆盖 `content`+`versions`+`selectedVersionId` 全量迁入默认场景 + 空章建空默认场景，缺一断言失败。
- **大 tsx（ChapterWorkbench/NovelCreation）Read 损坏** → 只用 Grep 锚 + CodeGraph + tsc 验证，改文件锚 ASCII-only 行，不硬怼多行插入。
- **切场景清栈** → 接受"切走再切回历史不恢复"，换实现简单、边界可控。

## Migration Plan
- v7→v8：每 chapter 建恰好一个默认场景，`content`/`versions`/`selectedVersionId` 原样迁入；空章建空默认场景；损坏/缺失 scenes 归一为至少一个空场景，order 分组归一。
- Electron 与 Web 两端语义对称；复用现有 `saveNovel(novel)` 整体持久化链与原子写入，不新增 IPC。
- 回滚：迁移为纯函数消毒，v8 数据结构叠加在现有整本保存链上；出错时不写库。

## Open Questions
无。open 阶段四个 delta spec 已覆盖全部验收场景，深度设计未发现需回写的 Spec Patch。
