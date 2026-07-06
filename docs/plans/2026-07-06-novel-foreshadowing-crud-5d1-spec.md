# 伏笔记录（手动 CRUD + 迁移）规格 —— 5d.1

日期：2026-07-06
类型：破零落库刀（第五阶段首个 schema 改动）。新增 `Novel.foreshadowings`，零 AI。
上位：`docs/plans/2026-06-30-novel-creation-migration-plan.md` 第五阶段「伏笔记录 / 伏笔回收提醒」。

## 背景与拆分

PO 决策：伏笔能力拆两刀，先证落库、再证 AI。

- **5d.1（本刀）**：手动伏笔 CRUD + schema 迁移。目标只有一个——**证通新 schema 从 UI → saveNovel → novel.json 落盘 → 重新加载的整条落库链**，不掺 AI 变量。
- **5d.2（后置，另起 spec）**：AI 伏笔助手（候选卡片 + 用户确认后调用 5d.1 已证通的写入路径）。本刀不做。

面向新手小白，最终价值在 AI 辅助（5d.2）；但落库链必须先由无 AL 的 5d.1 单独证明，出问题才好隔离。

## 现状基线（已核实，2026-07-06）

- `Novel.version: 3`（`src/types/novel.ts:27`）。当前无按 version 分支的迁移函数——`sanitizeNovel`（`electron/main/index.ts:433`）是**字段兜底规整**：不读 `candidate.version`，逐字段 `typeof ? : 默认`，最后硬写 `version: 3`。旧数据缺字段→取默认，天然向后兼容。**故 foreshadowings 沿用同一套：加字段兜底即迁移，无需显式 vN→vN+1 函数；version 3→4 仅作标记。**
- schema 有 **3 处重定义**须手动对齐：`src/types/novel.ts`（Novel 接口）、`electron/main/index.ts`（内嵌 Novel 类型 :96-111）、`electron/preload/bridgeTypes.ts`。另外 `src/services/rendererBridge.ts` 有 createNovel web fallback 字面量需补 `foreshadowings: []`。`src/types/electronBridge.ts` 是 `import type { Novel } from './novel'`（非重定义），加字段自动继承，**不改**。renderer tsc 亲证接口一致。
- 删章入口是**活的**：`NovelCreation.tsx:261 deleteChapterById` + UI 删除按钮（:601）。删章直接 `chapters.filter(...)` 重排 order。**故"删章后伏笔悬空引用"是真风险，非空 case（见 §4）。**
- 保存链：renderer `updateNovel` → `novelService.saveNovel` → `rendererBridge.saveNovel` → IPC → main `saveNovel`（串行队列 + tmp rename）。零新 IPC，复用现链。

## 1. Schema 字段

新增类型（`src/types/novel.ts`，并镜像 main / bridgeTypes）：

```ts
export interface Foreshadowing {
  id: string;
  title: string;                 // 伏笔简述（必需，空则不落库）
  plantedChapterId: string;      // 埋设章节引用（可为空串 = 未指定章节）
  status: 'planted' | 'paidOff'; // 埋设中 / 已回收
  payoffChapterId?: string;      // 回收章节引用（可选）
  note?: string;                 // 备注：怎么回收 / 暗示内容（可选）
  createdAt: string;
  updatedAt: string;
}
```

`Novel` 加：`foreshadowings: Foreshadowing[];` 与 `version: 4;`。

口径钉死：
- 存 **novel 级**，不挂 chapter。伏笔跨章，novel 级更直；章节只被 `plantedChapterId`/`payoffChapterId` 引用。
- `title` 是唯一必需业务字段；空 title 的条目 sanitize 时丢弃。
- `status` 非法值 → 兜底 `'planted'`。
- `plantedChapterId` 允许空串（用户可先记伏笔、后指定章节）；不校验该 id 是否真实存在于 chapters（见 §4 悬空策略）。

## 2. 迁移 / sanitize（本刀核心验证点）

新增 `sanitizeForeshadowings(value, now)`（main 侧，与 `sanitizeChapterVersions` 同款模式），并在 `sanitizeNovel` 返回体加 `foreshadowings: sanitizeForeshadowings(candidate.foreshadowings, now)`：

