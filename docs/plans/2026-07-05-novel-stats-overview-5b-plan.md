# 创作概览统计（NovelStats）5b 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: 用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐 Task 实施。步骤用 checkbox（`- [ ]`）跟踪。

**Goal:** 在项目详情 overview 顶部加一个只读「创作概览」统计区块，从 `novel.chapters` 纯派生展示总字数、章节进度、完成度、平均/最长/最短已完成章节。

**Architecture:** 新增无状态纯函数组件 `NovelStats.tsx`（输入 `novel`，输出统计 JSX），在 `NovelCreation.tsx` overview 分支插入一处 `<NovelStats novel={currentNovel} />`，样式加进现有 `NovelCreation.css`。零 schema / 零 IPC / 零落库 / 零新依赖。

**Tech Stack:** React 19 + TypeScript，Vite/Electron；复用 `novelShared.ts` 的 `countWords`。

## Global Constraints

- 零新增 schema / IPC / Provider / localStorage / 第三方依赖（含图表库）。
- `NovelStats` 为纯函数组件：不含 `useState` / `useEffect` / 回调 prop；可有局部 helper。
- 统计全部实时派生自 `novel.chapters`，不写 `novel.json`、不触发保存。
- 只改 3 个文件：`NovelStats.tsx`（新增）、`NovelCreation.tsx`（一处 import + 一处插入）、`NovelCreation.css`（少量 `.novel-stats*` 样式）。
- 不碰 ChapterWorkbench、保存链路、versions/selectedVersionId、请求生命周期。
- 章节显示序号 = 该章在全书排序后数组（`sort((a,b)=>a.order-b.order)`，与 NovelCreation.tsx 里 chapters useMemo 同款）里的 `index + 1`；不用 `chapter.order + 1`，不用已完成子集下标。
- 项目无测试框架，验证沿用 4a/3b 模式：`npm.cmd run build` + 双目录文本扫描 + 坏文案 grep + 验收自查；不写单元测试。tsconfig 未开 `noUnusedLocals`，各 Task 可独立 build 并单独提交。
- 文本扫描脚本：`C:\Users\x1176\.codex\skills\endless-creation-guardrails\scripts\scan_text_integrity.py`。

---

## Task 1: NovelStats 组件（派生 + 渲染 + 空态）

**Files:**
- Create: `src/features/novel-creation/NovelStats.tsx`

**Interfaces:**
- Consumes: `Novel` 类型（`../../types/novel`）、`countWords`（`./novelShared`，已导出，签名 `countWords(text: string): number`）。
- Produces: `export function NovelStats({ novel }: { novel: Novel }): JSX.Element` — Task 2 在 overview 分支引用。

- [ ] **Step 1: 创建 NovelStats.tsx（完整内容）**

```tsx
import type { Novel } from '../../types/novel';
import { countWords } from './novelShared';

function briefTitle(title: string, max: number): string {
  const normalized = title.replace(/\s+/g, ' ').trim();
  if (!normalized) return '未命名章节';
  return Array.from(normalized).length > max
    ? `${Array.from(normalized).slice(0, max).join('')}…`
    : normalized;
}

function formatNumber(value: number): string {
  return value.toLocaleString('zh-CN');
}

export function NovelStats({ novel }: { novel: Novel }) {
  // 全书显示顺序：与 NovelCreation.tsx 里 chapters useMemo 同款排序（按 order 升序）
  const ordered = [...novel.chapters].sort((a, b) => a.order - b.order);
  const totalChapters = ordered.length;

  // 派生时先保留全书 displayIndex，再 filter 出已完成章节（displayIndex 不能用子集下标）
  const doneChapters = ordered
    .map((chapter, displayIndex) => ({ chapter, displayIndex, words: countWords(chapter.content) }))
    .filter((entry) => entry.chapter.content.trim() !== '');
  const doneCount = doneChapters.length;

  // 总字数：所有章节含残稿之和（全书累计产出）
  const totalWords = ordered.reduce((sum, chapter) => sum + countWords(chapter.content), 0);

  // 完成度：0 章时为 0，避免 NaN
  const progress = totalChapters ? Math.round((doneCount / totalChapters) * 100) : 0;

  // 质量分布组：仅已完成章节参与，doneCount === 0 时为 null
  const avgDoneWords = doneCount
    ? Math.round(doneChapters.reduce((sum, entry) => sum + entry.words, 0) / doneCount)
    : null;

  let longest = doneCount ? doneChapters[0] : null;
  let shortest = doneCount ? doneChapters[0] : null;
  for (const entry of doneChapters) {
    if (longest && entry.words > longest.words) longest = entry;
    if (shortest && entry.words < shortest.words) shortest = entry;
  }

  return (
    <section className="novel-stats" aria-label="创作概览">
      <h3 className="novel-stats__title">创作概览</h3>
      <div className="novel-stats__grid">
        <div className="novel-stats__cell"><strong>{formatNumber(totalWords)}</strong><span>总字数</span></div>
        <div className="novel-stats__cell"><strong>{doneCount} / {totalChapters}</strong><span>章节进度</span></div>
        <div className="novel-stats__cell"><strong>{progress}%</strong><span>完成度</span></div>
      </div>
      {doneCount > 0 && longest && shortest && avgDoneWords !== null ? (
        <div className="novel-stats__grid">
          <div className="novel-stats__cell"><strong>{formatNumber(avgDoneWords)}</strong><span>平均章节字数</span></div>
          <div className="novel-stats__cell">
            <strong>第 {longest.displayIndex + 1} 章 · {briefTitle(longest.chapter.title, 12)} · {formatNumber(longest.words)} 字</strong>
            <span>最长章节</span>
          </div>
          <div className="novel-stats__cell">
            <strong>第 {shortest.displayIndex + 1} 章 · {briefTitle(shortest.chapter.title, 12)} · {formatNumber(shortest.words)} 字</strong>
            <span>最短章节</span>
          </div>
        </div>
      ) : (
        <p className="novel-stats__hint">完成首章后展示平均字数、最长章节和最短章节。</p>
      )}
    </section>
  );
}
```

