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
