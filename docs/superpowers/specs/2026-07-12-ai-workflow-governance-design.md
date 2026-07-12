---
comet_change: ai-workflow-governance
role: technical-design
canonical_spec: openspec
---

# AI 工作流治理与防腐化基建设计

日期：2026-07-12
状态：七节设计已逐节确认，等待实施计划。

## 1. 目标与边界

### 1.1 目标

在不修改 Comet、OpenSpec、Superpowers 安装器生成文件的前提下，为 AI Agent、人类开发者、Git hook 和 CI 提供统一的本地工作流治理层：

- 根据改动范围选择 `targeted / fast / full / ci` 验证。
- pre-commit 只验证 staged 状态，失败默认阻止提交。
- 所有写操作通过单写者 Node 调度器串行化。
- 成功验证可按确定性缓存键复用。
- 提供 `session / staged` 双模式 handoff。
- 提供可快照、验证、自动回滚的工作流迁移。
- 以 `skills-lock.json` 收敛 Skill、插件和工具来源。
- 核心工具零运行时依赖，可复制到其他仓库。

### 1.2 非目标

- 不管理小说业务数据、Electron schema 或用户项目文件迁移。
- 不替代 Comet 的阶段守卫、OpenSpec 的规格生命周期或 Superpowers 的设计与执行方法。
- 不实现远程分布式调度、远程缓存或多机锁。
- 不静默解决 Git 冲突、接受新来源 hash 或删除未登记 Skill。
- 不记录 API Key、环境变量值或其他敏感内容。

## 2. 总体架构

```text
开发者 / Agent / Git hook / CI
              |
              v
    tools/ai-workflow/cli.mjs
              |
      单写者调度器 + FIFO 队列
       /       |        \
  验证引擎   handoff   迁移管理器
     |          |          |
 四级配置     双模式包    快照/应用/验证/回滚
     |
 Comet / OpenSpec / Superpowers / npm / Git
```

目录：

```text
tools/ai-workflow/          可复制、零依赖的 Node 核心
.ai-workflow/
  config.json               项目路径、验证和门禁配置
  migrations/               版本化迁移定义
  reports/                  可提交的报告模板
.git/ai-workflow/           锁、队列、缓存、影子目录、快照、运行报告和审计
.githooks/pre-commit        极薄 Git hook 入口
skills-lock.json            Skill、插件与工具来源事实
```

约束：

- 所有入口最终调用同一个 CLI。
- 工具核心不包含 Endless Creation 业务路径；路径映射只在项目配置中声明。
- 可提交目录只保存配置与迁移定义，运行状态全部进入 `.git/ai-workflow/`。
- 工作流核心不得直接改写 Comet/OpenSpec/Superpowers 的安装器源码。

## 3. 四级验证与 pre-commit

### 3.1 验证级别

| 级别 | 用途 | 最低检查 |
| --- | --- | --- |
| `targeted` | 默认、低风险 | 按 staged/workspace 路径执行最低充分检查 |
| `fast` | 中风险或手动 | `git diff --check`、文档检查、TypeScript 双端构建 |
| `full` | 重大改动、Comet verify | `fast`、文本完整性、OpenSpec/Comet doctor、完整构建 |
| `ci` | 干净 CI 环境 | 干净安装后执行 `full`，禁用缓存和绕过 |

项目路径规则由 `.ai-workflow/config.json` 声明：

- `docs/**`、`README.md`：Markdown 链接、格式和占位符。
- `src/**`：renderer 构建。
- `electron/**` 与 bridge 类型：Electron 构建。
- `openspec/**`、`.comet/**`：OpenSpec validate、Comet doctor。
- `skills-lock.json` 与 Skill 镜像：来源和漂移检查。
- schema、IPC、依赖清单和工作流配置属于高风险路径，自动升级验证级别。

### 3.2 staged 影子工作区

pre-commit 只读取 index：

1. 使用 `git checkout-index --all --prefix=<shadow>/` 导出 staged tree。
2. 从 `.git/ai-workflow/shadow/<run-id>/` 执行验证。
3. staged 新文件进入 shadow；unstaged 修改不参与。
4. 不创建 `node_modules` 软链接。shadow 位于仓库 `.git/` 下，由 Node 向父目录解析现有依赖。
5. 依赖清单变化时升级为 `ci`，在隔离目录执行干净安装。
6. 验证结束删除 shadow；失败只保留运行报告。

