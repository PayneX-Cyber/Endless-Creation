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
