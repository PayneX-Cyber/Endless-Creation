---
change: ai-workflow-governance
design-doc: docs/superpowers/specs/2026-07-12-ai-workflow-governance-design.md
base-ref: dd5b9dd998bc6e2e80783cc3d487b80f96ffb084
---

# AI 工作流治理基建实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在仓库内提供可移植、零运行时依赖的 AI 工作流治理 CLI，覆盖 staged 验证、并发协调、handoff、迁移回滚和 Skill 来源同步。

**Architecture:** `tools/ai-workflow/` 只使用 Node 标准库和 Git，`.ai-workflow/config.json` 承载项目规则，`.git/ai-workflow/` 保存全部运行时状态。CLI 是唯一入口，各能力以小型模块组合，测试在临时 Git 仓库中验证真实行为。

**Tech Stack:** Node.js ESM、`node:test`、Git CLI、JSON/JSONL、PowerShell/跨平台 shell。

## Global Constraints

- 核心工具零运行时依赖，不新增 npm 包。
- staged 验证只能读取 Git index，不能 stash 或改变真实工作区。
- 不使用 `git reset`、`git checkout` 回滚用户文件。
- 密钥检测失败必须拒绝 handoff，不静默脱敏。
- 运行时状态只写 `.git/ai-workflow/`；受管配置写 `.ai-workflow/`。
- 不修改应用 schema、IPC、导出协议或业务持久化。

---

### Task 1: CLI、配置与 staged-only 验证

**Files:**
- Create: `tools/ai-workflow/cli.mjs`
- Create: `tools/ai-workflow/lib/core.mjs`
- Create: `tools/ai-workflow/lib/validate.mjs`
- Create: `tools/ai-workflow/test/validate.test.mjs`
- Create: `.ai-workflow/config.json`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `run(argv, env) -> Promise<number>`；`loadConfig(root)`；`validate({root, profile, staged})`。
- Produces exit codes: `0 success`, `1 validation failure`, `2 usage/config`, `3 blocked`, `4 recovery-required`, `5 internal`.

- [ ] **Step 1: 写失败测试**

在临时 Git 仓库提交基线文件，再让同一文件 staged 内容合法、working tree 内容非法；调用 `validate({ staged: true })`，断言命令只看到 index 内容。再覆盖 profile 选择、未知 profile 返回配置错误、`AI_WORKFLOW_BYPASS` 空理由拒绝和非空理由写 audit。

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tools/ai-workflow/test/validate.test.mjs`

Expected: FAIL，提示模块不存在。

- [ ] **Step 3: 实现最小 CLI 与影子工作区**

用 `git rev-parse --git-dir` 定位运行目录，用 `git checkout-index --all --force --prefix=<shadow>/` 导出 index；按 `.ai-workflow/config.json` 的路径规则选择 profile 并以 `spawn` 执行命令。所有报告写入 `.git/ai-workflow/reports/`，audit 采用追加 JSONL。

- [ ] **Step 4: 运行定向测试**

Run: `node --test tools/ai-workflow/test/validate.test.mjs`

Expected: PASS。

- [ ] **Step 5: 提交**

Run: `git add tools/ai-workflow .ai-workflow/config.json .gitignore && git commit -m "feat: add staged workflow validation"`

### Task 2: 单写者调度与内容寻址缓存

**Files:**
- Create: `tools/ai-workflow/lib/scheduler.mjs`
- Create: `tools/ai-workflow/lib/cache.mjs`
- Create: `tools/ai-workflow/test/scheduler.test.mjs`
- Modify: `tools/ai-workflow/cli.mjs`

**Interfaces:**
- Consumes: `loadConfig(root)` 与 `.git/ai-workflow/`。
- Produces: `withWriterLock(context, operation)`；`enqueue(context, request)`；`cacheKey(context)`；`readCache/writeCache`。

- [ ] **Step 1: 写失败测试**

启动两个子进程争用同一锁，断言 FIFO 且临界区不重叠；写入死亡 PID ticket 和超时 heartbeat，断言被清理并审计；相同 tree/config/environment 断言缓存命中，任一输入变化断言 miss。

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tools/ai-workflow/test/scheduler.test.mjs`

Expected: FAIL，提示调度模块不存在。

- [ ] **Step 3: 实现锁、队列和缓存**

以 `fs.open(lock, "wx")` 获取锁；ticket 保存 PID、序号和创建时间；heartbeat 原子替换。仅在 PID 不存活且 heartbeat 超时后回收。缓存键使用 `SHA-256(tree + configHash + node/git/tool versions + profile)`，成功验证才写缓存。

- [ ] **Step 4: 运行定向测试**

Run: `node --test tools/ai-workflow/test/scheduler.test.mjs`

Expected: PASS。

- [ ] **Step 5: 提交**

Run: `git add tools/ai-workflow && git commit -m "feat: add workflow scheduler and cache"`

### Task 3: 双模式 Handoff

**Files:**
- Create: `tools/ai-workflow/lib/handoff.mjs`
- Create: `tools/ai-workflow/test/handoff.test.mjs`
- Modify: `tools/ai-workflow/cli.mjs`

**Interfaces:**
- Produces: `createHandoff({root, mode})`；`inspectHandoff(path)`；`applyHandoff(path, {apply})`。
- Manifest records: HEAD、index tree、OpenSpec phase、source hashes、mode 和生成时间。

- [ ] **Step 1: 写失败测试**