- 非数组 → 返回 `[]`（旧小说无此字段即走这条，向后兼容）。
- 每条：`title` 非空串才保留；`id` 缺失补 `randomUUID()`；`status` 只接受 `'planted'|'paidOff'`，否则 `'planted'`；`plantedChapterId`/`payoffChapterId`/`note` 按 string 兜底；时间戳缺失补 `now`。
- `version` 返回体改写 `4`。
- `createNovel`（main + renderer web fallback 两处）新建时 `foreshadowings: []`。

**不做**：不写 `if (version < 4)` 分支式迁移；不做数据回填脚本；不动 `sanitizeChapterVersions`/chapter 结构。

## 3. CRUD 写入路径

全部复用现有 `updateNovel`（renderer）→ `saveNovel` 链，**零新 IPC**：

- **新增**：`{ id: createId('foreshadow'), title, plantedChapterId, status:'planted', payoffChapterId?, note?, createdAt:now, updatedAt:now }` push 进 `novel.foreshadowings`。
- **编辑**：按 id map 替换，更新 `updatedAt`。
- **标记已回收 / 取消回收**：切 `status`；标记回收时可选带 `payoffChapterId`。
- **删除**：按 id filter。
- 每次操作走 `updateNovel((novel) => ({ ...novel, updatedAt, foreshadowings: ... }))`，触发既有防抖保存。

## 4. 删章后的伏笔引用处理（策略 A，PO 已拍板）

删章现状：`deleteChapterById` 只 filter chapters，**不会**联动清理引用它的伏笔。若伏笔的 `plantedChapterId`/`payoffChapterId` 指向被删章节，会留悬空 id。

**本刀采用策略 A（PO 已拍板，2026-07-06）**：
- **不联动删除、不阻止删章、不改 `deleteChapterById` 的核心逻辑。** 伏笔条目保留，悬空引用在 UI 上**降级显示**为「（章节已删除）」而非崩溃或消失。
- 四条细节钉死：
  1. `plantedChapterId`/`payoffChapterId` 在 chapters 中找不到时，显示「章节已删除」（`chapters.find(id) ?? '章节已删除'`，找不到不报错）。
  2. 编辑表单允许用户重新选择章节（把悬空引用改挂到现存章节，或改回「未指定」）。
  3. 删除章节**不修改** `foreshadowings`（`deleteChapterById` 逐字不动）。
  4. 删章时**不弹额外提示**，避免打断删章流程。
- 理由：伏笔是作者的思考记录，章节删了不代表伏笔作废（可能改挂别章）；静默删伏笔会丢用户数据，比留悬空更糟。悬空引用可修复，误删伏笔不可恢复。清理留给用户手动编辑。

## 5. UI 入口与组件边界（PO 已拍板，2026-07-06）

**落点：工作台侧（`ChapterWorkbench.tsx`），面板抽独立组件 `ForeshadowingPanel.tsx`。**

- 产品落点在工作台不变——伏笔是写作时随手记录/回收的东西，与正文上下文强相关；项目详情页是管理视图，不放那里。
- 职责切分：
  - `ChapterWorkbench.tsx` 只负责**挂入口按钮 / 传数据（novel.foreshadowings + chapters）/ 接写入回调**。
  - `ForeshadowingPanel.tsx` 装 CRUD 表单、列表、状态文案、章节降级显示。
- **关键组件边界：`ForeshadowingPanel` 不自己落库**，只通过 props 回调改 `Novel`（受控组件）。写入仍走 ChapterWorkbench 现有 `updateNovel`/saveNovel 链——即 5d.2 要复用的「已证通写入路径」。
- 面板做真实 CRUD：新增 / 编辑 / 标记已回收（可再取消）/ 删除。删除加 `window.confirm`（与删章一致的二次确认习惯）。
- **派生「待回收」提示**：`status==='planted'` 的条目列为「待回收」，`'paidOff'` 列为「已回收」。纯运行时派生，不存额外字段。
- 章节引用用下拉选 chapters（含「未指定」空项）；显示章节序号+标题；悬空引用显示「章节已删除」（§4）。
- 样式优先放 `ChapterWorkbench.css`，不新建 CSS。

## 6. 严格边界（不做什么）

