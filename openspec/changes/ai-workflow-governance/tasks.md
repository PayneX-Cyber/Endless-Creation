## 1. CLI 与 staged 验证

- [x] 1.1 建立零运行时依赖 CLI、配置解析、稳定退出码和结构化报告，并用 `node:test` 覆盖命令契约
- [x] 1.2 实现 Git index 影子工作区、四级 profile、路径规则和带理由审计 bypass，验证 unstaged 内容不会参与检查

## 2. 调度与缓存

- [x] 2.1 实现 FIFO 单写者队列、原子锁、PID/heartbeat 恢复和死亡 ticket 清理，并覆盖并发与崩溃自检
- [x] 2.2 实现 SHA-256 验证缓存和等价请求合并，覆盖配置、Git tree 或环境变化时的缓存失效

## 3. Handoff

- [x] 3.1 实现 session/staged handoff、manifest 事实源、context 截断、密钥拒绝和 binary patch
- [x] 3.2 实现 stale 检查与显式 apply，验证冲突停止、迟到状态拒绝和二进制文件往返

## 4. 迁移与来源治理

- [x] 4.1 实现五阶段 Migration Manager、WAL、快照、自动回滚和 `recovery-required` 阻断
- [x] 4.2 实现 `sources verify/diff/sync/update/--prune`，验证锁文件 round-trip、镜像漂移和失败回滚

## 5. 接入与验收

- [x] 5.1 接入薄 pre-commit 入口和 Observe 阶段配置，记录耗时、缓存命中率及 bypass 频次
- [x] 5.2 完成 Windows/Linux 命令级测试、`npm.cmd run build`、必要文本扫描和真实仓库端到端验收
- [x] 5.3 回填 OpenSpec、Superpowers 计划、QA 台账及 rollout 状态，确认可从 Observe 安全升级或回滚

## 6. Verify 返修

- [x] 6.1 staged 验证从 index shadow 读取配置并复用仓库依赖，workspace/ci 缓存按真实内容正确失效
- [x] 6.2 handoff 针对接收仓库检查 stale，并在 apply 前校验 patch checksum
- [ ] 6.3 `sources update` 用单次 Migration Manager 事务覆盖锁文件与镜像，任一失败全部回滚
- [ ] 6.4 补齐 `doctor`、`scheduler`、`migrate` CLI 路由和统一结构化运行报告
- [ ] 6.5 重跑压力测试、构建、OpenSpec strict validate、文本扫描与完整代码审查
