# add-script-workbench 验证报告

验证日期：2026-07-17
分支：`comet/add-script-workbench`
基线：`f1a46651981a4634e51440292517d5b3728864e8`

## 结论

| 维度 | 结果 |
| --- | --- |
| 完整性 | PASS：17/17 tasks 完成，10/10 requirements 可定位 |
| 正确性 | PASS：27 个规格场景均有实现、测试或 GUI 验收证据 |
| 一致性 | PASS：实现符合 OpenSpec design 与技术 Design Doc，无规格漂移 |

未发现 CRITICAL 或 IMPORTANT 问题，可以进入归档。

## 自动验证

- `npm.cmd run test:script`：22/22 通过。
- `npm.cmd run build`：renderer 与 Electron 构建通过。
- 文本完整性扫描：`TEXT INTEGRITY OK`。
- `openspec validate add-script-workbench --strict`：通过。
- `git diff --check` 与暂存区检查：通过，仅有 Windows CRLF 提示。
- 变更区间敏感信息扫描：未发现新增硬编码密钥、token 或密码。

## 规格映射

- 路由与项目边界：`App.tsx` 仅在存在 `activeProjectId` 时挂载 `ScriptWorkbench`，切换工作区前执行保存门禁。
- 三层模型与不变量：`scriptDomain.ts` 提供初始树、集/场增删改序、最后一集/场保护及粒度化撤销恢复；对应纯函数测试覆盖。
- 保存生命周期：`ScriptWorkbench.tsx` 使用单一 draft、600ms 防抖、`Ctrl+S`、revision 检查与串行 flush；失败会保留草稿并阻止切换或关窗。
- 删除与撤销：Script 删除前加载完整树；Script/Episode/Scene 均确认后硬删除并支持即时撤销，项目切换或卸载时撤销失效。
- 共享设定与引用：共享设定独立于小说域；场次仅保存 `referenceIds`；main 从当前项目磁盘文件实时扫描并返回引用位置。
- 持久化与安全边界：Script 按项目和实体落盘，临时文件 rename 原子写；Script ID 拒绝路径分隔符、`.` 与 `..`；损坏或缺失剧本时引用扫描失败关闭；保存旧快照时拒绝悬空引用。
- 双路径：Electron 始终走 preload/IPC，写盘失败不降级；Web 使用按项目隔离的 localStorage key，并返回同形状结果。

## GUI 证据

Build 阶段已完成 Electron 与 Web 核心链验收，包括新建初始结构、正文保存与重开恢复、集/场增删改序、设定关联与删除拒绝、完整树撤销、项目切换撤销失效、写失败重试及 Web 刷新恢复。

Verify 阶段额外对 Electron 共享设定关窗进行了慢写入测试：人为将设定写入延迟 2 秒后触发真实窗口关闭，进程约 2.37 秒后退出，文件包含完整新增设定。测试数据随后已恢复。

## 非阻断提示

- Node 内置测试会输出 `MODULE_TYPELESS_PACKAGE_JSON` 警告，技术设计已记录且不影响 22/22 结果。
- Vite 输出单个 chunk 超过 500 kB 的既有性能提示；不影响本 change 正确性，代码拆分不属于本次核心闭环范围。