- [ ] **Step 2: build 验证**

Run: `npm.cmd run build`
Expected: PASS（tsc + vite）。此时 NovelStats 已定义但尚未被引用——tsconfig 未开 `noUnusedLocals`，未使用的 export 不会导致 build 失败。

- [ ] **Step 3: 提交**

```bash
git add src/features/novel-creation/NovelStats.tsx
git commit -m "feat: 增加小说创作概览统计组件"
```

---

## Task 2: 接入 overview 分支

**Files:**
- Modify: `src/features/novel-creation/NovelCreation.tsx`（import 区 + overview 分支）

**Interfaces:**
- Consumes: Task 1 的 `NovelStats`。
- 插入点上下文（overview 分支，`view === 'projectView' && currentNovel` 守卫内，`currentNovel` 必非空）：
  ```tsx
  {projectViewTab === 'overview' && (
    <>
      <div className="novel-project-panel__head"><h2>项目概览</h2><button ...>开始创作</button></div>
      <label>核心摘要<textarea value={projectSummary(currentNovel)} ... /></label>
  ```

- [ ] **Step 1: 加 import**

在现有 import 区（`import { ChapterWorkbench } from './ChapterWorkbench';` 一行下方）新增：

```tsx
import { NovelStats } from './NovelStats';
```

- [ ] **Step 2: overview 分支插入 NovelStats**

在 overview 分支的 `<div className="novel-project-panel__head">...项目概览...</div>` 这一行之后、`<label>核心摘要...</label>` 之前插入一行：

```tsx
      <NovelStats novel={currentNovel} />
```

插入后结构应为：

```tsx
      {projectViewTab === 'overview' && (
        <>
          <div className="novel-project-panel__head"><h2>项目概览</h2><button className="novel-flow__primary novel-flow__primary--compact" onClick={() => void openProjectWorkbench(currentNovel.id)} type="button">开始创作</button></div>
          <NovelStats novel={currentNovel} />
          <label>核心摘要<textarea value={projectSummary(currentNovel)} onChange={(event) => updateProjectField('blueprint', event.target.value)} placeholder="写下这本小说的核心设定、主线冲突和整体梗概。" /></label>
```

- [ ] **Step 3: build 验证**

Run: `npm.cmd run build`
Expected: PASS。NovelStats 现在被引用。

- [ ] **Step 4: 提交**

```bash
git add src/features/novel-creation/NovelCreation.tsx
git commit -m "feat: 项目概览接入创作概览统计"
```

---

## Task 3: 样式

**Files:**
- Modify: `src/features/novel-creation/NovelCreation.css`（追加 `.novel-stats*`）

**Interfaces:**
- Consumes: Task 1 组件里用到的 class：`.novel-stats`、`.novel-stats__title`、`.novel-stats__grid`、`.novel-stats__cell`、`.novel-stats__hint`。

- [ ] **Step 1: 追加样式（文件末尾）**

