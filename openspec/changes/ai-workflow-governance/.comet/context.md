# Comet Design Handoff

- Change: ai-workflow-governance
- Phase: design
- Mode: compact
- Context hash: c8b8ede1703e42d36de66cd778781feaf3ec262015fed5251574b75487cdf306

Generated-by: comet-handoff.sh

OpenSpec remains the canonical capability spec. This handoff is a deterministic, source-traceable context pack, not an agent-authored summary.

## openspec/changes/ai-workflow-governance/proposal.md

- Source: openspec/changes/ai-workflow-governance/proposal.md
- Lines: 1-31
- SHA256: 8edf2491494b4acb8c39a61341ac5a4a28083db101684f4da32164213494520d

```md
## Why

仓库同时接入 Comet、OpenSpec、Superpowers 及多种 Agent 后，缺少统一的本地门禁、并发协调、交接、迁移回滚和 Skill 来源治理。继续依赖人工约定会造成暂存区验证失真、并发写入冲突、交接状态过期和受管 Skill 漂移，因此需要一套仓库内、可审计、可回滚的治理工具。

## What Changes

- 新增零运行时依赖的 `ai-workflow` Node CLI，以项目配置驱动四级验证、报告和稳定退出码。
- 从 Git index 创建影子工作区，确保 pre-commit 只验证 staged 内容，并提供带理由审计的 bypass。
- 新增单写者 FIFO 调度、原子锁、心跳恢复、死票清理和内容寻址验证缓存。
- 新增 session/staged 双模式 handoff，分别生成机器事实清单、受限上下文和二进制安全 patch。
- 新增带预检、快照、应用、验证、提升及自动回滚的迁移管理器。
- 以 `skills-lock.json` 为 Skill 来源事实源，提供校验、差异、同步、更新和显式清理。
- 分 Observe、Targeted、Guard、Coordinate、CI/Template 五阶段启用，先观测再拦截。

## Capabilities

### New Capabilities

- `ai-workflow-governance`: 覆盖 staged-only 验证、调度与缓存、双模式 handoff、事务迁移、Skill 来源收敛、报告和渐进上线。

### Modified Capabilities

无。

## Impact

- 新增 `tools/ai-workflow/`、`.ai-workflow/`、Git hook 入口及对应测试和文档。
- 运行时锁、队列、缓存、快照和报告写入 `.git/ai-workflow/`，不污染工作区。
- 扩展现有 `skills-lock.json` 前先验证安装器 round-trip；各 Agent Skill 目录仅作为受管镜像。
- 不修改应用 schema、IPC、导出协议或业务持久化，不新增运行时依赖，不记录 API 密钥。
- 初始阶段保持兼容：默认观测、不阻断；强制门禁仅在后续阶段显式启用。

```

## openspec/changes/ai-workflow-governance/design.md

- Source: openspec/changes/ai-workflow-governance/design.md
- Lines: 1-44
- SHA256: 50aee092c4415c88383c5af24d698a58f99f3539d8782e65efc60077904270d1

