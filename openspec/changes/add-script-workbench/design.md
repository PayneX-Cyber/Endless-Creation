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

## Migration Plan

- **数据**：全新增域，无存量数据迁移。Script 与 `SharedSettings` 首次读取时不存在即视为空库。各自 `schemaVersion` 从 1 起，为后续演进预留迁移基线。
- **回滚**：本 change 纯新增（新路由分支 + 新 service/IPC/存储 + 新组件树），不改动小说域。回滚即移除 `script-workbench` 路由分支与新增模块，既有小说数据与功能不受影响。

## Open Questions

- 深度技术设计（组件 props 契约、防抖窗口具体值、引用位置摘要的确切数据形态、保存队列 key 粒度）留待 design 阶段 Design Doc 细化，不在 open 阶段 proposal/design 高层框架内定死。