### 3.3 门禁与逃生

- pre-commit 验证失败时退出非零并阻止提交。
- `AI_WORKFLOW_BYPASS="具体原因"` 可临时放行；空原因无效。
- 绕过记录时间、分支、HEAD、staged tree hash 和原因到 `audit.jsonl`。
- 不提供无审计的第二套逃生变量。

## 4. 单写者调度器、队列与缓存

### 4.1 运行目录

```text
.git/ai-workflow/
  writer.lock
  queue/*.json
  cache/<key>.json
  runs/<run-id>.json
  audit.jsonl
  shadow/<run-id>/
```

### 4.2 FIFO 与锁

```text
创建原子 ticket
  -> 等待成为队首
  -> fs.open(writer.lock, "wx")
  -> 执行或读取缓存
  -> 原子写报告
  -> 释放锁并删除 ticket
```

- ticket 包含 PID、创建时间、heartbeat、命令和请求类型。
- 调度器处理队首前检查 PID，自动剔除死票并审计。
- writer lock 包含 PID、启动时间、heartbeat 和命令。
- PID 不存在且 heartbeat 超时才可清理孤儿锁。
- PID 仍存活时绝不抢锁。
- 正常退出、`SIGINT` 和 `SIGTERM` 执行幂等清理；强杀由后续调用恢复。
- 写操作永不合并，只按 FIFO 串行。

### 4.3 缓存

缓存键为以下输入的 SHA-256：

```text
工具版本
+ profile
+ HEAD
+ staged tree hash / workspace diff hash
+ untracked 文件内容 hash
+ config hash
+ 实际命令列表
+ Node/npm/OpenSpec/Comet 版本
```

- 不使用 mtime 作为正确性依据。
- 相同缓存键的并发验证只执行一次，其余请求读取同一成功结果。
- 失败结果只记录，不作为下次通过依据。
- `ci` 禁用缓存。

## 5. Handoff 双模式

### 5.1 模式

| 模式 | 适用场景 | 事实边界 |
| --- | --- | --- |
| `session` | 未暂存、探索或实现中 | HEAD、工作区状态、决策和验证记录 |
| `staged` | 已形成明确交付边界 | HEAD、index tree、staged binary patch |
| `auto` | 默认 | 有 staged diff 选 `staged`，否则选 `session` |

### 5.2 命令与产物

```text
ai-workflow handoff create --mode auto
ai-workflow handoff inspect <id>
ai-workflow handoff accept <id>
ai-workflow handoff list
ai-workflow handoff prune
ai-workflow handoff export <id>
```

```text
.git/ai-workflow/handoffs/<id>/
  manifest.json
  context.md
  staged.patch
  checksums.json
```

`manifest.json` 是机器事实，包含：

- 仓库 identity、分支、HEAD、index tree。
- mode、工具版本、创建时间和 PID。
- Comet active change、phase 与 OpenSpec artifact 路径。
- modified、staged、untracked 文件清单。
- 最近验证的 profile、缓存键、结果和报告。
- 已确认决策、剩余任务和建议下一动作。
- 来源文件路径和 SHA-256。

`context.md` 只供 Agent 阅读：

- 不作为机器恢复事实源。
- 默认最多 2,000 行。
- 超限写入 `[Diff truncated, see manifest for details]` 和完整来源。
- staged patch 固定由 `git diff --cached --binary --full-index` 生成。

### 5.3 安全、接受与过期

- 创建前扫描敏感文件和疑似密钥；命中时拒绝生成，不静默脱敏。
- 产物先写临时目录，完成 checksum 后原子 rename。
- `session` accept 只恢复上下文，不修改文件。
- `staged` 默认验证 index；应用 patch 必须显式 `--apply`。
- patch 冲突时停止，不自动三方合并。
- HEAD、index tree 或 OpenSpec phase 变化即 stale。
- stale 包可 inspect，但不可直接 accept/apply。
- 默认保留最近 20 个或 14 天，先到者清理。
- 跨机器传递必须显式 export，输出单个校验包。

## 6. Migration Manager

迁移仅管理 AI 工作流工具和受管镜像。

### 6.1 定义

