# AI 工作流治理基建验收记录

- 日期：2026-07-12
- Change：`ai-workflow-governance`
- 分支：`codex/ai-workflow-governance`
- 模式：`worktree + executing-plans + tdd + thorough`
- 上线阶段：Observe（记录但不阻断）

## 自动验证

| 检查 | 结果 |
| --- | --- |
| `npm.cmd run test:ai-workflow` | PASS，28 tests / 0 fail |
| 官方测试脚本连续压力 | PASS，3/3 |
| scheduler FIFO 专项压力 | PASS，50/50 |
| 全套高并发压力 | PASS，10/10（修复后） |
| Task 4 migration/sources 专项压力 | PASS，20/20 |
| `npm.cmd run build` | PASS，renderer + electron |
| 文本完整性扫描 | PASS，`TEXT INTEGRITY OK` |
| `git diff --check` | PASS |

## 真实命令验收

### staged validate 与缓存

- `node tools/ai-workflow/cli.mjs validate targeted --staged`：首次退出码 0。
- 相同命令第二次退出码 0。
- `.git/.../ai-workflow/cache/`：相同缓存键仅 1 条记录。
- 进程级回归确认相对/绝对脚本入口都会真正执行，不再出现“空跑返回 0”。

### Hook

- Git blob mode：`100755 .githooks/pre-commit`。
- Git for Windows `bin/sh.exe .githooks/pre-commit`：退出码 0。
- 集成测试确认：
  - 未知 `.git/hooks/pre-commit` 拒绝覆盖。
  - 未知 `core.hooksPath` 拒绝覆盖。
  - Observe 下验证失败留报告但退出 0。
  - Guard 下相同失败退出 1。
  - `AI_WORKFLOW_BYPASS` 非空理由写入 audit；空理由拒绝。

### Handoff

- staged bundle：
  `F:\AIProject\Endless Creation\.git\worktrees\ai-workflow-governance\ai-workflow\handoffs\1783870069467-37000`
- `inspect`：`stale=false`，`mode=staged`。
- 自动测试覆盖 binary patch、2000 行截断、密钥拒绝、HEAD/index/phase stale、显式 apply 和冲突停止。

### Migration

- 自动测试在真实临时目录执行 apply/verify 失败场景，均从独立 snapshot 恢复。
- WAL 的 apply intent 在文件写入前可见；实现使用 `FileHandle.sync()`。
- rollback 再失败会持久化 `recovery-required`，后续迁移被阻止并返回退出码 4。
- 生产代码未调用 `git reset` 或 `git checkout`。

### Skill 来源

- 主工作区 `sources sync --dry-run` 只读执行成功，没有修改镜像。
- 当前安装态基线：missing 28、drifted 28、unmanaged 60、unsupported 14。
- 14 个 unsupported 项来自现有 `sourceType: github` lock 记录缺少固定 commit/integrity。治理层不会把 `obra/superpowers` 误当本地路径，也不会在来源未固定时写同步。
- Observe 阶段允许以该基线启动；执行远程 `sync/update` 前必须先由安装器升级 lock，写入 resolved commit/integrity。unmanaged 默认保留，只有显式 `--prune` 才删除且删除前有 snapshot。

## 结论

Observe 阶段验收通过：验证、调度、缓存、handoff、迁移、薄 hook 和审计链可用，默认不阻断现有提交。当前 Skill 镜像尚未收敛，已作为观测基线记录；在 lock 具备固定远程来源前不得执行远程写同步，也不得升级到 Coordinate/CI 阶段。

## Verify 返修复验（2026-07-13）

首次 full verify 发现 5 个 IMPORTANT 缺口，已通过 `verify-fail` 正规退回 build 修复：

- staged shadow 从 index 读取配置并可解析仓库依赖；hook enforcement 同样以 staged 配置为准。
- workspace 缓存键纳入 tracked diff 与 untracked 内容；显式或自动选择的 ci 均不读写缓存。
- handoff apply 针对接收仓库校验 HEAD/tree/phase，并在应用前校验 patch SHA-256。
- `sources update` 以单次 snapshot/WAL 同时覆盖 lock 与镜像，失败不残留半提交状态。
- `doctor`、`scheduler`、`migrate` 命令已接通，所有 CLI 调用写 `ai-workflow.run.v1` 报告。

返修压力审查还发现并修复了等待者异常删除其他写者锁的问题；锁释放改为显式 ownership，Windows ticket 临时 `EPERM/EACCES` 留待下一轮检查。

| 检查 | 结果 |
| --- | --- |
| `npm.cmd run test:ai-workflow` | PASS，40/40，连续 3 轮 |
| scheduler 专项 | PASS，100/100 |
| migration/sources 专项 | PASS，20/20 |
| `npm.cmd run build` | PASS |
| 真实 `validate fast --staged --no-cache` | PASS，退出码 0 |
| `openspec validate ai-workflow-governance --strict` | PASS |
| 文本完整性扫描 | PASS，`TEXT INTEGRITY OK` |
| `git diff --check` | PASS |
| thorough 正确性/安全/边界审查 | PASS，无未解决 CRITICAL/IMPORTANT |
