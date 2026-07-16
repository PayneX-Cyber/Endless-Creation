# V1 本地种子版最终收口实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` to execute each task group continuously. Do not stop for intermediate product decisions unless a data-loss or destructive migration risk is discovered.

**Goal:** 一次完成 Endless Creation 本地种子版的真实全链路验收、阻断修复、假入口清理和文档事实源收口。

**Architecture:** 不新增框架、依赖、账户、云存储或支付能力。复用现有 Electron bridge、模块内 `assertXxxSelfCheck()`、独立 Electron profile 和 Playwright；测试 mock 只截断文件选择与 AI 网络请求，产品持久化继续走真实 IPC 和磁盘。

**Tech Stack:** Electron、React、TypeScript、Playwright Electron、OpenSpec、现有模块自检。

## Global Constraints

- 从最新 `main` 创建 `codex/v1-local-seed-final-closure`。
- 不提交 `.agent/`、`.agents/`、`.claude/`、`.codegraph/`、`.codex/`、`skills-lock.json`。
- 不修改真实用户 Electron profile、API 配置或 AiMaMi 代理配置。
- 只修阻断、数据风险、假入口和明显体验问题；新产品能力另开 OpenSpec change。
- 每个 bug 必须先复现，再在共享根因处做最小修复，并留下一个模块自检或可重复 GUI 断言。
- 每个任务组完成后提交；整包结束前不中断询问“是否继续”。

---

### Task 1: 产品入口与事实源清场

**Files:**
- Modify: `src/app/App.tsx`
- Modify: `docs/README.md`
- Modify: `docs/plans/2026-07-06-v1-roadmap-adjusted.md`

**Deliverable:** 用户启动后直接进入可用工作区，不再看到空白首页或三个空白功能入口；文档不再声称已有活动 change。

- [ ] 从 `main` 创建分支，记录 `git status --short --branch` 和基线提交。
- [ ] 确认 `home`、`script-workbench`、`video-workbench`、`prompts` 当前都进入 `blank-workspace`。
- [ ] 将 `activeNavId` 默认值改为已实现的 `novel`。
- [ ] 从 `sidebarNavItems` 删除未实现的首页、剧本、视频、提示词入口；保留画布、小说、生图、资产。
- [ ] 删除不再使用的对应图标 import 和 `PrimaryNavId` 成员，依靠 TypeScript 找齐引用。
- [ ] 在现有 App 自检或最小静态断言中确认所有可见 nav id 都有真实渲染分支。
- [ ] 更新 `docs/README.md`：无活动 OpenSpec change；小说 v8 和治理 change 均已归档。
- [ ] 更新路线图：本地种子版验收范围仅包含当前已实现模块，剧本/视频/提示词不得计入完成能力。
- [ ] 运行 build 和文本完整性扫描。
- [ ] 提交：`fix: remove blank product entry points`

### Task 2: 小说 AI 分析与失败路径补验

**Files:**
- Modify only if a bug is found: `src/features/novel-creation/NovelCreation.tsx`
- Modify only if a bug is found: `src/features/novel-creation/NovelCharacterGraph.tsx`
- Modify only if a bug is found: `src/features/novel-creation/EmotionArcPanel.tsx`
- Modify only if a bug is found: `src/features/novel-creation/ChapterWorkbench.tsx`
- Temporary QA: `.codex/qa-v1-final.cjs`

**Deliverable:** 小说 v8 尚未 GUI 覆盖的 AI 功能全部通过真实界面 smoke，成功、取消、失败均不串线、不丢数据。

- [ ] 用独立 profile 创建含两卷、多章、多场景、设定与伏笔的小说。
- [ ] mock `api:generate-text`，按 `requestType` 返回人物图谱、情感分值、评审、一致性和节奏结果。
- [ ] 从 GUI 生成人物关系候选，确认后落库；切 tab 再返回仍显示。
- [ ] 从 GUI 分析全部章节情感，确认候选落库；单章重分析只替换该章。
- [ ] 分别执行章节评审、一致性检查、节奏检查，确认结果只读且不改正文。
- [ ] 在第二次运行注入一次失败和一次延迟请求，确认错误可见、取消后无后续写入、切场景不串线。
- [ ] 关闭并重启 Electron，确认图谱、情感曲线和场景正文恢复。
- [ ] 若发现 bug：先添加最小失败自检，再修共享根因；否则不改源码。
- [ ] 运行 build。
- [ ] 有源码修复才提交：`fix: close novel analysis QA findings`

### Task 3: 生图到资产库完整闭环

**Files:**
- Modify only if a bug is found: `src/features/image-workbench/ImageWorkbench.tsx`
- Modify only if a bug is found: `src/services/projectAssetService.ts`
- Modify only if a bug is found: `src/features/asset-management/AssetManagement.tsx`
- Modify only if a bug is found: `electron/main/index.ts`
- Temporary QA: `.codex/qa-v1-final.cjs`

**Deliverable:** 一次生图结果能落本地、进入历史和项目资产库，重启后仍可预览；失败不会生成幽灵记录。

