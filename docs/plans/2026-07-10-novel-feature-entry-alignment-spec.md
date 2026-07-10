# 小说功能入口恢复与对齐 — 设计规格

**日期**：2026-07-10
**类型**：功能入口对齐 + 导出归位（非新增能力）
**基线**：`8c016cc feat: 完善小说设定系统与蓝图导航`（已推送 origin/main，保留不改写）
**交付**：单个增量 commit，信息 `fix: 补齐小说功能入口与导出归位`

---

## 1. 背景与目标

### 1.1 问题定性

`8c016cc` 完成了「设定与记忆子系统 + 参考图风格项目详情页重构」，但重构只验证了「页面能显示、能滚动」，未做重构前后的**功能等价检查**，导致：

- 形成了「项目详情页（8 tab 蓝图导航）」与「章节工作台（开始创作之后）」**两套入口，却未定义每项功能归谁**。
- 伏笔 AI 被 `showAiSuggestions={false}` 藏进旧工作台入口（`NovelCreation.tsx:952`），对用户等同「功能没了」。
- 情感曲线 tab 是空占位页，占正式导航入口但无任何功能。
- 导出路径分散在工作台，未从项目详情形成清晰入口。
- 项目「编辑信息」弹窗与保存逻辑存在，但无触发按钮（重构前既有的未接通功能）。

**功能未被删除，而是入口未迁移 / 归属未定义。** 本包只做入口恢复与对齐、导出归位、假入口清理，**不新增任何 AI 能力、schema、IPC、prompt**。

### 1.2 最终分工原则（全包遵循）

| 层 | 职责 |
|---|---|
| **项目详情页** | 全书规划、资料管理（设定/角色）、伏笔台账、进度概览、成本统计、项目编辑、**作品导出**、人物关系 AI 推演（项目级） |
| **章节工作台** | 当前章正文生成、多版本、AI 检查（评审/一致性/节奏）、选区优化、**伏笔 AI** |

心智模型：**详情页管整本书，工作台处理当前章。**

### 1.3 交付约束

- **单个增量** commit（不拆碎），信息 `fix: 补齐小说功能入口与导出归位`。
- **spec 文档、代码、路线图改动一起进入这唯一的 commit**——不单独做 `docs:` commit，spec 在实现完成前保持未提交。
- 保留 `8c016cc`，不 reset、不改写历史。
- 不新增 AI 能力、schema、IPC 通道、AI prompt 或 AI 调用。

---

## 2. 伏笔 AI 归位与跳转

### 2.1 归属

伏笔 AI（`ChapterWorkbench` 内的「AI 找伏笔」找新埋线索、「AI 识别回收」找回收）**依赖当前章节正文**，归**章节工作台**。详情页伏笔 tab 保持「台账」定位（统计、列表、手动增删改、状态切换、跨章引用管理），`showAiSuggestions={false}` **不变**。

### 2.2 详情页伏笔 tab 新增「AI 分析章节」入口

- 按钮放在伏笔 tab 头部，与「新增伏笔」并列。
- 点击 → 弹**章节选择器**（不自动跳转：`activeChapterId` 在打开小说时重置到第一章 `NovelCreation.tsx:208`，不可靠代表「上次编辑章」）。
- **全书无正文时按钮禁用**，提示「请先完成章节正文」。

### 2.3 章节选择器口径

- 使用现有 modal 样式 + 原生单选控件。
- 每章展示：序号、标题、字数、状态。
- 无正文的章节**禁用 + 标注「暂无正文」**（伏笔 AI 分析正文，空章无意义且产生真实成本）。
- 默认选中：本会话最近有效章；无记录则选**第一个有正文的章**。
- **确认** → 进入该章工作台并自动打开伏笔 AI 面板（见 2.4）。
- **取消 / 关闭弹窗** → 不跳转、不改变当前 tab、不残留 `initialPanel` 意图。

### 2.4 跳转与状态隔离口径

1. **最近有效章（本会话内存，按 novelId 隔离）**
   - 内存 Map，工作台选中有正文章时按 novelId 更新。
   - **不新增 Novel 字段、不写文件、不写 localStorage**。
   - 重启后无记录 → 退到第一个有正文章。
   - 小说 A 的选择不得影响小说 B。
   - **空章生成出正文后也应成为最近有效章**：不能只在「选择章节瞬间」更新 Map；当工作台内某章从无正文变为有正文（生成/写入正文成功）时，同样按 novelId 更新为最近有效章。