覆盖 session/staged 产物、超过 2000 行 context 截断、二进制 patch 往返、疑似密钥拒绝、HEAD/index/phase 变化 stale、无 `--apply` 不修改仓库以及 patch 冲突停止。

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tools/ai-workflow/test/handoff.test.mjs`

Expected: FAIL，提示 handoff 模块不存在。

- [ ] **Step 3: 实现 handoff**

机器恢复只读取 `manifest.json`；`context.md` 只保存摘要和截断标记。staged patch 调用 `git diff --cached --binary --full-index`。生成前扫描候选文本中的密钥模式；apply 前重新计算事实字段并拒绝 stale。

- [ ] **Step 4: 运行定向测试**

Run: `node --test tools/ai-workflow/test/handoff.test.mjs`

Expected: PASS。

- [ ] **Step 5: 提交**

Run: `git add tools/ai-workflow && git commit -m "feat: add verifiable workflow handoff"`

### Task 4: 事务迁移与 Skill 来源同步

**Files:**
- Create: `tools/ai-workflow/lib/migration.mjs`
- Create: `tools/ai-workflow/lib/sources.mjs`
- Create: `tools/ai-workflow/test/migration.test.mjs`
- Create: `tools/ai-workflow/test/sources.test.mjs`
- Modify: `tools/ai-workflow/cli.mjs`

**Interfaces:**
- Produces: `runMigration({root, id, preflight, apply, verify})`；`recoverMigration(root, id)`。
- Produces: `verifySources`、`diffSources`、`syncSources`、`updateSources`，删除仅接受 `prune: true`。

- [ ] **Step 1: 写迁移失败测试**

覆盖五阶段成功、apply/verify 失败自动回滚、WAL 每阶段可恢复、回滚失败进入 `recovery-required`、阻止后续迁移，并断言未调用 reset/checkout。

- [ ] **Step 2: 写来源失败测试**

使用临时 lock 和镜像目录覆盖 verify/diff、unmanaged 默认保留、显式 prune、sync 失败恢复、integrity 不符拒绝以及安装器 round-trip 不保留字段时使用旁车元数据。

- [ ] **Step 3: 运行测试确认失败**

Run: `node --test tools/ai-workflow/test/migration.test.mjs tools/ai-workflow/test/sources.test.mjs`

Expected: FAIL，提示模块不存在。

- [ ] **Step 4: 实现迁移和来源同步**

WAL 每次 append 后 `FileHandle.sync()`；snapshot 放 `.git/ai-workflow/migrations/`，以临时目录加 rename 提升。来源操作全部委托 Migration Manager，未登记文件只报告，`--prune` 才删除。

- [ ] **Step 5: 运行定向测试并提交**

Run: `node --test tools/ai-workflow/test/migration.test.mjs tools/ai-workflow/test/sources.test.mjs`

Expected: PASS。

Run: `git add tools/ai-workflow && git commit -m "feat: add transactional workflow migrations"`

### Task 5: Hook 接入、全量验证与台账

**Files:**
- Create: `.githooks/pre-commit`
- Create: `tools/ai-workflow/test/integration.test.mjs`
- Modify: `package.json`
- Modify: `docs/README.md`
- Modify: `openspec/changes/ai-workflow-governance/tasks.md`
- Create: `docs/qa/2026-07-12-ai-workflow-governance.md`

**Interfaces:**
- Consumes: CLI 所有公开命令。
- Produces: `npm run test:ai-workflow` 与 `npm run check:ai-workflow`。

- [ ] **Step 1: 写端到端失败测试**

在临时仓库安装 hook，覆盖通过、阻止、审计 bypass、现有未知 hook 拒绝覆盖、Windows hook 执行、缓存命中、handoff 往返、迁移回滚和 sources drift。

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tools/ai-workflow/test/integration.test.mjs`

Expected: FAIL，提示 hook/命令尚未接入。

- [ ] **Step 3: 接入 Observe 阶段**

hook 只执行 `node tools/ai-workflow/cli.mjs hook run pre-commit`；安装时检查 `core.hooksPath` 和已有 hook，未知内容拒绝覆盖。使用 `git update-index --chmod=+x .githooks/pre-commit` 记录可执行位。Observe 默认只记录结果，不拦截。

- [ ] **Step 4: 运行全部验证**

Run: `npm.cmd run test:ai-workflow`

Expected: 所有 `node:test` PASS。

Run: `npm.cmd run build`

Expected: renderer 和 electron 构建成功。

Run: `python "C:\Users\x1176\.codex\skills\endless-creation-guardrails\scripts\scan_text_integrity.py" "F:\AIProject\Endless Creation\src"`

Expected: 无文本完整性错误。

- [ ] **Step 5: 真实仓库验收并回填**

依次运行 `validate targeted`、重复验证确认 cache hit、生成并 inspect staged handoff、执行 dry-run sources diff、模拟失败迁移确认 rollback。把命令、退出码、报告路径和结果写入 QA 文档，逐项勾选 OpenSpec tasks。

- [ ] **Step 6: 提交**

Run: `git add .githooks tools/ai-workflow package.json docs/README.md docs/qa openspec/changes/ai-workflow-governance && git commit -m "feat: integrate AI workflow governance"`

## Self-Review

- Spec coverage: staged 验证、调度缓存、handoff、迁移、来源治理、CLI 报告和 Observe 上线均有对应任务。
- Placeholder scan: 无 TBD/TODO/“稍后实现”。
- Interface consistency: CLI、运行目录、退出码、manifest 和 Migration Manager 名称跨任务一致。
- Scope: 未新增依赖，未触及应用 schema、IPC、导出协议或业务持久化。
