## Why

现有小说数据只有扁平的 `Novel.chapters[]`，长篇作品无法按卷组织章节，导航、导出和生成上下文也缺少稳定的卷序语义。项目目标已从 MVP 转为可上线长期使用，需要在不破坏 `chapterId` 与 `chapter.content` 契约的前提下补齐生产级卷管理能力。

## What Changes

- **BREAKING（数据层）**：`Novel` schema 从 version 6 升至 version 7，新增 `volumes: Volume[]`；`Chapter` 新增可选 `volumeId`。
- 新增卷的创建、重命名、排序和安全删除；删除卷时卷内章节移入“未分卷”，禁止级联删除章节。
- 新增章节归卷、移出卷和跨卷移动；章节仍保存在扁平 `Novel.chapters[]`，`chapterId` 与正文结构不变。
- 定义统一章节展开顺序：正式卷按 `Volume.order`，卷内按 `Chapter.order`，未分卷章节恒定排在末尾。
- 提供可实际使用的卷管理 UI，并让导航、搜索、导出和 Prompt 上下文统一消费同一个卷序展开函数。
- v6→v7 迁移不虚构卷：老章节保持 `volumeId` 为空并进入“未分卷”区；缺失或损坏的卷数据归一为空数组。
- 不新增卷专用 IPC，继续通过现有 `saveNovel(novel)` 整体持久化链保存。

## Capabilities

### New Capabilities

- `novel-volume-structure`: 卷数据模型、v6→v7 兼容迁移、卷 CRUD/排序、章节归卷与卷管理 UI。

### Modified Capabilities

- `chapter-reorder`: 章节重排从全局顺序扩展为卷内与跨卷顺序，并保持连续、确定的卷序展开结果。
- `chapter-search`: 搜索结果中的章号和结果顺序改为统一卷序展开顺序。

## Impact

- **Schema / 持久化**：同步修改 renderer、preload、main 三份 `Novel`/`Chapter` 类型与主进程 `sanitizeNovel`；version 6→7。复用现有小说整体保存与原子写入，不新增 IPC。
- **前端**：小说项目视图与工作台章节导航新增卷分组和管理交互；章节重排支持卷内和跨卷移动。
- **排序消费者**：导出、导航、跨章搜索、Prompt 前文上下文、统计及其他依赖章节顺序的模块改用统一的 `orderedChapters(novel)`。
- **兼容性**：伏笔、情感曲线、分析持久化继续使用原 `chapterId`；`chapter.content`、版本历史和编辑器正文契约不变。
- **非目标**：不新增 Scene 层级，不下沉正文，不改 `NovelSummary`，不做 v7→v8，不新增依赖。