2. **打开意图只消费一次**
   - 从伏笔页进入时传 `initialPanel: 'foreshadowing'`。
   - 工作台挂载后自动打开现有伏笔 modal 一次，随即清除该意图。
   - 普通「开始创作」不带此参数、不继承，避免以后每次进入都弹伏笔面板。
   - 关闭面板、切章节或普通进入工作台时不得再次自动弹出。
   - **打开面板本身不发起 AI 调用、不产生费用**（AI 需用户显式点击）。

3. **返回来源记录**
   - 本次入口把返回 tab 记为 `foreshadowing`；工作台点「项目详情」→ 回伏笔管理 tab。
   - 普通入口仍按原有默认行为返回项目概览。

4. **意图写入的失败路径**
   - **只有 `openNovel` 成功后**才写入 `initialPanel` 和返回 tab。
   - 加载失败（openNovel 未成功）**必须清除意图**，留在伏笔页，不跳转、不进入工作台、不残留 `initialPanel`。

### 2.5 落地要点

- `openProjectWorkbench` 携带跳转意图参数（返回 tab + `initialPanel`），工作台初始化时消费。这是本节唯一跨组件管道改动。
- 章节选择器为新增轻量 UI，复用现有 modal 样式，不引入新依赖。
- **ForeshadowingPanel 头部扩展**：「AI 分析章节」按钮要与面板内部的「新增伏笔」并列（embedded 形态头部，`ForeshadowingPanel.tsx:143` 一带）。最小做法是给面板增加**专用 action props**（如 `onAnalyzeChapter?` + `analyzeDisabled?` + `analyzeDisabledHint?`），由 `NovelCreation` 传入；**不做通用插槽/children**。modal 形态不传这些 props，行为不变。

---

## 3. 导出归位到详情页

### 3.1 归属

导出（复制全书 Markdown / 导出 .md / Word 分镜本 / ZIP 离线包）是全书级操作、不依赖当前章，归**项目详情页**，且为**唯一入口不复制**。

### 3.2 抽独立导出服务模块

新建 `src/features/novel-creation/novelExport.ts`，移动（**只移动、不修改逻辑**）：

- 四个 handler：`copyWholeBookMarkdown` / `exportWholeBookMarkdownFile` / `exportStoryboardDocFile` / `exportOfflinePackage`（现于 `ChapterWorkbench.tsx:752-807`）。
- 纯函数：`buildWholeBookMarkdown`、`buildStoryboardDocHtml`、`buildOfflinePackageFiles`、`docParagraphs`、`escapeDocHtml`（HTML 辅助函数，导出函数的完整依赖闭包）。

**依赖核对结论**：导出构建函数的**依赖闭包包含** `escapeDocHtml`（`ChapterWorkbench.tsx:1277`）与 `docParagraphs`（`1281`，其内部又调 `escapeDocHtml`），二者必须一并迁移，否则导出函数无法独立。`brief`（`1272`）虽被工作台大量使用，但**不在导出依赖闭包内**（其调用点全为工作台 UI 渲染 179/180/1051/1127/1197）——`brief` **保留在工作台，不迁移**，迁走会断工作台引用。

该模块**只由 `NovelCreation` 调用**（工作台按钮删除后不再 import 导出模块），不是双组件共用。

### 3.3 详情页「导出作品」菜单

- 详情页顶部操作区（与「开始创作」「返回列表」并列）加「导出作品」菜单。
- 菜单四项：复制全书 Markdown、导出 .md 文件、导出 Word 分镜本、导出离线包 ZIP。
- 复用抽出的服务逻辑，不重新实现。

### 3.4 移除工作台导出

- 删 `ChapterWorkbench.tsx:1019-1022` 四个导出按钮。
- 同步移除工作台不再使用的 storeZip imports（`assertStoreZipSelfCheck` / `createStoreZip` / `textToBytes` / `StoreZipEntry`，以实际迁移后引用为准）。
- 工作台**完全无导出入口**。

### 3.5 保持现有真实行为（一字不改，仅搬家）

| 导出 | 空正文行为（保持不变） |
|---|---|
| 复制 Markdown | 空：「暂无可复制的正文」；成功：「全书 Markdown 已复制」；失败：「复制失败，请手动复制」（走 `rendererBridge.copyText`） |
| 导出 Markdown | 「暂无可导出的正文」 |
| Word | 「暂无可导出的内容」 |
| ZIP | **无正文也照常生成**带占位内容 + 原始 novel.json 的离线包（本包不新增 ZIP 空内容拦截） |