```md
## Context

仓库已安装多套 Agent/Skill 工具，但它们各自管理入口和状态。详细技术设计已在 `docs/superpowers/specs/2026-07-12-ai-workflow-governance-design.md` 完成七节评审并批准；本文件只记录 OpenSpec 层的架构决策。

## Goals / Non-Goals

**Goals:**

- 用仓库内、零运行时依赖的 Node CLI 统一验证、调度、交接、迁移和来源同步。
- 严格区分 Git index、工作区和运行时状态，所有写操作可审计、可恢复。
- 以渐进阶段上线，验证真实收益后才提升门禁强度。

**Non-Goals:**

- 不建设远程调度服务、通用 CI 平台或跨主机分布式锁。
- 不修改 Comet、OpenSpec、Superpowers 的生成器和私有配置。
- 不改变 Endless Creation 的业务 schema、IPC、导出协议或数据持久化。

## Decisions

1. **仓库模板加项目适配层**：通用实现放在 `tools/ai-workflow/`，业务规则放在 `.ai-workflow/`。相比全局工具或项目硬编码，这保留可移植性且不引入发布系统。
2. **Git index 是 staged 验证事实源**：使用 `git checkout-index` 导出影子工作区，避免 unstaged 内容参与验证；不使用 stash，避免改变开发者状态。
3. **单写者、本机原子锁**：用 `fs.open(..., "wx")`、FIFO ticket、PID 和 heartbeat 管理互斥；读验证可按缓存键合并。跨主机协调不在范围内。
4. **内容寻址缓存**：缓存键组合 Git tree、配置和环境版本的 SHA-256，不依赖 mtime。
5. **双模式 handoff**：`manifest.json` 是机器事实源，`context.md` 是可截断投影；staged 模式使用 binary/full-index patch。HEAD、index 或 OpenSpec phase 改变即 stale。
6. **事务迁移**：preflight、snapshot、apply、verify、promote 由 WAL 记录；失败自动 rollback，无法恢复时持久化 `recovery-required` 并阻止新迁移。
7. **Skill 锁文件收敛**：`skills-lock.json` 是唯一事实源，各 Agent 目录是受管镜像；未登记内容只报告，删除必须显式 `--prune`。
8. **渐进启用**：Observe → Targeted → Guard → Coordinate → CI/Template；bypass 必须提供理由并写审计日志。

## Risks / Trade-offs

- [影子工作区复用依赖可能触及真实目录] → 默认只读复用并在测试中覆盖写逃逸；不安全命令改用隔离安装。
- [进程崩溃遗留锁或 ticket] → PID、heartbeat 和超时共同判定，清理动作写审计。
- [上下文或 patch 过大] → context 截断并指向 manifest；patch 保持独立文件。
- [安装器重写锁文件] → 扩展字段前执行 round-trip 兼容测试，不兼容则使用旁车元数据。
- [门禁影响开发效率] → 先 Observe 收集耗时、命中率和 bypass 数据，再显式升级。

## Migration Plan

按五个启用阶段逐步推广；每次阶段切换本身通过 Migration Manager 执行并保留快照。任一阶段验证失败则回滚到上一配置；出现 `recovery-required` 时停止自动迁移并交由人工恢复。

## Open Questions

无。实现细节以已批准的 Superpowers 设计文档为准。

```

## openspec/changes/ai-workflow-governance/tasks.md

- Source: openspec/changes/ai-workflow-governance/tasks.md
- Lines: 1-25
- SHA256: b644bddaa62246dfb1f5a2e3986fbb569323f5011b70dca184365d5fb88324e5

```md
## 1. CLI 与 staged 验证

- [ ] 1.1 建立零运行时依赖 CLI、配置解析、稳定退出码和结构化报告，并用 `node:test` 覆盖命令契约
- [ ] 1.2 实现 Git index 影子工作区、四级 profile、路径规则和带理由审计 bypass，验证 unstaged 内容不会参与检查

## 2. 调度与缓存

- [ ] 2.1 实现 FIFO 单写者队列、原子锁、PID/heartbeat 恢复和死亡 ticket 清理，并覆盖并发与崩溃自检
- [ ] 2.2 实现 SHA-256 验证缓存和等价请求合并，覆盖配置、Git tree 或环境变化时的缓存失效

## 3. Handoff

- [ ] 3.1 实现 session/staged handoff、manifest 事实源、context 截断、密钥拒绝和 binary patch
- [ ] 3.2 实现 stale 检查与显式 apply，验证冲突停止、迟到状态拒绝和二进制文件往返

## 4. 迁移与来源治理

- [ ] 4.1 实现五阶段 Migration Manager、WAL、快照、自动回滚和 `recovery-required` 阻断
- [ ] 4.2 实现 `sources verify/diff/sync/update/--prune`，验证锁文件 round-trip、镜像漂移和失败回滚

## 5. 接入与验收

- [ ] 5.1 接入薄 pre-commit 入口和 Observe 阶段配置，记录耗时、缓存命中率及 bypass 频次
- [ ] 5.2 完成 Windows/Linux 命令级测试、`npm.cmd run build`、必要文本扫描和真实仓库端到端验收
- [ ] 5.3 回填 OpenSpec、Superpowers 计划、QA 台账及 rollout 状态，确认可从 Observe 安全升级或回滚

```

## openspec/changes/ai-workflow-governance/specs/ai-workflow-governance/spec.md

- Source: openspec/changes/ai-workflow-governance/specs/ai-workflow-governance/spec.md
- Lines: 1-79
- SHA256: 612d177f7bd1fbe440b3f7b09e93bfd0217d9f86f158005ecc46a3ef718af592

```md
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

```
