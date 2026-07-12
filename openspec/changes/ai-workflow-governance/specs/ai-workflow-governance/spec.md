## ADDED Requirements

### Requirement: Staged-only validation
系统 SHALL 从 Git index 构造隔离影子工作区，并按配置运行 targeted、fast、full 或 ci 验证，不得让 unstaged 内容影响 staged 验证结果。

#### Scenario: Worktree contains unstaged edits
- **WHEN** 用户提交的 staged 内容与工作区未暂存内容不同
- **THEN** 验证结果仅反映 staged tree，报告包含 profile、命令、耗时和结果

#### Scenario: Audited bypass
- **WHEN** 用户设置非空的 `AI_WORKFLOW_BYPASS` 理由
- **THEN** pre-commit 允许绕过，并将理由、提交上下文和时间写入审计日志

### Requirement: Safe local coordination and cache
系统 SHALL 串行执行写操作，按等价缓存键合并读验证请求，并自动恢复失效锁和死亡 ticket。

#### Scenario: Concurrent writers
- **WHEN** 多个进程同时请求写操作
- **THEN** 调度器按 FIFO 顺序只允许一个写者进入临界区

#### Scenario: Equivalent validation requests
- **WHEN** 多个验证请求具有相同 Git tree、配置和环境版本
- **THEN** 系统复用同一个成功结果，并记录缓存命中

#### Scenario: Owner process dies
- **WHEN** 锁或排队 ticket 的 PID 已死亡且满足失效条件
- **THEN** 调度器清理对应运行时状态、记录审计并继续处理队列

### Requirement: Verifiable handoff
系统 SHALL 支持 session 与 staged handoff，并以 `manifest.json` 作为恢复事实源。

#### Scenario: Staged handoff
- **WHEN** 用户生成 staged handoff
- **THEN** 包中包含 manifest、受限 context 以及通过 `--binary --full-index` 生成的 patch

#### Scenario: Handoff becomes stale
- **WHEN** HEAD、index 或 OpenSpec phase 与 manifest 不一致
- **THEN** 系统标记 handoff 过期并拒绝直接 apply

#### Scenario: Secret is detected
- **WHEN** handoff 输入命中疑似密钥规则
- **THEN** 系统拒绝生成 handoff，不得静默脱敏

### Requirement: Transactional migration
系统 SHALL 通过 preflight、snapshot、apply、verify、promote 五阶段执行迁移，并以追加且 fsync 的 WAL 记录状态。

#### Scenario: Verification fails
- **WHEN** 迁移 apply 后验证失败
- **THEN** 系统自动从快照回滚并报告原始失败与回滚结果

#### Scenario: Rollback cannot complete
- **WHEN** 自动回滚失败
- **THEN** 系统持久化 `recovery-required`，阻止后续迁移且不执行 `git reset` 或 `git checkout`

### Requirement: Converged Skill sources
系统 SHALL 以 `skills-lock.json` 为来源事实源，并把 Agent Skill 目录视为受管镜像。

#### Scenario: Mirror drift is detected
- **WHEN** 镜像内容与锁文件声明或 integrity 不一致
- **THEN** `sources verify/diff` 报告差异但不静默修改或删除文件

#### Scenario: Sources are updated
- **WHEN** 用户执行 `sources sync` 或 `sources update`
- **THEN** 操作通过 Migration Manager 完成，失败时恢复锁文件和镜像

#### Scenario: Unmanaged files exist
- **WHEN** 镜像目录包含锁文件未登记内容
- **THEN** 默认只报告 unmanaged，只有显式 `--prune` 才允许删除

### Requirement: Stable automation contract
系统 SHALL 提供统一 CLI、稳定退出码、机器可读报告和渐进启用配置。

#### Scenario: Command completes
- **WHEN** 任一 CLI 命令结束
- **THEN** 命令使用已定义的 0 至 5 退出码，并写出可供 CI 和 Agent 读取的结构化报告

#### Scenario: Governance is first enabled
- **WHEN** 项目首次启用该能力
- **THEN** 系统从 Observe 阶段开始，不阻断现有提交，并采集耗时、缓存命中率和 bypass 频次
