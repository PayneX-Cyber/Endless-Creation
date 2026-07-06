# 伏笔记录（手动 CRUD + 迁移）实施计划 —— 5d.1

规格：`docs/plans/2026-07-06-novel-foreshadowing-crud-5d1-spec.md`
类型：破零落库刀（第五阶段首个 schema 改动），零 AI。

## 白名单（只改这些）

- `src/types/novel.ts`
- `electron/main/index.ts`
- `electron/preload/bridgeTypes.ts`
- `src/services/rendererBridge.ts`
- `src/features/novel-creation/ChapterWorkbench.tsx`（禁整文件 Read，必 grep/awk）
- `src/features/novel-creation/ForeshadowingPanel.tsx`（新增）
- `src/features/novel-creation/ChapterWorkbench.css`（如需样式）

`src/types/electronBridge.ts` 不改（它 `import type { Novel }`，加字段自动继承）。

## Task

- [ ] **T1 — Schema 类型（3 处重定义对齐）**
  - `src/types/novel.ts`：新增 `Foreshadowing` 接口（id/title/plantedChapterId/status/payoffChapterId?/note?/createdAt/updatedAt）；`Novel` 加 `foreshadowings: Foreshadowing[]` 与 `version: 4`。
  - `electron/main/index.ts` 内嵌 Novel 类型（:96-111 附近）+ `electron/preload/bridgeTypes.ts` 逐字镜像同款字段与 `version: 4`。

- [ ] **T2 — 迁移 / sanitize（本刀核心验证点）**
  - main 侧新增 `sanitizeForeshadowings(value, now)`（仿 `sanitizeChapterVersions`）：非数组→`[]`；每条 title 非空才留、id 缺补 `randomUUID()`、status 只收 `'planted'|'paidOff'` 否则 `'planted'`、其余 string 兜底、时间戳缺补 now。
  - `sanitizeNovel` 返回体加 `foreshadowings: sanitizeForeshadowings(candidate.foreshadowings, now)`，`version` 改写 `4`。
  - `createNovel`（main + rendererBridge web fallback）新建时 `foreshadowings: []`。
  - 不写 `if (version < 4)` 分支；不动 chapter/version 结构。

- [ ] **T3 — ForeshadowingPanel.tsx（受控 CRUD 面板，新增）**
  - props：`foreshadowings`、`chapters`、以及新增/编辑/切状态/删除的写入回调（不自己落库）。
  - 装：列表（派生「待回收」/「已回收」）、新增/编辑表单、章节下拉（含「未指定」，显示序号+标题，悬空引用显示「章节已删除」）、删除 `window.confirm`。
  - 不 export 出 novel-creation 之外。

- [ ] **T4 — ChapterWorkbench 挂载**
  - 加「伏笔」入口按钮 + 挂 `ForeshadowingPanel`，传 `novel.foreshadowings`/`chapters` + 写入回调（走现有 `updateNovel` 链）。
  - 不碰 AI 检查/optimize/outline/generation/导出/多版本；不改 `deleteChapterById`（策略 A）。

- [ ] **T5 — 验证（主 agent 独立复核，不采信工程师汇报）**
  - build 双绿（renderer tsc+vite / electron tsc，3 处重定义对齐由 renderer tsc 亲证）。
  - 双目录文本扫描 + 坏文案 grep 零命中。
  - 完整 diff 原始字节核对：未越界改 AI 检查/optimize/outline/generation/导出/多版本；`deleteChapterById` 逐字未动。
  - **GUI 实测（落库刀必做，PO 亲测）**：旧小说迁移不崩+落 `version:4`/`foreshadowings:[]`；CRUD 重载后一致；空 title 不落库；删章悬空显示「章节已删除」不崩；派生提示切换即时。

## 流程

spec commit → plan commit → 派前端工程师（派单写死白名单 + 三条硬警告：只改白名单 / ChapterWorkbench 禁整文件 Read 必 grep-awk / ForeshadowingPanel 不自己落库不接 AI 不碰删章）→ 主 agent 独立复核 → PO GUI 实测 → 实现 commit。