- [ ] 在隔离 profile 写入仅用于 QA 的图像模型配置。
- [ ] mock `api:generate-image` 返回一张固定 1×1 PNG base64，生成仍走真实 UI、历史与保存路径。
- [ ] 从生图工作台输入 prompt、选择尺寸和数量，触发生成并确认预览可见。
- [ ] 确认生成历史记录包含 prompt、模型、项目和本地文件引用。
- [ ] 将生成结果加入当前项目资产，进入资产管理确认图片、来源和预览。
- [ ] 新建一条文本资产，执行搜索、编辑、取消编辑和删除。
- [ ] 重启 Electron，确认图片历史、图片资产、文本资产都按 projectId 恢复且不串项目。
- [ ] 注入生成失败，确认错误脱敏、无空结果、无资产记录。
- [ ] 若发现 bug：在 `projectAssetService` 或现有共享函数根因处最小修复并留自检。
- [ ] 运行 build 和文本完整性扫描。
- [ ] 有源码修复才提交：`fix: close image asset QA findings`

### Task 4: 画布与项目隔离 smoke

**Files:**
- Modify only if a bug is found: `src/features/canvas-workbench/*`
- Modify only if a bug is found: `src/app/App.tsx`
- Temporary QA: `.codex/qa-v1-final.cjs`

**Deliverable:** 两个项目的画布会话互不串线，核心编辑和重启行为可用。

- [ ] 从项目中心分别进入两个项目的画布库。
- [ ] 在项目 A 打开画布、创建两个节点、编辑文本并建立连线。
- [ ] 切项目 B，确认不显示项目 A 的活动画布状态；再切回 A，状态正确恢复。
- [ ] 验证缩放、平移、撤销/重做、删除节点和返回画布库。
- [ ] 重启应用，确认当前明确承诺持久化的数据恢复；纯会话态按设计重置。
- [ ] 在最小现实窗口检查工具栏、画布和缩放控件无裁切。
- [ ] 若发现 bug：只修共享 projectId/画布 id 锚点或对应交互根因。
- [ ] 运行 build 和文本完整性扫描。
- [ ] 有源码修复才提交：`fix: close canvas isolation QA findings`

### Task 5: 桌面壳、设置与视觉验收

**Files:**
- Modify only if a bug is found: `src/app/App.tsx`
- Modify only if a bug is found: `src/features/settings/SettingsPage.tsx`
- Modify only if a bug is found: relevant existing CSS file
- Temporary QA: `.codex/qa-v1-final.cjs`

**Deliverable:** 用户可从启动页顺畅进入四个真实模块，设置和主题可恢复，常用窗口尺寸无裁切。

- [ ] 验证侧栏展开/折叠、四个真实模块导航、项目切换和设置开关。
- [ ] 验证深浅主题切换后重启恢复。
- [ ] 验证 API 渠道新增、编辑、启停、模型选择和敏感字段不出现在日志。
- [ ] 在 1266×754 和 1024×720 两档 Electron 内容区截图。
- [ ] 对小说工作台、生图工作台、资产管理、画布分别检查水平溢出、按钮裁切、弹窗越界和文本重叠。
- [ ] 完成 60 秒随机探索：快速切模块、开关弹窗、连续取消操作。
- [ ] 若发现视觉 bug：只改现有 CSS 约束，不重做设计系统。
- [ ] 运行 build 和文本完整性扫描。
- [ ] 有源码修复才提交：`fix: close desktop shell QA findings`

### Task 6: 最终证据、规格与交付

**Files:**
- Create: `docs/qa/2026-07-16-v1-local-seed-final-closure.md`
- Modify: `docs/README.md`
- Modify: `docs/plans/2026-07-06-v1-roadmap-adjusted.md`

**Deliverable:** 仓库事实源、QA 证据和 Git 状态一致，形成一个可直接合并的最终 PR。

- [ ] QA 文档逐项记录 Task 1-5 的通过/失败/修复、截图名和明确未覆盖项。
- [ ] 将剧本、视频、提示词、账户、OSS、支付列为未实现或后置，不写成“已完成”。
- [ ] 更新 README 当前状态和 QA 索引。
- [ ] 更新路线图阶段门：内部狗粮通过不等于真实种子用户反馈；Phase 4 仍不启动。
- [ ] 运行 `npm.cmd run build`，期望 exit 0。
- [ ] 运行文本完整性扫描，期望 `TEXT INTEGRITY OK`。
- [ ] 运行 `openspec validate --all --strict`，期望全部通过。
- [ ] 运行 `git diff --check`，期望无输出。
- [ ] 检查提交范围，不包含平台目录、QA profile、截图或 mock 配置。
- [ ] 提交：`docs: record V1 local seed final closure`
- [ ] 进行一次 whole-branch code review；只处理 Critical/Important。
- [ ] 推送分支并创建 PR 到 `main`；PR 合并后同步本地 `main`。

## Completion Gate

以下条件必须同时满足，才可宣布“一次清完”：

- 启动后没有空白默认页和可点击的空白主导航。
- 小说导入、卷章场景、AI 分析、版本、搜索、导出、重启恢复通过。
- 生图结果、历史、项目资产、失败路径和重启恢复通过。
- 画布项目隔离与核心编辑 smoke 通过。
- 设置、主题、项目切换和两档窗口视觉检查通过。
- build、文本扫描、OpenSpec strict、diff check 全绿。
- 文档只声明真实完成能力，所有后置项明确列出。
