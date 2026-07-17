## ADDED Requirements

### Requirement: 项目级共享设定空库

系统 SHALL 为每个项目提供以 `projectId` 隔离的共享设定库 `SharedSettings`，库在首次访问时初始化为空。每个 `ProjectSettingEntry` MUST 携带 `id`、`projectId`、`type: character | location`、标题、正文与时间戳。该库 MUST 与 `Novel.settings` 完全隔离，系统 MUST NOT 读取、写入或迁移 `Novel.settings`。

#### Scenario: 首次访问初始化空库

- **WHEN** 用户首次在某项目打开剧本工作台的共享设定
- **THEN** 系统返回该项目的空共享设定库，不从 `Novel.settings` 复制任何数据

#### Scenario: 与小说设定隔离

- **WHEN** 项目下已存在小说及其 `Novel.settings` 数据
- **THEN** 共享设定库不受其影响，两者互不读写

### Requirement: 共享设定手动 CRUD

系统 SHALL 支持在项目级共享设定库中手动新建人物/地点、编辑标题与正文、删除（确认后）。所有设定 SHALL 通过 `projectSettingsService` 落库，编辑器 MUST NOT 直接调用 IPC 或 localStorage。设定 MUST 按 `projectId` 隔离持久化，Electron 走 preload `projectSettings` 命名空间 → main IPC → 本地 JSON 文件，Web 预览走 `endless-creation.project-settings.<projectId>` fallback。

#### Scenario: 新建人物/地点

- **WHEN** 用户在共享设定面板新建一个人物或地点并填写标题、正文
- **THEN** 系统生成带稳定 `id`、`projectId`、`type` 与时间戳的设定并落库

#### Scenario: 编辑设定标题与正文

- **WHEN** 用户修改某条设定的标题或正文
- **THEN** 系统更新该条目并通过统一保存链落盘

#### Scenario: 双路径返回同形状结果

- **WHEN** 分别在 Electron 与 Web 预览模式保存设定
- **THEN** 两条路径返回同形状结果，Web 写入 `endless-creation.project-settings.<projectId>`，Electron 写入按 `projectId` 隔离的本地 JSON 文件

### Requirement: 被引用设定的删除完整性保护

系统 SHALL 在删除共享设定前，由 main 进程从磁盘重新读取当前项目全部 Script 文件并扫描其 `referenceIds`。若该设定被任意场次引用，系统 MUST 拒绝删除并返回引用位置摘要；完整性扫描 MUST 以磁盘上的 Script 为权威源，MUST NOT 信任 renderer 传入的快照。

#### Scenario: 删除被场次引用的设定被拒绝

- **WHEN** 某人物/地点仍被至少一个场次的 `referenceIds` 引用且用户尝试删除
- **THEN** main 从磁盘扫描当前项目全部 Script 后拒绝删除，并返回“无法删除：仍被场次引用”及引用位置摘要

#### Scenario: 删除未被引用的设定成功

- **WHEN** 某设定未被任何场次引用且用户确认删除
- **THEN** 系统从共享设定库删除该条目并落盘

#### Scenario: 完整性扫描以磁盘为权威源

- **WHEN** renderer 传入的剧本快照与磁盘上的 Script 不一致（存在未 flush 编辑或过期 payload）
- **THEN** main 以磁盘上的 Script 文件为准执行引用扫描，不依据 renderer 快照判定
