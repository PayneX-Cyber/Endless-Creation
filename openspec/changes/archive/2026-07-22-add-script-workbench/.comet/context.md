# Comet Design Handoff

- Change: add-script-workbench
- Phase: design
- Mode: compact
- Context hash: 0f635630e1bea2eab4b1673cc428f95c2ae74483e680f4bd41c3d3b6b45a8a7b

Generated-by: comet-handoff.sh

OpenSpec remains the canonical capability spec. This handoff is a deterministic, source-traceable context pack, not an agent-authored summary.

## openspec/changes/add-script-workbench/proposal.md

- Source: openspec/changes/add-script-workbench/proposal.md
- Lines: 1-39
- SHA256: 9e93685d17926bd094d504f0533468a715b881813092f9f3ab564f23e7c70a2e

```md
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

```

## openspec/changes/add-script-workbench/design.md

- Source: openspec/changes/add-script-workbench/design.md
- Lines: 1-89
- SHA256: cb56e1ffe4f4f65935ad1305cf474d108a202c1f3b87665f1f8f818691e789c4

[TRUNCATED]

```md
## Context

Endless Creation 产品定位覆盖“编剧、导演、小说作者”，但当前只有小说创作闭环。侧边栏“剧本工作台”入口（`src/app/App.tsx` 中 `activeNavId === 'script-workbench'`）已存在于导航配置，却没有对应路由分支，点击落到 `blank-workspace` 兜底。

现有可复用的模式（本 change 的对齐基线）：

- **落库链路**：`electron/main/index.ts` 逐实体 JSON 文件存储 + `version` 迁移基线；`src/services/rendererBridge.ts` 双路径（Electron preload IPC + Web localStorage fallback，返回同形状结果）；`novelService` 薄封装 service 层供 UI 调用。
- **层级 + 正文权威**：Novel → Volume → Chapter → Scene，`Scene.content` 为正文权威载体；新建时保证“章必有 ≥1 场”不变量。
- **保存并发**：按实体串行保存队列 + 原子写入（临时文件 rename）+ 关闭前 flush，防自动保存与 `Ctrl+S` 并发覆盖。
- **设定实体**：`SettingEntry`（`type: character | location | ...`）当前挂在 `Novel` 下，是小说内部可编辑数据。

本 change 交付剧本创作核心闭环。约束：本地优先、不触及 `Novel`/`Chapter`/`Scene` 及其落库、不新增第三方依赖、不修改或记录用户真实 API 密钥。

## Goals / Non-Goals

**Goals:**

- 填充 `script-workbench` 路由分支，接管既有侧边栏入口。
- 落地**独立剧本域**三层模型 Script → Episode → ScriptScene（`ScriptScene.content` 纯文本正文权威），新建剧本自动含第 1 集第 1 场。
- 落地**项目级共享设定库** `SharedSettings`（按 `projectId` 空库起步，手动 CRUD 人物/地点），与 `Novel.settings` 完全隔离。
- 场次以 `referenceIds` 结构化引用共享设定，不把名称复制进正文。
- 证通“建剧本 → 管集与场次 → 写正文 → 关联设定”核心链，覆盖 Electron + Web fallback 双路径本地落库。

**Non-Goals:**

- AI 续写/改写/版本历史、分镜拆解与生图/资产关联、Word/MD/ZIP 导出、Electron 全链路专项狗粮验收。
- 富文本剧本格式与对白/动作 block、正文内 `@` 引用标记、搜索/标签、拖拽排序。
- 回收站/软删除（`deletedAt`）与恢复 IPC。
- 小说设定导入迁移（后续单开 change，届时再定复制/转移/链接语义）。
- 项目本身的落库（项目中心沿用现有 `activeProjectId`）。

## Decisions

### 1. 独立剧本域，不复用 Novel 类型与命名空间

Script/Episode/ScriptScene 为独立类型，preload 独立 `script` / `projectSettings` 命名空间，不塞进 `novel`。
**为什么**：剧本与小说是并列创作载体，硬耦合会让今后任一侧演进互相牵制。
**备选**：复用 `Novel` 结构给剧本换皮——放弃，会污染小说类型的字段语义。

### 2. 存储模式复用，业务域独立

复用小说链路的目录解析、JSON 序列化、原子写入（临时文件 rename）、按实体串行保存队列、关闭前 flush；Script 与 `SharedSettings` 各自带 `schemaVersion` 迁移基线，按 `projectId` 隔离。
**为什么**：存储可靠性模式已在小说域验证，重造只会引入新 bug；业务结构独立则保证域隔离。

### 3. 共享设定库空库起步，不迁移小说设定

`SharedSettings` 按 `projectId` 建空库，`Novel.settings` 完全不读、不写、不迁移。
**为什么**：复制小说设定并保留 ID 会制造两个可写权威源，ID 相同不能保证同步，反而掩盖漂移。核心链（建剧本→写场次→插引用）不需要旧设定即可证通。
**备选**：迁移/链接小说设定——推迟到专门的“导入设定”change，届时统一想清双份数据归属。

### 4. 统一删除模型：硬删除 + UI 即时撤销，无 deletedAt

Script/Episode/ScriptScene 均硬删除；删除前 UI 暂存快照，提供即时撤销，撤销走同一 `saveScript` 保存链恢复原 ID 与内容。集/场次不允许删到空（保留 ≥1 不变量）。
**为什么**：软删除要配套列表过滤、回收站视图、恢复、彻底清除，对核心闭环非必需。字段先行（方案 B）是用户无法恢复的半套机制，跳过。
**约束（写入实现）**：
- Script 删除前必须先 `loadScript(scriptId)` 得到完整嵌套树，撤销快照须含 `episodes → scenes → content`，避免从列表页精简摘要删除后撤销出丢正文的空壳。
- UndoToast 绑定 ScriptWorkbench 生命周期：项目切换 / 路由离开触发 flush 时，撤销快照同时失效，避免恢复出错误 projectId 或落到 flush 后空隙。

### 5. 引用完整性以磁盘为权威源

被任意场次 `referenceIds` 引用的人物/地点禁止删除。设定删除 handler 在 main 进程**从磁盘重新读取当前项目全部 Script 文件**扫描 `referenceIds`，存在引用则返回失败 + 引用位置摘要，不执行删除。
**为什么**：渲染层传入的 payload 可能有未 flush 编辑或在多窗口/并发下过期，扫过期数据会漏检真实引用、误删正被引用的设定。“实时”须锚死为“读盘实时”。
**倾向**：删除前实时读盘扫描（简单够用），不维护引用计数（额外一致性负担）。

### 6. Electron 写盘失败不静默降级

Electron 写盘失败只返回 `{ ok: false, message }`，renderer 保留 dirty 状态并允许重试；Web fallback 仅在无 Electron bridge 时启用，不作为 Electron 磁盘失败后的备用存储。
**为什么**：静默切 localStorage 会让用户以为已存盘，实际数据分叉在两处，事后难合并。

### 7. 单一编排层 + 单一保存链

ScriptWorkbench 是唯一业务编排层，持有编辑中的完整 Script draft；结构操作（改名/排序/增删集与场）与正文防抖编辑都是对同一 draft 的写入，统一由一条保存链落盘，共用按实体串行队列。
**为什么**：两条写入路径若各自触发整树写，防抖那次会用旧 draft 覆盖“改名立即存”。所有变更先进 draft、统一保存链，消除覆盖竞态。防抖窗口对齐小说编辑器现值。

## Risks / Trade-offs

- **[整树保存粒度偏粗]** → 每次保存写整个 Script（含所有集/场正文）。对齐小说 Novel 现状，单本剧本体量可控；若后续单剧本过大再考虑分片，本 change 不提前优化。
- **[读盘扫描引用的开销]** → 每次删设定都读当前项目全部 Script 文件。项目内剧本数量有限，开销可接受；换来的是绝不误删被引用设定的正确性，优先正确性。
- **[UndoToast 与 flush 竞态]** → 撤销是瞬时内存操作，若与项目切换/路由离开的 flush 交错可能恢复到错误上下文。以“撤销快照随 workbench 生命周期失效”消除，见 Decision 4。
- **[共享设定与小说设定长期割裂]** → 用户在剧本与小说各维护一套人物/地点。本 change 有意接受此割裂；统一由后续“导入设定”change 处理，避免现在过早绑定双份数据语义。

```

