## 1. 剧本域与共享设定持久化底座（Electron + Web fallback）

- [x] 1.1 定义剧本域类型（`Script`/`Episode`/`ScriptScene`）与项目级共享设定类型（`ProjectSettingEntry`），含 `schemaVersion` 基线，独立于 `Novel`/`Chapter`/`Scene`，不改动小说类型文件
- [x] 1.2 main 进程新增剧本文件存储（按 `projectId` 隔离，临时文件 + rename 原子写、按实体串行保存队列），实现 list/create/load/save/delete handler；create 时生成稳定 ID、时间戳、第 1 集与第 1 场
- [x] 1.3 main 进程新增共享设定文件存储（按 `projectId` 隔离空库、原子写），实现 load/save/deleteSetting handler；deleteSetting 前从磁盘重新读取当前项目全部 Script 扫描 `referenceIds`，命中引用则返回 `{ok:false}` 与引用位置摘要，不执行删除
- [x] 1.4 preload 新增独立 `script` 与 `projectSettings` 命名空间并补 bridge 类型；renderer 新增 `scriptService`/`projectSettingsService` 与 `rendererBridge` 双路径（Electron IPC + `endless-creation.scripts.<projectId>` / `endless-creation.project-settings.<projectId>` 的 Web fallback，返回同形状结果，不作为 Electron 写盘失败的降级）
- [x] 1.5 复用关闭前 flush 机制，等待剧本与设定 pending save 完成后再关闭窗口

## 2. 剧本工作台 UI 与核心闭环

- [x] 2.1 `App.tsx` 新增 `script-workbench` 路由分支，渲染 `ScriptWorkbench` 并传入 `activeProjectId`；视频工作台/提示词库入口保持不动
- [x] 2.2 实现 `ScriptWorkbench` 编排层：加载当前项目剧本摘要与共享设定、管理 `scriptId/episodeId/sceneId`、加载并持有完整 Script draft、统一防抖保存 / `Ctrl+S` 立即保存 / 保存状态（未保存/保存中/已保存/保存失败保留 draft 可重试）/ 项目切换或路由离开前 flush
- [x] 2.3 实现 `ScriptLibraryPanel`（剧本列表、新建、重命名、切换、删除确认）+ `EpisodeList` + `SceneList`（增删改 + 上移/下移，不引入拖拽库；不允许删最后一集/最后一场；新建集自动含一个空场次）
- [x] 2.4 实现 `ScriptEditor`（标题绑定 `Scene.title`、纯文本区绑定 `Scene.content`，受控 draft、防抖保存、纯文本无富文本/版本/`@` 标记）
- [x] 2.5 实现统一删除 + 即时撤销：删除 Script 前先 `loadScript` 完整嵌套树（含 episodes→scenes→content）保存快照 → 硬删除 → `UndoToast` 即时撤销走同一 `saveScript` 恢复原 ID 与完整正文；`UndoToast` 绑定 workbench 生命周期，项目切换/路由离开即失效

## 3. 共享设定 UI 与引用完整性

- [x] 3.1 实现 `SharedSettingsPanel`（项目级人物/地点新建、编辑标题与正文、删除确认；被引用时展示"无法删除：仍被场次引用"）
- [x] 3.2 实现 `ReferencePanel`（展示当前项目共享设定、按人物/地点筛选、对当前场次添加/移除 `referenceIds` 并以卡片/标签展示已关联实体，只存 ID 不写名称进正文）
- [x] 3.3 可访问性收口：删除确认为真正 dialog 支持 Escape 取消、列表项与操作按钮可键盘访问、上移/下移按钮明确 aria-label、异步加载与错误状态不阻塞整个工作台

## 4. 验收

- [x] 4.1 运行 `npm.cmd run build` 与类型检查通过（含新增剧本域/设定域类型与 IPC 类型）
- [x] 4.2 文本完整性扫描新增/改动源文件通过
- [ ] 4.3 Electron 真机验收核心链：新建剧本自动含第 1 集第 1 场 → 写正文防抖保存 + Ctrl+S → 重启应用正文仍在；增删改序集与场次（含删最后一集/场被拦）；项目级新建人物/地点 → 场次关联/移除引用；删除被引用设定被 main 读盘扫描拒绝并返回引用位置；删除剧本即时撤销恢复完整树与原 ID、项目切换后撤销失效；Electron 写盘失败返回 `{ok:false}` 保留 dirty 可重试
- [ ] 4.4 Web fallback 验收：浏览器预览模式下核心链走 localStorage 返回同形状结果
