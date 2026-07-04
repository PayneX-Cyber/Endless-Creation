# 小说创作 5b：创作概览统计（NovelStats）切片规格

日期：2026-07-05
上位文档：`docs/plans/2026-06-30-novel-creation-migration-plan.md`（第五阶段「创作管理增强」）、`docs/plans/2026-07-04-novel-selection-optimize-4b-spec.md`（切片风格参考）

## 总体结论

5b 是阶段五第二刀，从「导出」（5a 复制全书 Markdown）转向「洞察」。它只做一件事：**在项目详情页 overview 加一个只读「创作概览」统计区块**。

一句话目标：

```text
打开项目详情 overview → 顶部看到「创作概览」→ 总字数/章节进度/完成度常显，平均/最长/最短已完成章节在写完首章后显示
```

5a 证明了「导出族」最小闭环；5b 用同样克制的方式证明「洞察族」——**纯派生、零 schema、零落库、零 IPC**。伏笔记录、角色关系图、资产库联动（需 schema + CRUD）与导出文件（需文件 IPC）全部后置为独立切片。

范围锁定为：**一个只读派生统计组件 + 项目详情 overview 内一处插入**。其它都不碰。

## 一、数据口径

**零 schema 新增，零落库，零 IPC。**

- 统计全部从 `novel.chapters` 实时派生，不写 `novel.json` 任何字段，不进 localStorage。
- 不新增：统计快照、历史趋势、可配置指标、图表数据结构。
- 组件为纯函数、无状态：不引 `useState`/`useEffect`，可有局部 helper。

## 二、组件接口

新增文件：`src/features/novel-creation/NovelStats.tsx`

```ts
import type { Novel } from '../../types/novel';
import { countWords } from './novelShared';

export function NovelStats({ novel }: { novel: Novel }) { ... }
```

- 输入：`novel: Novel`；输出：统计区块 JSX。
- 无副作用、无状态、无回调 prop。
- 复用 `countWords`（`novelShared.ts` 已有）。
- `brief()` 目前是 `ChapterWorkbench.tsx` 内部非导出函数，NovelStats 用不了；实现时在 NovelStats 内放一个局部同款截断 helper（不强行提取到 novelShared，避免牵动其它文件）。

## 三、派生口径

```ts
// 全书显示顺序：与 NovelCreation.tsx 中 chapters useMemo 同款排序（按 order 升序），
// 显示序号 = 该章在这个排序后数组里的 index + 1（不用 chapter.order + 1）
const ordered = [...novel.chapters].sort((a, b) => a.order - b.order);
const totalChapters = ordered.length;

// 派生时保留全书 displayIndex，供最长/最短显示序号用（不能用 doneChapters 子集下标）
const doneChapters = ordered
  .map((chapter, displayIndex) => ({ chapter, displayIndex, words: countWords(chapter.content) }))
  .filter((entry) => entry.chapter.content.trim() !== '');
const doneCount = doneChapters.length;

// 总字数：所有章节含残稿之和（全书累计产出）
const totalWords = ordered.reduce((sum, c) => sum + countWords(c.content), 0);

// 完成度：0 章时为 0，避免 NaN
const progress = totalChapters ? Math.round((doneCount / totalChapters) * 100) : 0;

// 质量分布组：仅已完成章节参与，doneCount === 0 时全部为 null
const avgDoneWords = doneCount
  ? Math.round(doneChapters.reduce((sum, d) => sum + d.words, 0) / doneCount)
  : null;
// longest / shortest：从 doneChapters 一次 reduce 求，保留 { chapter, displayIndex, words }，
// 渲染用 displayIndex + 1；可读优先，不抽通用统计工具
```

口径钉死：

- **总字数** = 所有章节 `content` 字数之和，含残稿。代表「全书累计产出」。
- **章节进度** = `doneCount / totalChapters`（`content.trim()` 非空算已完成）。
- **完成度** = `Math.round(doneCount / totalChapters * 100)`；`totalChapters === 0` 时为 0。
- **平均章节字数** = 已完成章节字数之和 / `doneCount`（分子是**已完成之和**，不是 `totalWords`）。
- **最长 / 最短章节** = 仅从 `doneChapters` 里找；只有 1 个已完成章节时两者同章，不特判。
- **章节序号（关键）** = 该章在**全书排序后数组**（`sort((a,b)=>a.order-b.order)`）里的 `index + 1`，与项目详情/工作台现有章节列表显示一致。**不用 `chapter.order + 1`，也不用已完成子集下标**——避免删章/乱序后序号与其它页面不一致。

## 四、渲染结构与空态