取消提示「已取消导出」、失败提示「导出失败，请重试」原样保留。导出不依赖当前章、不跳工作台。

### 3.6 迁移基线样本（实施前置硬约束）

**实施第一步**：先从 `8c016cc` 基线（迁移前）用同一本测试小说生成三份样本并保存到**仓库外临时目录**（不进 git，完成对比后清理）：

- Markdown 全书文本
- Word 分镜本 HTML
- ZIP 离线包（原始字节 + 文件清单）

否则迁移完成后无法补做「迁移前」对比。见 §6 验收 B9。

---

## 4. 情感曲线入口移除

### 4.1 移除

情感曲线 tab 是空占位页（无分析/持久化/曲线渲染链），保留会让用户判断功能损坏。彻底移除入口，回到 **7 个真实可用 tab**：项目概览 / 世界设定 / 主要角色 / 人物关系 / 章节大纲 / 章节内容 / 伏笔管理。

### 4.2 同步清理（不留隐藏开关/预留代码）

- `ProjectViewTab` 类型移除 `'emotion'`。
- `PROJECT_VIEW_TABS` 数组删情感曲线导航项。
- 删空页 JSX（`NovelCreation.tsx:942` 一带 `novel-emotion-empty` 块）。
- 删专用 CSS（`NovelCreation.css` 中 `novel-emotion-empty*` 规则）。
- **删除 `ChartIcon`**：`8c016cc` 为该空入口新增，全库移除情感曲线后零引用，非历史共用图标 → 从 `icons.tsx` 删除定义 + 删 `NovelCreation.tsx` import + 两处引用。真正实现情感曲线时按最终界面补回。

### 4.3 路线图前阻断项

在 `docs/plans/2026-07-06-v1-roadmap-adjusted.md` 的 **Phase 4「进入条件」列表**中插入前置阻断项：

```
- [ ] 情感曲线闭环：按章节 AI 分析情绪、按 novelId 持久化、支持重新分析并展示真实曲线；完成前不得进入 Phase 4。
```

即：删 UI 假入口和死代码，但在路线图 Phase 4 进入条件里留明确前阻断项。

---

## 5. 项目编辑入口补齐

### 5.1 问题

项目「编辑信息」弹窗（`NovelCreation.tsx:1091`，`modalMode: 'edit'` 支持标题/简介/备注 + 保存）与 `submitNovelForm` 保存逻辑存在，但全文件无 `setModalMode('edit')` 触发点 → 死弹窗。这是重构前既有的未接通功能，本包顺带接上。

### 5.2 补入口

- 详情页顶部显示「编辑信息」按钮。
- 点击 → 预填当前 novel 的标题/简介/备注到 form → `setModalMode('edit')` 打开弹窗。
- 保存 → 走现有 `submitNovelForm` edit 分支 → 落库。
- 刷新及重启后仍保留（走现有 saveNovel 链，无新增落库逻辑）。

---

## 6. 验收清单（重构前后功能等价检查）

每项须有**功能等价证据**，非「页面能显示」。

### A. 伏笔 AI 归位
1. 详情页伏笔 tab：台账/统计/手动增删改/状态切换显示，`showAiSuggestions=false` 保持。
2. 「AI 分析章节」：全书有正文 → 可点弹选择器；全书无正文 → 禁用 + 「请先完成章节正文」。
3. 选择器：无正文章禁用标注「暂无正文」；默认选最近有效章 / 无记录选第一个有正文章。
4. 确认 → 进入该章工作台 + 自动打开伏笔面板（一次）；「AI 找伏笔」「AI 识别回收」可见可用。
5. 工作台点「项目详情」→ 回伏笔管理 tab；普通「开始创作」→ 不弹伏笔面板、返回回项目概览。
6. **取消路径**：选择器取消/关闭 → 不跳转、不改 tab、不残留 `initialPanel`。
7. **状态隔离**：最近有效章按 novelId 隔离（A 不影响 B）；`initialPanel` 只消费一次（关闭/切章/普通进入不再弹）；打开面板不自动发起 AI 调用、不产生费用。