- **零 AI**：不生成候选、不解析 JSON、不扫描正文、不弹提醒。全部后置 5d.2。
- 不做关系图、不接资产库、不做时间线/可信度/优先级系统。
- 不做复杂筛选 / 全文搜索 / 排序配置（列表按 createdAt 或数组顺序即可）。
- 不改删章核心逻辑（策略 A）；不新增 IPC；不动 chapter/version 结构。
- 不进蓝图导航（3a.2 已定导航只放 3 真实项）。

## 7. 验收

落库链是本刀主证目标，**必须 GUI 实测到真落盘 + 重载**：

1. **迁移兼容**：打开一本**旧小说（无 foreshadowings 字段）**→ 不崩、伏笔面板显示空、正常可用；保存后 `novel.json` 出现 `"foreshadowings": []` 与 `"version": 4`。
2. **CRUD 落盘**：新增一条伏笔 → 关闭重开 app / 重载小说 → 伏笔仍在（证 saveNovel→读回整链）。编辑、标记回收、删除同样重载后一致。
3. **必需校验**：空 title 不能落库（或落库时被 sanitize 丢弃）。
4. **删章悬空**（策略 A）：给某章记伏笔 → 删该章 → 伏笔面板不崩、该引用显示「已删除章节」、伏笔条目仍在。
5. **派生提示**：planted 显示待回收、paidOff 显示已回收，切换即时更新。
6. **零回归**：章节评审/一致性/节奏/优化选区/复制/导出/多版本 入口与行为不变。
7. build 双绿（renderer tsc+vite / electron tsc，五处 schema 镜像由 renderer tsc 亲证对齐）。
8. 双目录文本扫描 + 坏文案 grep 零命中。
9. 完整 diff 原始字节核对：确认未越界改动 AI 检查 / optimize / outline / generation / 导出 / 多版本。

## 8. 文件清单（白名单，PO 已拍板）

1. `src/types/novel.ts` — Foreshadowing 类型 + Novel.foreshadowings + version 4
2. `electron/main/index.ts` — 内嵌 Novel 类型对齐 + sanitizeForeshadowings + sanitizeNovel 加字段 + createNovel
3. `electron/preload/bridgeTypes.ts` — 镜像类型
4. `src/services/rendererBridge.ts` — createNovel web fallback 加 `foreshadowings: []`
5. `src/features/novel-creation/ChapterWorkbench.tsx` — 挂入口按钮 + 传 novel.foreshadowings/chapters + 接写入回调（走现有 updateNovel 链）；**禁整文件 Read，必 grep/awk**
6. `src/features/novel-creation/ForeshadowingPanel.tsx` — **新增**，受控 CRUD 面板（表单/列表/状态文案/章节降级显示），不自己落库
7. 样式：优先并入 `src/features/novel-creation/ChapterWorkbench.css`，不新建 CSS

**不进白名单（已核实）**：`src/types/electronBridge.ts` 是 `import type { Novel } from './novel'`（:2），不重定义 Novel，加字段自动继承，无需改动。故真正需要手动对齐的 schema 重定义只有 3 处：`src/types/novel.ts`、`electron/main/index.ts`（内嵌类型 :96-111）、`electron/preload/bridgeTypes.ts`。

（`ForeshadowingPanel` 仅在 novel-creation 内部引用，不 export 到模块外；ChapterWorkbench.tsx 涉及编辑必 grep/awk，见 [[read-tool-corrupts-chapterworkbench]]）

## 9. 后置（5d.2 及以后）

- **5d.2 AI 伏笔助手**：AI 读正文/大纲/蓝图/未回收列表 → 输出「新埋候选 / 回收候选」候选卡片 → 用户点「加入记录」/「标记回收」才调用本刀 CRUD 写入路径 → JSON 解析失败显示原始文本不写库。
- 伏笔回收提醒的主动化（章节生成时提示）、关系图、资产库联动、时间线——各自独立，均不在伏笔两刀内。

相关 [[novel-module-roadmap]]、[[feedback_mvp_scoping]]、[[novel-useaicheck-refactor-status]]、[[novel-5c-export-status]]、[[read-tool-corrupts-chapterworkbench]]。