插入位置：项目详情 overview 分支（`NovelCreation.tsx`），位于「项目概览标题」下方、核心摘要/简介/创意源三个 textarea 上方。先给全局状态，再编辑文本字段。

```text
创作概览
[ 基础指标组 — 始终显示 ]
  总字数        章节进度        完成度
  {totalWords}  {doneCount}/{totalChapters}  {progress}%

[ 质量分布组 — 仅 doneCount > 0 ]
  平均章节字数   最长章节                      最短章节
  {avgDoneWords} 第 N 章 · {title} · X 字      第 N 章 · {title} · X 字

[ doneCount === 0 时，质量组替换为引导语 ]
  完成首章后展示平均字数、最长章节和最短章节。
```

细节：

- **最长/最短格式**：`第 {displayIndex + 1} 章 · {brief(title, 12)} · {formatNumber(words)} 字`；`displayIndex` 为该章在全书排序后数组里的下标（见三节，非 `chapter.order`）；标题为空显示「未命名章节」。标题截断防撑破网格。
- **数字格式化**：总字数、平均字数、最长/最短字数均用 `formatNumber`。

  ```ts
  function formatNumber(value: number): string { return value.toLocaleString('zh-CN'); }
  ```

- **空态**：`doneCount === 0`（含 `totalChapters === 0` 必然满足）走引导语分支。基础指标此时显示 `0` 字、`0 / 0` 或 `0 / N`、`0%`，可接受。一个三元 `doneCount > 0 ? 质量组 : 引导语` 覆盖两档，无 NaN，不单独写复杂空态。

## 五、视觉要求

- 复用现有 `.novel-project-panel` 视觉语言，不引入新体系、不引图表库。
- 统计以简单指标网格呈现（`strong` 数值 + `span` 标签），与工作台侧栏现有 3 格 stats 风格一致。
- 少量 CSS 放现有 `src/features/novel-creation/NovelCreation.css`（如 `.novel-stats` / `.novel-stats__grid` / `.novel-stats__hint`），不新建 CSS 文件。

## 六、后置清单（不进 5b）

- 图表（折线/柱状/分布图）、图表库依赖
- 章节长度分布可视化
- 统计快照 / 历史趋势 / 完成度曲线
- 伏笔记录、伏笔回收提醒（需 schema + 落库，独立立项）
- 角色关系图、资产库联动（需 schema + 跨模块，独立立项）
- 导出文件（.md/.txt/.docx，需文件保存 IPC，独立切片）
- 可配置统计项

**不做假入口：以上一律不展示，不置灰占位。**

## 七、改动文件（预计 3 个）

1. **NovelStats.tsx**（新增）— 纯只读统计组件，派生逻辑 + 局部 helper（brief 截断、formatNumber）+ 渲染。
2. **NovelCreation.tsx** — import NovelStats；overview 分支插入 `<NovelStats novel={currentNovel} />`。
3. **NovelCreation.css** — 少量 `.novel-stats*` 样式。

## 八、验收标准

1. 项目详情 overview 顶部显示「创作概览」区块，位于项目概览标题下、三个 textarea 上。
2. 基础指标始终显示：总字数（含残稿、千分位）、章节进度 `已完成/总`、完成度 `%`。
3. `doneCount > 0` 时显示质量分布组：平均章节字数、最长章节、最短章节，均按「第 N 章 · 标题截断 · 字数千分位」格式，字数用 `formatNumber`。
4. `doneCount === 0`（含 `totalChapters === 0`）时质量组替换为引导语「完成首章后展示平均字数、最长章节和最短章节。」，基础指标显示 0 值，无 `NaN`。
5. 平均字数分子为已完成章节字数之和（非 totalWords）；最长/最短仅从已完成章节取；只有 1 个已完成章节时最长最短同章。
6. **零落库**：打开/查看创作概览前后 `novel.json` 内容/hash 完全一致（不新增字段、不触发保存）。
7. 不破坏 3a/3b/4a-4e/5a 全链路（顺序生成、多版本、大纲补齐、灵感模式、评审/一致性/节奏/选区优化、复制全书 Markdown）、小说 CRUD、生图与资产模块。
8. 零新增 IPC / Provider / schema / 依赖；仅新增一个纯组件 + 一处插入 + 少量 CSS。
9. NovelStats 为纯函数组件，不含 `useState`/`useEffect`。

## 建议实施顺序

1. 前端：NovelStats.tsx（派生 + helper + 渲染）→ NovelCreation.tsx 插入 → NovelCreation.css 补样式。
2. QA：验收 8 条 + 零落库 hash 校验 + 回归项目详情三 tab（overview/outline/chapters）与工作台关键路径。