Full source: openspec/changes/add-script-workbench/design.md

## openspec/changes/add-script-workbench/tasks.md

- Source: openspec/changes/add-script-workbench/tasks.md
- Lines: 1-28
- SHA256: def0e56f5e13337287b3983ca0307e0f60cf8f074f79d093636675bceea206bf

```md
## 1. 剧本域与共享设定持久化底座（Electron + Web fallback）

- [ ] 1.1 定义剧本域类型（`Script`/`Episode`/`ScriptScene`）与项目级共享设定类型（`ProjectSettingEntry`），含 `schemaVersion` 基线，独立于 `Novel`/`Chapter`/`Scene`，不改动小说类型文件
- [ ] 1.2 main 进程新增剧本文件存储（按 `projectId` 隔离，临时文件 + rename 原子写、按实体串行保存队列），实现 list/create/load/save/delete handler；create 时生成稳定 ID、时间戳、第 1 集与第 1 场
- [ ] 1.3 main 进程新增共享设定文件存储（按 `projectId` 隔离空库、原子写），实现 load/save/deleteSetting handler；deleteSetting 前从磁盘重新读取当前项目全部 Script 扫描 `referenceIds`，命中引用则返回 `{ok:false}` 与引用位置摘要，不执行删除
- [ ] 1.4 preload 新增独立 `script` 与 `projectSettings` 命名空间并补 bridge 类型；renderer 新增 `scriptService`/`projectSettingsService` 与 `rendererBridge` 双路径（Electron IPC + `endless-creation.scripts.<projectId>` / `endless-creation.project-settings.<projectId>` 的 Web fallback，返回同形状结果，不作为 Electron 写盘失败的降级）
- [ ] 1.5 复用关闭前 flush 机制，等待剧本与设定 pending save 完成后再关闭窗口

## 2. 剧本工作台 UI 与核心闭环

- [ ] 2.1 `App.tsx` 新增 `script-workbench` 路由分支，渲染 `ScriptWorkbench` 并传入 `activeProjectId`；视频工作台/提示词库入口保持不动
- [ ] 2.2 实现 `ScriptWorkbench` 编排层：加载当前项目剧本摘要与共享设定、管理 `scriptId/episodeId/sceneId`、加载并持有完整 Script draft、统一防抖保存 / `Ctrl+S` 立即保存 / 保存状态（未保存/保存中/已保存/保存失败保留 draft 可重试）/ 项目切换或路由离开前 flush
- [ ] 2.3 实现 `ScriptLibraryPanel`（剧本列表、新建、重命名、切换、删除确认）+ `EpisodeList` + `SceneList`（增删改 + 上移/下移，不引入拖拽库；不允许删最后一集/最后一场；新建集自动含一个空场次）
- [ ] 2.4 实现 `ScriptEditor`（标题绑定 `Scene.title`、纯文本区绑定 `Scene.content`，受控 draft、防抖保存、纯文本无富文本/版本/`@` 标记）
- [ ] 2.5 实现统一删除 + 即时撤销：删除 Script 前先 `loadScript` 完整嵌套树（含 episodes→scenes→content）保存快照 → 硬删除 → `UndoToast` 即时撤销走同一 `saveScript` 恢复原 ID 与完整正文；`UndoToast` 绑定 workbench 生命周期，项目切换/路由离开即失效

## 3. 共享设定 UI 与引用完整性

- [ ] 3.1 实现 `SharedSettingsPanel`（项目级人物/地点新建、编辑标题与正文、删除确认；被引用时展示"无法删除：仍被场次引用"）
- [ ] 3.2 实现 `ReferencePanel`（展示当前项目共享设定、按人物/地点筛选、对当前场次添加/移除 `referenceIds` 并以卡片/标签展示已关联实体，只存 ID 不写名称进正文）
- [ ] 3.3 可访问性收口：删除确认为真正 dialog 支持 Escape 取消、列表项与操作按钮可键盘访问、上移/下移按钮明确 aria-label、异步加载与错误状态不阻塞整个工作台

## 4. 验收

- [ ] 4.1 运行 `npm.cmd run build` 与类型检查通过（含新增剧本域/设定域类型与 IPC 类型）
- [ ] 4.2 文本完整性扫描新增/改动源文件通过
- [ ] 4.3 Electron 真机验收核心链：新建剧本自动含第 1 集第 1 场 → 写正文防抖保存 + Ctrl+S → 重启应用正文仍在；增删改序集与场次（含删最后一集/场被拦）；项目级新建人物/地点 → 场次关联/移除引用；删除被引用设定被 main 读盘扫描拒绝并返回引用位置；删除剧本即时撤销恢复完整树与原 ID、项目切换后撤销失效；Electron 写盘失败返回 `{ok:false}` 保留 dirty 可重试
- [ ] 4.4 Web fallback 验收：浏览器预览模式下核心链走 localStorage 返回同形状结果

```

## openspec/changes/add-script-workbench/specs/project-shared-settings/spec.md

- Source: openspec/changes/add-script-workbench/specs/project-shared-settings/spec.md
- Lines: 1-53
- SHA256: 9cd50990437051271b378c81a83bab2e388a0068e3e7326b77b46b795e581b2d

```md
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

```

## openspec/changes/add-script-workbench/specs/script-workbench/spec.md

- Source: openspec/changes/add-script-workbench/specs/script-workbench/spec.md
- Lines: 1-124
- SHA256: 6f24ccab0280bd2389eee013821db3c8df86e0cdc826389c7fc7592ba9bc985e

[TRUNCATED]

```md
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

```

Full source: openspec/changes/add-script-workbench/specs/script-workbench/spec.md