```text
.ai-workflow/migrations/
  001-initialize-workflow.json
  002-upgrade-validation-schema.json
```

每个迁移声明：

- `id`、`fromVersion`、`toVersion`。
- 受管路径白名单。
- 前置条件、目标 checksum 和兼容版本。
- 复制、写入、删除操作。
- 迁移专属验证命令 ID。
- 禁止内嵌任意 shell；命令 ID 必须预先登记。

### 6.2 五阶段

1. **Preflight**
   - 版本必须连续，不允许跳级。
   - 校验工具版本、来源锁和目标路径。
   - 受管路径存在未提交修改时拒绝。
   - `--dry-run` 只输出操作和风险。

2. **Snapshot**
   - 快照内容、Git mode、存在/不存在状态和 SHA-256。
   - 保存到 `.git/ai-workflow/migrations/<run-id>/snapshot/`。
   - 自校验通过后才可 apply。

3. **Apply**
   - 获取单写者锁。
   - 严格遵守 WAL：先 `appendFile` journal 并 `fsync`，再执行文件操作。
   - 写入使用临时文件和原子 rename。
   - 删除只允许白名单路径。

4. **Verify**
   - 校验目标 checksum 和目录结构。
   - 执行迁移 targeted 检查。
   - 执行 OpenSpec/Comet doctor、来源漂移和 `full` 验证。
   - 任一强制检查失败自动 rollback。

5. **Promote**
   - 原子更新 `.ai-workflow/version.json`。
   - 写成功报告和审计。
   - 快照保留 14 天。

### 6.3 回滚与恢复

- 回滚依据独立快照，不使用 `git reset/checkout`。
- 恢复内容、存在状态和 Git index mode；Windows 不依赖 `fs.chmod`。
- 回滚后校验 snapshot checksum 并运行迁移前基线检查。
- 回滚幂等，可通过 `migrate rollback <run-id>` 重放。
- 回滚再次失败时进入 `recovery-required`：
  - 释放全局 writer lock，避免阻塞其他只读验证。
  - 对该 migration ID 写持久阻断标记，禁止后续迁移。
  - 保留现场、快照、journal 和逐步恢复命令。

### 6.4 路径

- 迁移逐版本执行，不允许 `1 -> 3` 跳过 `2`。
- 新项目使用 `initialize`，已有项目使用 `migrate`，二者共用引擎。
- 每次迁移通过当次快照保证回滚，不长期维护反向迁移脚本。

## 7. Skill、插件与工具来源

### 7.1 唯一事实源

向后兼容扩展 `skills-lock.json`：

```json
{
  "version": 1,
  "skills": {},
  "plugins": {},
  "tools": {}
}
```

- 保留现有 `version`、`skills`、`source`、`sourceType`、`skillPath` 和 `computedHash` 语义。
- `plugins` 记录 npm 来源、resolved version 和 integrity。
- `tools` 记录 Comet 等外部工具版本和受管路径。
- 写回使用确定性两空格 JSON，并测试未知字段、顺序和格式不丢失。
- 不引入 `comment-json` 等运行时依赖。

### 7.2 镜像

```text
skills-lock.json       来源事实
.agents/skills/        受管镜像
.codex/skills/         受管镜像
.claude/skills/        受管镜像
.agent/skills/         兼容镜像
```

- Superpowers 按 lock 中目录 hash 验证。
- OpenSpec 按 npm resolved version/integrity 验证。
- Comet 按锁定 CLI 版本验证脚本、规则和镜像。
- 本地 Skill 只允许仓库白名单内的 `sourceType: local`。
- `.claude/settings.local.json` 等用户配置不参与同步。

### 7.3 操作与安全

```text
ai-workflow sources verify
ai-workflow sources diff
ai-workflow sources sync --dry-run
ai-workflow sources sync [--prune]
ai-workflow sources update <name> --to <version>
```

- `verify` 和 `diff` 只读。
- `sync/update` 必须经过 Migration Manager。
- `--prune` 必须显式使用、展示删除清单并经过快照。
- 允许固定 GitHub、npm 和仓库内 local 来源。
- 禁止浮动 `latest/main`；必须解析为 commit/version 与 integrity。
- 新来源首次加入需要显式确认。
- hash 不一致默认失败，不自动接受。
- 未登记镜像报告 `unmanaged`，默认不删除。
- 锁文件 Git 冲突禁止手工拼 hash；恢复主线锁后重新运行 `sources update`。