### B. 导出归位
8. 详情页「导出作品」菜单四项齐全，逐项实测成功：复制全书 MD / 导出 .md / Word / ZIP。
9. **等价证据**（对比迁移前 §3.6 基线样本，基线放仓库外临时目录、完成后清理）：
   - Markdown：迁移前后字符串**完全一致**。
   - Word：生成 HTML 内容**完全一致**。
   - ZIP：**原始字节完全一致**（锁死为逐字节一致；文件名、文件数量、各文件内容一致是字节一致的必然推论）。
10. 现有行为保持：空正文文案（复制/MD/Word）、复制成功「全书 Markdown 已复制」与失败「复制失败，请手动复制」、ZIP 无正文照常出包、取消/失败提示一字不变。
11. 工作台顶部 4 导出按钮已移除，工作台无任何导出入口。

### C. 情感曲线移除
12. 导航剩 7 真实 tab，无情感曲线入口。
13. **全库零引用**：`emotion` 类型/导航项/空页 JSX/`novel-emotion-empty` CSS/`ChartIcon`（含 icons.tsx 定义）全清，`grep` 确认零引用。
14. 路线图追加 Phase 4 前阻断项。

### D. 项目编辑
15. 详情页「编辑信息」按钮可见 → 点击弹窗预填 → 改标题/简介/备注 → 保存 → 刷新及重启后保留。

### E. 无回退验证（全量对账，防「藏功能」）
16. 章节工作台原有能力全部仍在且可用：SSE 流式生成 + 取消 + 草稿确认、多版本 + 历史写回、评审、一致性、节奏、四类选区优化、AI 生成后续大纲、章节状态/字数目标/软提示、设定速查、伏笔记录（工作台内 modal）。
17. **成本统计**（详情页 NovelStats，非工作台）：调用次数、Token、估算成本正常显示，继续按 `novel.id` 隔离。

### F. 技术与交付约束
18. 双端 tsc 全绿（renderer + electron）+ 文本完整性扫描 OK。
19. `git diff --check` 通过（无空白错误 / 冲突标记）。
20. 确认无新增 schema、IPC、AI prompt 或 AI 调用（diff 审计）。
21. 单个增量 commit，信息 `fix: 补齐小说功能入口与导出归位`。

---

## 7. 影响文件（预估）

| 文件 | 改动 |
|---|---|
| `src/features/novel-creation/novelExport.ts` | **新增**：迁移四 handler + 纯函数（`buildWholeBookMarkdown`/`buildStoryboardDocHtml`/`buildOfflinePackageFiles`/`docParagraphs`/`escapeDocHtml`） |
| `src/features/novel-creation/NovelCreation.tsx` | 伏笔「AI 分析章节」入口 + 章节选择器 + 跳转意图（含失败路径）；「导出作品」菜单；「编辑信息」按钮；移除 emotion tab/JSX/ChartIcon import 与引用 |
| `src/features/novel-creation/ChapterWorkbench.tsx` | 消费 `initialPanel` 意图自动开伏笔面板；空章→有正文时上报最近有效章；移除四导出按钮 + 迁出导出函数 + 清理 storeZip imports（`brief` 保留） |
| `src/features/novel-creation/ForeshadowingPanel.tsx` | embedded 头部新增专用 action props（`onAnalyzeChapter?`/`analyzeDisabled?`/`analyzeDisabledHint?`），承载「AI 分析章节」按钮；modal 形态不传、行为不变 |
| `src/features/novel-creation/NovelCreation.css` | 移除 `novel-emotion-empty*`；章节选择器/导出菜单/编辑按钮所需样式（如需） |
| `src/app/icons.tsx` | 删除 `ChartIcon` 定义 |
| `docs/plans/2026-07-06-v1-roadmap-adjusted.md` | Phase 4 进入条件列表追加情感曲线阻断项 |
| `docs/plans/2026-07-10-novel-feature-entry-alignment-spec.md` | **本 spec 自身**（随最终 commit 一起入库） |

**不改**：`src/types/novel.ts`、`electron/preload/bridgeTypes.ts`、`electron/main/index.ts`、`src/services/rendererBridge.ts`（无 schema/IPC 改动）。

---

## 8. 不做（YAGNI / 后置）

- 情感曲线任何实现（分析/持久化/曲线渲染）——留 Phase 4 前阻断项。
- ZIP 空内容拦截——保持现有真实行为。
- 伏笔 AI 逻辑改动——只迁入口可见性，不改算法/prompt。
- 导出逻辑改动——只移动，不修改。
- 设定/角色数据模型改动——沿用 `8c016cc` 的 `SettingEntry`。