```css
.novel-stats {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 20px;
}

.novel-stats__title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: #64748b;
}

.novel-stats__grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.novel-stats__cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 14px;
  border-radius: 16px;
  background: #f8fafc;
}

.novel-stats__cell strong {
  font-size: 16px;
  font-weight: 600;
  color: #1f4fb8;
  line-height: 1.4;
}

.novel-stats__cell span {
  font-size: 12px;
  color: #64748b;
}

.novel-stats__hint {
  margin: 0;
  padding: 12px 14px;
  font-size: 13px;
  color: #64748b;
  border-radius: 16px;
  background: #f8fafc;
}

.app-shell[data-theme='dark'] .novel-stats__cell,
.app-shell[data-theme='dark'] .novel-stats__hint {
  background: #111822;
  color: inherit;
}
```

> **说明**：色值刻意复用现有 `.novel-workbench__stats`（`ChapterWorkbench.css`）同款硬编码值——面板背景 `#f8fafc`、主数值蓝 `#1f4fb8`、标签灰 `#64748b`、圆角 `16px`，dark 主题覆盖 `#111822`。本项目 CSS **不使用 CSS 变量 token**（已用 awk 核实 NovelCreation.css 无 `var(--…)`），不要引入 `var(--token, fallback)` 形式，直接用硬编码值与现有统计网格保持一致。

- [ ] **Step 2: build 验证**

Run: `npm.cmd run build`
Expected: PASS。

- [ ] **Step 3: 提交**

```bash
git add src/features/novel-creation/NovelCreation.css
git commit -m "style: 创作概览统计样式"
```

---

## Task 4: 验证与验收

**Files:** 无（仅验证）

- [ ] **Step 1: build**

Run: `npm.cmd run build`
Expected: PASS（tsc + vite）。

- [ ] **Step 2: 双目录文本扫描**

```bash
python "C:\Users\x1176\.codex\skills\endless-creation-guardrails\scripts\scan_text_integrity.py" src
python "C:\Users\x1176\.codex\skills\endless-creation-guardrails\scripts\scan_text_integrity.py" electron
```
Expected: 两次均 `TEXT INTEGRITY OK`。

- [ ] **Step 3: 坏文案 grep（两组，均无命中）**

```bash
git grep -n "????\|Mock AI\|GPT Image 2\|3 通道" -- src electron ':!package-lock.json'
git grep -n "很抱歉\|非常抱歉\|对不起\|抱歉\|十分抱歉" -- src electron ':!package-lock.json'
```
Expected: src/electron 无命中（docs 命中不计）。

- [ ] **Step 4: 验收自查（对照 spec 第八节 9 条）**

1. overview 顶部显示「创作概览」，在项目概览标题下、三个 textarea 上。
2. 基础指标始终显示：总字数（含残稿、千分位）、章节进度 `已完成/总`、完成度 `%`。
3. `doneCount > 0` 时质量组显示平均/最长/最短，格式「第 N 章 · 标题截断 · 字数千分位」。
4. `doneCount === 0`（含 `totalChapters === 0`）显示引导语，基础指标 0 值，无 `NaN`。
5. 平均字数分子为已完成之和；最长/最短仅从已完成取；单章时两者同章。
6. 零落库：查看前后 `novel.json` hash 一致。
7. 不破坏 3a/3b/4a-4e/5a 全链路、CRUD、生图资产。
8. 零新增 IPC/Provider/schema/依赖。
9. NovelStats 无 `useState`/`useEffect`。

- [ ] **Step 5: 序号一致性专项**

创建一本书 → 建 3 章 → 只写第 2 章正文 → 进 overview：最长/最短应显示「第 2 章」（与 outline/chapters tab 里该章的「第 2 章」一致）。删掉第 1 章后再看：序号仍与列表页一致。

---

## 自审记录（写完对照 spec）

- **Spec 覆盖**：数据口径→Global Constraints + Task 1；组件接口→Task 1；派生口径→Task 1 Step 1（sort→map(displayIndex)→filter 顺序正确）；渲染与空态→Task 1（三元 `doneCount>0 ? 质量组 : 引导语`）；视觉→Task 3；改动文件→Task 1-3；验收→Task 4。无遗漏。
- **占位符扫描**：无 TBD/TODO；所有代码步骤给了完整代码。
- **类型一致性**：`NovelStats({ novel }: { novel: Novel })` 在 Task 1 定义、Task 2 引用一致；class 名 Task 1 用到的与 Task 3 定义的一致（`.novel-stats` / `__title` / `__grid` / `__cell` / `__hint`）。
- **测试机制**：项目无测试框架，各 Task 以 build + 验收自查收尾（非 TDD 写测试），沿用 4a/3b 模式。tsconfig 未开 `noUnusedLocals`，Task 1 组件未被引用时也能独立 build/提交。
