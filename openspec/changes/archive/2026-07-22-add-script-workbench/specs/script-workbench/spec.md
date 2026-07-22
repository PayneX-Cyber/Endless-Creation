## ADDED Requirements

### Requirement: 剧本工作台路由入口

系统 SHALL 在 `activeNavId === 'script-workbench'` 时渲染剧本工作台，接管既有侧边栏入口，并将当前 `activeProjectId` 传入工作台。视频工作台与提示词库入口 SHALL 保持不变。

#### Scenario: 从侧边栏进入剧本工作台

- **WHEN** 用户在侧边栏点击“剧本工作台”且存在活跃项目
- **THEN** 系统渲染剧本工作台并加载当前项目的剧本列表与共享设定，不再落到空白兜底工作区

#### Scenario: 无活跃项目时的入口行为

- **WHEN** 用户在无活跃项目时点击“剧本工作台”
- **THEN** 系统按现有工作台外壳的无项目处理约定引导用户，不渲染空白剧本编辑态

### Requirement: 剧本域三层数据模型

系统 SHALL 以 `Script → Episode → ScriptScene` 三层组织剧本，`ScriptScene.content` 为纯文本正文的唯一权威载体。`Script` MUST 携带 `id`、`projectId`、标题、`episodes`、`schemaVersion` 与时间戳；`Episode` MUST 携带 `id`、标题、顺序、`scenes` 与时间戳；`ScriptScene` MUST 携带 `id`、标题、纯文本 `content`、顺序、`referenceIds` 与时间戳。剧本域 MUST 与 `Novel`/`Chapter`/`Scene` 完全隔离，不复用其类型。

#### Scenario: 新建剧本自动生成初始结构

- **WHEN** 用户在当前项目新建剧本
- **THEN** 系统生成带稳定 `id`、`projectId`、`schemaVersion` 与时间戳的剧本，并自动包含第 1 集与第 1 场（空正文），随后走统一保存链落盘

#### Scenario: 场次正文以纯文本落库

- **WHEN** 用户在场次编辑区输入正文
- **THEN** 系统将内容写入该 `ScriptScene.content` 纯文本字段，不引入富文本结构或对白/动作 block

### Requirement: 集与场次的增删改序

系统 SHALL 支持集与场次的新增、改名、删除、上移、下移与选择。新建剧本 MUST 默认含第 1 集，新建集 MUST 默认含一个空场次。系统 MUST NOT 允许删除剧本的最后一集，也 MUST NOT 允许删除一集的最后一场。排序 SHALL 使用上移/下移按钮，不引入拖拽库。

#### Scenario: 删除非最后一集

- **WHEN** 剧本存在多集且用户删除其中一集
- **THEN** 系统移除该集及其场次并重排顺序，通过统一保存链落盘

#### Scenario: 阻止删除最后一集

- **WHEN** 剧本仅剩一集且用户尝试删除
- **THEN** 系统拒绝删除并保持至少一集存在

#### Scenario: 阻止删除最后一场

- **WHEN** 某集仅剩一场且用户尝试删除
- **THEN** 系统拒绝删除并保持该集至少一场存在

#### Scenario: 上移/下移调整顺序

- **WHEN** 用户对某集或某场执行上移/下移
- **THEN** 系统更新其顺序字段并按新顺序渲染，通过统一保存链落盘

### Requirement: 场次正文保存

系统 SHALL 在场次正文变更时触发防抖保存，并在用户按 `Ctrl+S` 时立即保存。保存 SHALL 通过 `scriptService` 走统一保存链，编辑器 MUST NOT 直接调用 IPC 或 localStorage。保存状态 SHALL 统一呈现为“未保存 / 保存中 / 已保存 / 保存失败”。

#### Scenario: 防抖自动保存后重开正文仍在

- **WHEN** 用户输入正文并等待防抖窗口结束
- **THEN** 系统保存该场次，重开应用或刷新后该正文仍存在