## 8. CLI 与报告

### 8.1 命令

```text
node tools/ai-workflow/cli.mjs <command>

validate <targeted|fast|full|ci> [--staged|--workspace] [--no-cache] [--json]
hook <install|uninstall|status|run>
scheduler <status|recover|prune>
handoff <create|inspect|accept|list|prune|export>
migrate <status|plan|apply|rollback|prune>
sources <verify|diff|sync|update>
doctor
```

package scripts 提供常用入口：

```text
workflow:doctor
workflow:validate
workflow:handoff
workflow:ci
```

### 8.2 退出码

| 退出码 | 含义 |
| --- | --- |
| `0` | 成功或成功命中缓存 |
| `1` | 验证失败 |
| `2` | 配置或参数错误 |
| `3` | 调度器超时 |
| `4` | `recovery-required` |
| `5` | 敏感信息或来源安全失败 |

### 8.3 Hook

```sh
exec node tools/ai-workflow/cli.mjs hook run pre-commit
```

- 安装前检查 `core.hooksPath` 和现有 hook，未知 hook 存在时拒绝覆盖。
- 使用 `git update-index --chmod=+x` 维护跨平台 Git mode。
- hook 只验证 staged shadow。

### 8.4 报告

运行报告 schema：

```json
{
  "schemaVersion": "ai-workflow.run.v1",
  "runId": "run-id",
  "command": "validate",
  "profile": "targeted",
  "scope": "staged",
  "cacheKey": "sha256",
  "cacheHit": false,
  "startedAt": "ISO-8601",
  "durationMs": 0,
  "checks": [],
  "result": "pass"
}
```

- 终端只输出短摘要。
- 完整报告进入 `.git/ai-workflow/runs/`。
- 报告不得包含环境变量值、密钥或完整敏感文件内容。

## 9. 测试与验收

使用 Node 内置 `node:test`。

### 9.1 单元测试

- 路径规则和 profile 升级。
- 缓存键稳定性与失效。
- PID/heartbeat 锁恢复和死票清理。
- 敏感信息扫描。
- handoff stale 与 checksum。
- migration journal 状态机和 WAL 顺序。
- Skill hash 与 unmanaged 检测。
- JSON lock round-trip。

### 9.2 临时 Git 仓库集成测试

- shadow 只含 staged，不含 unstaged。
- binary patch 可生成和恢复。
- 两进程竞争时 FIFO 串行。
- 相同验证请求只执行一次。
- apply/verify 故障自动回滚。
- rollback 二次故障进入 `recovery-required`。
- Windows hook mode 使用 Git index 语义。
- 锁文件未知字段和格式不丢失。

### 9.3 项目验收

- 四级验证真实执行。
- pre-commit 通过、阻止和审计绕过。
- session/staged handoff 创建、过期和接受。
- 模拟迁移成功与失败回滚。
- OpenSpec/Comet/Superpowers 来源漂移检测。
- `npm.cmd run build` 和文本完整性扫描通过。

## 10. 五阶段启用

1. **Observe**：启用 `doctor/validate`，不安装 hook。
2. **Targeted**：启用路径规则与缓存。
3. **Guard**：安装阻断式 pre-commit。
4. **Coordinate**：启用队列、handoff、迁移和来源治理。
5. **CI/Template**：启用无缓存 CI 并提取可复制模板。

每阶段记录：

- p50/p95 验证耗时。
- 缓存命中率。
- bypass 次数与原因。
- 死锁/死票恢复次数。
- 自动回滚成功率。
- 误阻断和漏检。

任一阶段异常通过 Migration Manager 回到上一稳定版本。

## 11. 实施约束

- 首版仍是单机本地工具，不扩展远程服务。
- 所有文件系统写操作限制在配置白名单和 `.git/ai-workflow/`。
- 任何删除、覆盖、镜像同步前必须有可校验 snapshot。
- 工作区已存在的非本任务修改不得被回滚或纳入迁移。
- 实施计划应按端到端能力切分，不按文件或纯协议小步拆碎。
- 设计与实现之间出现偏差时，先更新 OpenSpec delta spec 和本文的 Implementation Divergence，再继续验证。
