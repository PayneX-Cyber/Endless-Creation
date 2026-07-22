## Why

Endless Creation 的产品定位覆盖“编剧、导演、小说作者”，但当前只有小说创作闭环。侧边栏“剧本工作台”入口（`activeNavId === 'script-workbench'`）已存在，却没有对应路由分支，点击落到空白兜底工作区。本 change 填充这个入口，交付剧本创作的核心闭环，让用户能在本地新建剧本、组织集与场次、撰写正文并关联项目级人物/地点设定。

## What Changes

- 新增 `script-workbench` 路由分支，渲染剧本工作台，接管既有侧边栏入口。
- 引入**独立剧本域**数据模型：`Script → Episode → ScriptScene` 三层，`ScriptScene.content` 为纯文本正文权威载体；新建剧本自动生成第 1 集与第 1 场。
- 引入**项目级共享设定库** `SharedSettings`：按 `projectId` 建空库，手动新增人物/地点（`type: character | location`）；`Novel.settings` 完全隔离，不读、不写、不迁移。
- 场次通过 `referenceIds` 关联共享设定，**只存引用 ID，不把名称复制进正文**。
- 集、场次、剧本、共享设定的增删改与排序（集/场次用上移/下移，不引入拖拽库）。
- **统一删除模型**：Script/Episode/ScriptScene 均硬删除 + UI 快照即时撤销（走同一保存链恢复原 ID 与完整正文），不引入 `deletedAt`、回收站或恢复 IPC。
- **引用完整性保护**：被任意场次 `referenceIds` 引用的人物/地点禁止删除，由 main 进程从磁盘扫描当前项目全部 Script 后拒绝并返回引用位置摘要。
- 本地持久化：新增 `scriptService` / `projectSettingsService`、preload `script` / `projectSettings` 命名空间、main IPC handler 与文件存储、Web fallback，复用小说链路的原子写入、按实体串行保存队列与关闭前 flush 模式。

**目标**：证通“建剧本 → 管集与场次 → 写正文 → 关联设定”核心链，全部本地落库并覆盖 Electron + Web fallback 双路径。

**非目标（本 change 明确不做）**：AI 续写/改写/版本历史、分镜拆解与生图/资产关联、Word/MD/ZIP 导出、Electron 全链路专项狗粮验收、富文本剧本格式与对白/动作 block、正文内 `@` 引用标记、搜索/标签/回收站（软删除）、拖拽排序、小说设定导入迁移、项目本身的落库（项目中心沿用现有 `activeProjectId`）。

**用户价值**：编剧用户获得与小说创作对等的本地剧本创作载体，可在同一项目下组织多剧本、分集分场撰写，并以结构化引用复用人物/地点设定，为后续 AI、分镜、导出能力打地基。

## Capabilities

### New Capabilities

- `script-workbench`: 剧本域数据模型（Script/Episode/ScriptScene）、剧本工作台路由与 UI（剧本库、集列表、场次列表、剧本编辑器、引用面板）、集/场次/剧本的增删改序、场次正文编辑与防抖/即时保存、统一确认删除与即时撤销，以及剧本的本地持久化（service / IPC / 文件存储 / Web fallback）。
- `project-shared-settings`: 项目级共享设定库（人物/地点）的空库初始化、手动 CRUD、按 `projectId` 隔离持久化，以及“被场次引用禁止删除”的引用完整性保护（main 读盘扫描）。

### Modified Capabilities

<!-- 无。本 change 不改动任何现有 capability 的需求；Novel/Chapter/Scene 相关 spec 完全隔离。 -->

## Impact

- **Schema / 持久化**：新增剧本域与共享设定两套本地 JSON 存储（按 `projectId` 隔离），各自带 `schemaVersion` 迁移基线。**不触及** `Novel`/`Chapter`/`Scene` 类型及其落库。
- **IPC**：preload 新增 `script`、`projectSettings` 两个独立命名空间，main 进程新增对应 handler；不复用 `Novel` 类型，不塞进 `novel` 命名空间。
- **导出协议**：不涉及（导出为后续 change）。
- **前端**：新增 `src/features/script-workbench/` 组件树与 `scriptService`/`projectSettingsService`；`src/app/App.tsx` 新增 `script-workbench` 路由分支。视频工作台、提示词库入口保留不动。
- **依赖**：无新增第三方依赖（排序用按钮，不引入拖拽库）。