#### Scenario: Ctrl+S 立即保存

- **WHEN** 用户按下 `Ctrl+S`
- **THEN** 系统立即保存当前剧本，不等待防抖窗口

#### Scenario: 保存失败保留草稿可重试

- **WHEN** 保存返回失败
- **THEN** 系统保留编辑中的正文草稿、显示“保存失败”并提供重试，不丢失正文

### Requirement: 剧本删除与即时撤销

系统 SHALL 对 Script/Episode/ScriptScene 采用确认后硬删除，并在删除后提供 UI 即时撤销。删除剧本前系统 MUST 先加载完整嵌套树（`episodes → scenes → content`）作为撤销快照；撤销 SHALL 通过同一 `saveScript` 保存链恢复原 `id` 与完整内容。撤销能力 MUST 绑定在剧本工作台生命周期内，项目切换或路由离开时即时失效。

#### Scenario: 删除剧本后即时撤销恢复完整内容

- **WHEN** 用户删除一个剧本并随即点击撤销
- **THEN** 系统通过统一保存链恢复该剧本，且原 `id`、集、场次与正文完整还原

#### Scenario: 项目切换后撤销失效

- **WHEN** 用户删除剧本后切换到其他项目或离开路由
- **THEN** 撤销入口失效，不会在错误的项目上下文中恢复剧本

#### Scenario: 删除前先加载完整树

- **WHEN** 用户从仅持有摘要的剧本列表触发删除
- **THEN** 系统先 `loadScript` 取得完整嵌套树再删除，确保撤销快照包含完整正文而非空壳

### Requirement: 场次关联共享设定引用

系统 SHALL 允许在场次的引用面板中关联/移除项目级共享设定（人物/地点），并 SHALL 仅在场次的 `referenceIds` 中保存引用 ID。系统 MUST NOT 将设定名称复制进正文。引用面板 SHALL 以卡片或标签展示当前场次已关联的实体，并支持按人物/地点筛选。

#### Scenario: 关联人物/地点到场次

- **WHEN** 用户在引用面板为当前场次添加某个共享设定
- **THEN** 系统将该设定 `id` 加入该场次 `referenceIds`，正文内容不被写入设定名称

#### Scenario: 移除场次引用

- **WHEN** 用户在引用面板移除某条已关联设定
- **THEN** 系统从该场次 `referenceIds` 移除对应 `id`，不影响共享设定本身

### Requirement: 剧本本地持久化与双路径

系统 SHALL 通过 `scriptService` → `rendererBridge` 落库，Electron 环境走 preload `script` 命名空间 → main IPC → 本地 JSON 文件，Web 预览环境走以 `projectId` 命名的 localStorage fallback。Script 存储 MUST 按 `projectId` 隔离，采用临时文件写入后 rename 的原子写入，并使用按实体串行保存队列避免自动保存与 `Ctrl+S` 并发覆盖。Electron 写盘失败 MUST 返回 `{ ok: false, message }` 并保留 dirty 状态供重试，MUST NOT 静默降级到 localStorage。关闭窗口时系统 SHALL 复用现有 flush 机制等待剧本 pending save 完成。

#### Scenario: Electron 与 Web 返回同形状结果

- **WHEN** 分别在 Electron 桌面端与 Web 预览模式保存剧本
- **THEN** 两条路径返回同形状结果，Web fallback 写入 `endless-creation.scripts.<projectId>`，Electron 写入按 `projectId` 隔离的本地 JSON 文件

#### Scenario: Electron 写盘失败不静默降级

- **WHEN** Electron 环境下剧本写盘失败
- **THEN** 系统返回 `{ ok: false, message }`，保留 dirty 状态供重试，不切换到 localStorage 存储

#### Scenario: 关闭窗口前 flush pending save

- **WHEN** 存在未完成的剧本保存且用户关闭窗口
- **THEN** 系统复用现有 flush 机制等待 pending save 完成后再关闭
