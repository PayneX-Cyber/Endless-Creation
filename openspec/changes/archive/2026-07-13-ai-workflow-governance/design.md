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
