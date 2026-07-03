# 小说创作 4b：选区级针对性优化改写 实施计划

> **For agentic workers:** 本项目**没有测试框架**（package.json 仅有 build，无 vitest/jest）。验证沿用 4a/3b 既有模式：`npm.cmd run build` + 双目录文本扫描 + 坏文案 grep + 验收点代码自查 + 人工 E2E。**不要引入任何测试框架**。步骤用 checkbox（`- [ ]`）语法跟踪。

**Goal:** 给已完成章节加一个「优化选区」闭环——选中正文 → 选优化类型 → AI 改写 → 原文/改写稿对照 → 确认后替换选区。

**Architecture:** 纯前端切片，零落库、零 schema、零新增 IPC。复用现有 `rendererBridge.generateText` + `requestIdRef`/`runRef` 取消机制 + `ensureTextModel` 模型检查 + 现有 `.novel-modal` 骨架。唯一全新的技术点是 textarea 选区读写（`onSelect` 记录 + `setSelectionRange` 回选）。改写稿在确认替换前是纯会话态；确认后走现有 `onUpdateChapter` 保存链路，不产生 version、不碰 `selectedVersionId`、不做磁盘级防覆盖。

**Tech Stack:** React 19 + TypeScript + Electron（renderer 侧），Vite 构建。

## Global Constraints

- **零 schema 新增、零落库**：优化过程无新字段、不写 localStorage；改写稿确认前纯会话态。
- **不产生 version，不碰 `selectedVersionId`**：4b 是局部替换，不是版本化写回。
- **不做磁盘级防覆盖**：不 `loadNovel`、不弹整章覆盖确认。前提是生成期间 textarea `readOnly` + 全局互斥 + 写回前三重内存校验。
- **零新增 IPC / Provider / schema**：仅新增一个 prompt 函数 + 工作台内 UI。
- **只改 3 个文件**：`novelPrompts.ts`、`ChapterWorkbench.tsx`、`ChapterWorkbench.css`（CSS 仅在必须时少量补，不引入新视觉体系）。
- **不复用死代码** `buildPolishChapterPrompt` / `buildRewriteChapterPrompt`。
- **不做**：整章优化、diff 高亮、多候选、版本化、历史记录、评分、一致性/RAG/Bible、类型快捷按钮拆分、节奏检查。
- **不做假入口**：后置项一律不展示、不置灰占位。
- **验证机制**：每个 task 末尾跑 `npm.cmd run build`（含 tsc 类型检查）；全部完成后跑双目录文本扫描 + 坏文案 grep + 12 条验收自查。**不引入测试框架**。
- **上位规格**：`docs/plans/2026-07-04-novel-selection-optimize-4b-spec.md`（提交 `2974aff` + `3ed9475`）。

---

## File Structure

- **`src/features/novel-creation/novelPrompts.ts`**（Modify）—— 新增 `OptimizeType` 类型 + `buildOptimizeSelectionPrompt()` 函数。纯函数，无副作用，独立可读。
- **`src/features/novel-creation/ChapterWorkbench.tsx`**（Modify）—— 新增选区记录、`optimizeJob`/`optimizeError`/`optimizeTypeOpen` state、`textareaRef`、`busy` 扩展、生成/取消/写回逻辑、类型选择 modal、对照 modal、「优化选区」入口按钮、textarea `readOnly` + `onSelect`。
- **`src/features/novel-creation/ChapterWorkbench.css`**（Modify，按需）—— 如现有 `.novel-modal` / `.novel-workbench__preview` 骨架不足以覆盖类型 modal / 对照 modal，少量补样式。

任务顺序遵循数据流：先 prompt（无依赖）→ 再 state 与选区记录（UI 基础）→ 再生成逻辑 → 再两个 modal → 最后写回校验与替换。每个 task 结束时 build 通过、可独立 review。

---

## Task 1: 新增优化 prompt 函数

**Files:**
- Modify: `src/features/novel-creation/novelPrompts.ts`

**Interfaces:**
- Consumes: 现有 `TextMessage` 类型（`novelPrompts.ts:3`）、`Novel`/`Chapter` 类型。
- Produces:
  - `export type OptimizeType = 'dialogue' | 'environment' | 'psychology';`
  - `export function buildOptimizeSelectionPrompt(novel: Novel, chapter: Chapter, selectedText: string, type: OptimizeType): TextMessage[]`
  - 后续 Task 3 会 import 这两个。

- [ ] **Step 1: 在 `novelPrompts.ts` 末尾新增类型与函数**

在文件末尾（`cleanOutlineTitle` 函数之后）追加：

```ts
export type OptimizeType = 'dialogue' | 'environment' | 'psychology';

const OPTIMIZE_INSTRUCTIONS: Record<OptimizeType, string> = {
  dialogue: [
    '优化下面这段的对话：',
    '让人物语言更自然、更有个性、更符合身份与当前情绪，',
    '保留原有对话意图和信息，不新增剧情，不添加原文没有的台词。',
  ].join('\n'),
  environment: [
    '优化下面这段的环境描写：',
    '增强画面感、氛围与感官细节，',
    '但不喧宾夺主、不拖慢节奏，保留原有情节推进。',
  ].join('\n'),
  psychology: [
    '优化下面这段的心理描写：',
    '让人物内心活动更细腻、可信、贴合当前处境，',
    '不改变人物已有决定和剧情走向。',
  ].join('\n'),
};

export function buildOptimizeSelectionPrompt(novel: Novel, chapter: Chapter, selectedText: string, type: OptimizeType): TextMessage[] {
  return [
    {
      role: 'system',
      content: [
        '你是小说文本优化助手。',
        '只优化用户选中的片段，直接输出优化后的正文。',
        '不要解释，不要加标题，不要加引号，不要输出选中片段以外的内容。',
        '不改变剧情走向、人物关系和关键信息。',
        '输出长度应与原片段接近，不得大幅扩写或缩写。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `小说标题：${novel.title}`,
        novel.summary ? `小说简介：${novel.summary}` : '',
        `当前章节：${chapter.title || '未命名章节'}`,
        OPTIMIZE_INSTRUCTIONS[type],
        '选中片段：',
        selectedText,
      ].filter(Boolean).join('\n'),
    },
  ];
}
```

- [ ] **Step 2: build 验证类型正确**

Run: `npm.cmd run build`
Expected: PASS（tsc 无类型错误，vite 构建成功）

- [ ] **Step 3: 提交**

```bash
git add src/features/novel-creation/novelPrompts.ts
git commit -m "feat: add selection optimize prompt for 4b"
```

---

## Task 2: 选区记录 state + textareaRef + busy 扩展

**Files:**
- Modify: `src/features/novel-creation/ChapterWorkbench.tsx`

**Interfaces:**
- Consumes: Task 1 的 `OptimizeType`；现有 `busy`（`ChapterWorkbench.tsx:57`）、现有 textarea（`ChapterWorkbench.tsx:306`）。
- Produces:
  - state：`selection`、`optimizeJob`、`optimizeError`、`optimizeTypeOpen`
  - `textareaRef`
  - 扩展后的 `busy`
  - `recordSelection()` 函数
  - Task 3/4/5 依赖这些。

- [ ] **Step 1: import OptimizeType 与 buildOptimizeSelectionPrompt**

修改 `ChapterWorkbench.tsx:5` 的 import：

```ts
import { buildChapterFromOutlinePrompt, buildMissingOutlinePrompt, buildOptimizeSelectionPrompt, parseOutlineText, type OptimizeType } from './novelPrompts';
```

- [ ] **Step 2: 新增类型别名（放文件顶部 type 区，`ChapterWorkbench.tsx:12` 附近）**

在 `type OutlinePreviewEntry = ...` 之后追加：

```ts
type SelectionState = { start: number; end: number; text: string };
type OptimizeJob = {
  status: 'loading' | 'success';
  chapterId: string;
  contentSnapshot: string;
  selectionStart: number;
  selectionEnd: number;
  selectedText: string;
  type: OptimizeType;
  optimizedText?: string;
};
```

- [ ] **Step 3: 新增 state 与 ref（在现有 useState 区，`ChapterWorkbench.tsx:32-41` 附近）**

在 `const confirmBusyRef = useRef(false);` 之后追加：

```ts
const [selection, setSelection] = useState<SelectionState | null>(null);
const [optimizeJob, setOptimizeJob] = useState<OptimizeJob | null>(null);
const [optimizeError, setOptimizeError] = useState('');
const [optimizeTypeOpen, setOptimizeTypeOpen] = useState(false);
const textareaRef = useRef<HTMLTextAreaElement | null>(null);
```

- [ ] **Step 4: 扩展 busy（修改 `ChapterWorkbench.tsx:57`）**

原：

```ts
const busy = generatingChapterId !== null || outlineBusy;
```

改为：

```ts
const busy = generatingChapterId !== null || outlineBusy || optimizeTypeOpen || optimizeJob !== null;
```

- [ ] **Step 5: 新增 recordSelection 函数（在 renderMain 之前，与其它函数同级）**

```ts
function recordSelection(target: HTMLTextAreaElement) {
  const start = target.selectionStart;
  const end = target.selectionEnd;
  setSelection({ start, end, text: target.value.slice(start, end) });
}
```

- [ ] **Step 6: 给 textarea 绑定 ref、onSelect、readOnly（修改 `ChapterWorkbench.tsx:306`）**

原：

```tsx
<textarea value={activeChapter.content} onChange={(event) => onUpdateChapter(activeChapter.id, { content: event.target.value })} placeholder="继续打磨本章正文…" />
```

改为：

```tsx
<textarea
  ref={textareaRef}
  value={activeChapter.content}
  onChange={(event) => onUpdateChapter(activeChapter.id, { content: event.target.value })}
  onSelect={(event) => recordSelection(event.currentTarget)}
  readOnly={busy}
  placeholder="继续打磨本章正文…"
/>
```

- [ ] **Step 7: build 验证**

Run: `npm.cmd run build`
Expected: PASS。本项目 tsconfig **未开启** `noUnusedLocals` / `noUnusedParameters`（只有 `strict: true`），因此 `setOptimizeJob`/`setOptimizeError` 等尚未调用的 setter **不会**导致 build 失败。Task 2 可独立 build 通过并单独提交，无需与 Task 3 合并。

- [ ] **Step 8: 提交**

```bash
git add src/features/novel-creation/ChapterWorkbench.tsx
git commit -m "feat: add selection tracking state and textarea binding for 4b"
```

---

## Task 3: 优化生成逻辑 + 类型选择触发

**Files:**
- Modify: `src/features/novel-creation/ChapterWorkbench.tsx`

**Interfaces:**
- Consumes: Task 1 `buildOptimizeSelectionPrompt`；Task 2 的 state/setter/ref/`recordSelection`；现有 `ensureTextModel`（`:79`）、`rendererBridge.generateText`（`:88`）、`requestIdRef`/`runRef`（`:39-40`）、`createId`。
- Produces:
  - `openOptimizeType()` —— 校验选区后开类型 modal
  - `startOptimize(type: OptimizeType)` —— 记录 job + 调 generateText
  - `cancelOptimize()` —— 取消生成，清 job
  - Task 4/5 的 modal 依赖这些。

- [ ] **Step 1: 新增 openOptimizeType（校验选区，开类型 modal）**

在 recordSelection 之后追加：

```ts
function openOptimizeType() {
  if (busy) return;
  if (!selection || selection.text.trim() === '') {
    window.alert('请先选择要优化的正文');
    return;
  }
  setOptimizeError('');
  setOptimizeTypeOpen(true);
}
```

- [ ] **Step 2: 新增 startOptimize（记录 job 快照 + 调 generateText）**

```ts
async function startOptimize(type: OptimizeType) {
  if (!activeChapter || !selection || selection.text.trim() === '') return;
  const ready = ensureTextModel(setOptimizeError);
  if (!ready) return;
  const snapshot: OptimizeJob = {
    status: 'loading',
    chapterId: activeChapter.id,
    contentSnapshot: activeChapter.content,
    selectionStart: selection.start,
    selectionEnd: selection.end,
    selectedText: selection.text,
    type,
  };
  const requestId = createId('text-request');
  const runId = runRef.current + 1;
  runRef.current = runId;
  requestIdRef.current = requestId;
  setOptimizeTypeOpen(false);
  setOptimizeJob(snapshot);
  setOptimizeError('');
  const result = await rendererBridge.generateText({
    requestId,
    channelId: ready.channelId,
    channelLabel: ready.channelLabel,
    baseUrl: ready.baseUrl,
    apiKey: ready.apiKey,
    model: ready.model,
    messages: buildOptimizeSelectionPrompt(novel, activeChapter, snapshot.selectedText, type),
    temperature: 0.7,
    maxTokens: 1000,
  });
  if (runRef.current !== runId) return;
  requestIdRef.current = null;
  if (!result.ok || !result.text) {
    setOptimizeJob(null);
    setOptimizeError(result.message || '优化选区失败，请稍后重试。');
    return;
  }
  setOptimizeJob({ ...snapshot, status: 'success', optimizedText: result.text });
}
```

- [ ] **Step 3: 新增 cancelOptimize**

```ts
function cancelOptimize() {
  const requestId = requestIdRef.current;
  runRef.current += 1;
  requestIdRef.current = null;
  setOptimizeJob(null);
  if (requestId) void rendererBridge.cancelTextGeneration(requestId);
}
```

- [ ] **Step 4: build 验证**

Run: `npm.cmd run build`
Expected: PASS。此时所有 Task 2/3 的 state 和 setter 都被使用（`setOptimizeJob`/`setOptimizeError`/`setOptimizeTypeOpen` 均已调用）。

- [ ] **Step 5: 提交**

```bash
git add src/features/novel-creation/ChapterWorkbench.tsx
git commit -m "feat: add selection optimize generation logic for 4b"
```

---

## Task 4: 「优化选区」入口按钮 + 类型选择 modal

**Files:**
- Modify: `src/features/novel-creation/ChapterWorkbench.tsx`
- Modify（按需）: `src/features/novel-creation/ChapterWorkbench.css`

**Interfaces:**
- Consumes: Task 3 `openOptimizeType`/`startOptimize`；Task 2 `selection`/`optimizeTypeOpen`；现有 `brief()`（`:444`）、现有 `.novel-modal`/`.novel-workbench__preview` 骨架、现有 `optimizeError`。
- Produces: meta 行入口按钮 + 类型选择 modal + 优化错误提示。Task 5 追加对照 modal。

- [ ] **Step 1: 在已完成章节 meta 行加「优化选区」按钮**

修改 `ChapterWorkbench.tsx:298-305`（`status === 'done'` 分支的 editor-meta 区）。原：

```tsx
<div className="novel-workbench__editor-meta">
  <span>{saveStatusLabel(saveStatus)}</span>
  <span>{countWords(activeChapter.content)} 字</span>
  {saveStatus === 'failed' && <button className="novel-flow__ghost" onClick={onRetrySave} type="button">重试保存</button>}
  {versions.length > 0 && <button className="novel-flow__ghost" onClick={() => setHistoryOpen(true)} type="button">历史版本</button>}
</div>
```

在 `历史版本` 按钮之后、`</div>` 之前追加「优化选区」按钮：

```tsx
  {versions.length > 0 && <button className="novel-flow__ghost" onClick={() => setHistoryOpen(true)} type="button">历史版本</button>}
  <button className="novel-flow__ghost" disabled={busy} onClick={openOptimizeType} type="button">优化选区</button>
</div>
```

- [ ] **Step 2: 在 editor 分支的 textarea 下方加优化错误提示**

修改 `status === 'done'` 分支，在 textarea 之后追加错误行（`ChapterWorkbench.tsx:306` 的 textarea 之后）：

```tsx
<textarea
  ref={textareaRef}
  value={activeChapter.content}
  onChange={(event) => onUpdateChapter(activeChapter.id, { content: event.target.value })}
  onSelect={(event) => recordSelection(event.currentTarget)}
  readOnly={busy}
  placeholder="继续打磨本章正文…"
/>
{optimizeError && <p className="novel-flow__error">{optimizeError}</p>}
```

- [ ] **Step 3: 在组件 return 的 modal 区加类型选择 modal**

在 `historyOpen` modal 之后（`ChapterWorkbench.tsx:433` 的 `</section>` 之前）追加：

```tsx
{optimizeTypeOpen && selection && (
  <div className="novel-modal" role="dialog" aria-modal="true" aria-label="选择优化类型" onClick={() => setOptimizeTypeOpen(false)}>
    <div className="novel-workbench__preview" onClick={(event) => event.stopPropagation()}>
      <h2>优化选区</h2>
      <p className="novel-workbench__preview-sub">将对下面选中的片段做针对性优化，确认后可替换原文。</p>
      <p className="novel-workbench__optimize-selected">{brief(selection.text, 80)}</p>
      <footer>
        <button className="novel-flow__ghost" onClick={() => setOptimizeTypeOpen(false)} type="button">取消</button>
        <button className="novel-flow__primary novel-flow__primary--compact" onClick={() => void startOptimize('dialogue')} type="button">对话优化</button>
        <button className="novel-flow__primary novel-flow__primary--compact" onClick={() => void startOptimize('environment')} type="button">环境描写优化</button>
        <button className="novel-flow__primary novel-flow__primary--compact" onClick={() => void startOptimize('psychology')} type="button">心理描写优化</button>
      </footer>
    </div>
  </div>
)}
```

- [ ] **Step 4: 按需补 CSS（仅当选中文本预览样式缺失）**

若 `.novel-workbench__optimize-selected` 无样式导致预览过长撑破 modal，在 `ChapterWorkbench.css` 末尾追加：

```css
.novel-workbench__optimize-selected {
  max-height: 120px;
  overflow-y: auto;
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.04);
  border-radius: 8px;
  font-size: 14px;
  line-height: 1.6;
  white-space: pre-wrap;
}
```

- [ ] **Step 5: build 验证**

Run: `npm.cmd run build`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add src/features/novel-creation/ChapterWorkbench.tsx src/features/novel-creation/ChapterWorkbench.css
git commit -m "feat: add optimize entry button and type-select modal for 4b"
```

---

## Task 5: 生成中状态 + 对照 modal + 写回校验替换

**Files:**
- Modify: `src/features/novel-creation/ChapterWorkbench.tsx`
- Modify（按需）: `src/features/novel-creation/ChapterWorkbench.css`

**Interfaces:**
- Consumes: Task 2 `optimizeJob`/`textareaRef`；Task 3 `cancelOptimize`；现有 `onUpdateChapter`、`countWords`。
- Produces: `confirmOptimizeWrite()` + 生成中 UI + 对照 modal。这是终点，闭合整个 4b 闭环。

- [ ] **Step 1: 新增 confirmOptimizeWrite（三重校验 + 三段拼接 + rAF 回选）**

在 cancelOptimize 之后追加：

```ts
function confirmOptimizeWrite() {
  if (!optimizeJob || optimizeJob.status !== 'success' || optimizeJob.optimizedText === undefined) return;
  if (!activeChapter) return;
  const { chapterId, contentSnapshot, selectionStart, selectionEnd, selectedText, optimizedText } = optimizeJob;
  const contentValid =
    activeChapter.id === chapterId &&
    activeChapter.content === contentSnapshot &&
    activeChapter.content.slice(selectionStart, selectionEnd) === selectedText;
  if (!contentValid) {
    window.alert('原文范围已变化，请重新选择后生成。');
    setOptimizeJob(null);
    return;
  }
  const nextStart = selectionStart;
  const nextEnd = selectionStart + optimizedText.length;
  const nextContent =
    activeChapter.content.slice(0, selectionStart) + optimizedText + activeChapter.content.slice(selectionEnd);
  onUpdateChapter(chapterId, { content: nextContent });
  setOptimizeJob(null);
  requestAnimationFrame(() => {
    textareaRef.current?.focus();
    textareaRef.current?.setSelectionRange(nextStart, nextEnd);
  });
}
```

- [ ] **Step 2: 在 renderMain 的 editor 分支加生成中覆盖态**

在 `status === 'done'` 分支最前面判断优化生成中。修改该分支为（在 editor div 内、meta 之前插入生成中提示，或用独立分支）。最小改法：在 `status === 'done'` 分支的 editor div 内 textarea 上方插入：

```tsx
{optimizeJob?.status === 'loading' && optimizeJob.chapterId === activeChapter.id && (
  <div className="novel-workbench__optimize-loading">
    <span className="novel-workbench__spinner" aria-hidden="true" />
    <strong>正在优化选区…</strong>
    <button className="novel-flow__ghost" onClick={cancelOptimize} type="button">取消优化</button>
  </div>
)}
```

- [ ] **Step 3: 在 modal 区加对照 modal**

在 Task 4 的类型选择 modal 之后追加：

```tsx
{optimizeJob?.status === 'success' && optimizeJob.optimizedText !== undefined && (
  <div className="novel-modal" role="dialog" aria-modal="true" aria-label="优化对照" onClick={() => setOptimizeJob(null)}>
    <div className="novel-workbench__preview" onClick={(event) => event.stopPropagation()}>
      <h2>优化对照</h2>
      <p className="novel-workbench__preview-sub">确认后将用改写稿替换选中的原文片段；取消则丢弃，不影响正文。</p>
      <div className="novel-workbench__optimize-compare">
        <article>
          <strong>原文（{countWords(optimizeJob.selectedText)} 字）</strong>
          <p>{optimizeJob.selectedText}</p>
        </article>
        <article>
          <strong>改写稿（{countWords(optimizeJob.optimizedText)} 字）</strong>
          <p>{optimizeJob.optimizedText}</p>
        </article>
      </div>
      <footer>
        <button className="novel-flow__ghost" onClick={() => setOptimizeJob(null)} type="button">取消</button>
        <button className="novel-flow__primary novel-flow__primary--compact" onClick={confirmOptimizeWrite} type="button">确认替换</button>
      </footer>
    </div>
  </div>
)}
```

- [ ] **Step 4: 按需补 CSS（对照两栏 + 生成中卡片）**

若对照两块无布局样式，在 `ChapterWorkbench.css` 末尾追加：

```css
.novel-workbench__optimize-compare {
  display: grid;
  gap: 12px;
  max-height: 50vh;
  overflow-y: auto;
}
.novel-workbench__optimize-compare article {
  padding: 12px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.04);
}
.novel-workbench__optimize-compare article p {
  margin: 6px 0 0;
  white-space: pre-wrap;
  line-height: 1.7;
}
.novel-workbench__optimize-loading {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  margin-bottom: 12px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.04);
}
```

- [ ] **Step 5: build 验证**

Run: `npm.cmd run build`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add src/features/novel-creation/ChapterWorkbench.tsx src/features/novel-creation/ChapterWorkbench.css
git commit -m "feat: add optimize loading, compare modal and write-back for 4b"
```

---

## Task 6: 卸载清理 + 全链路验证

**Files:**
- Modify: `src/features/novel-creation/ChapterWorkbench.tsx`（若需补卸载清理）

**Interfaces:**
- Consumes: 现有卸载 cleanup useEffect（`ChapterWorkbench.tsx:43-48`）。

- [ ] **Step 1: 确认卸载 cleanup 已覆盖优化请求**

阅读 `ChapterWorkbench.tsx:43-48` 的 useEffect cleanup。现有逻辑取消 `requestIdRef.current` 指向的请求——优化请求也走同一个 `requestIdRef`，所以卸载时自动取消。**无需新增代码**。确认这一点即可，若发现优化请求用了独立 ref（不应该），改回共用 `requestIdRef`。

- [ ] **Step 2: 全量 build**

Run: `npm.cmd run build`
Expected: PASS

- [ ] **Step 3: 双目录文本扫描**

Run（使用 Codex skills 正式脚本）：
```bash
python "C:/Users/x1176/.codex/skills/endless-creation-guardrails/scripts/scan_text_integrity.py" src
python "C:/Users/x1176/.codex/skills/endless-creation-guardrails/scripts/scan_text_integrity.py" electron
```
Expected: 两次均 `TEXT INTEGRITY OK`

- [ ] **Step 4: 坏文案 grep**

Run:
```bash
grep -rnE "(很抱歉|非常抱歉|对不起|十分抱歉)" src electron || echo "no bad copy"
```
Expected: 无命中（或 `no bad copy`）

- [ ] **Step 5: 12 条验收自查（代码审查 + 人工 E2E）**

对照 spec 第八节逐条自查：

1. 已完成章节 meta 行显示「优化选区」；未开始/生成中不显示（入口在 `status==='done'` 分支）。
2. 空选区点入口 → alert「请先选择要优化的正文」，不发起。
3. 有效选区 → textarea 立即 readOnly → 类型 modal（含前 80 字预览）→ 选三类之一 → 进入生成中。
4. 类型 modal 期间及生成中：textarea `readOnly=busy`，全 AI 按钮 disabled，生成中可取消；同一时刻一个 AI 任务。
5. 成功弹对照 modal（原文/改写稿）；确认替换后选区被三段拼接结果替换，新改写段自动选中高亮。
6. 失败显示脱敏错误，需重新点「优化选区」；正文不受影响。
7. 写回前三重校验（chapterId/contentSnapshot/slice===selectedText）任一失败 → alert「原文范围已变化，请重新选择后生成」→ 不写回。
8. 取消类型选择不清 selection；取消生成/取消对照恢复可编辑，均不写回；取消路径不跑三重校验。
9. **零落库校验**：生成并弹对照 modal、随后取消（不确认）前后，`novel.json` hash 完全一致。
10. 确认替换后 content 走现有保存链路落库；不新增 version、不改 selectedVersionId。
11. 不破坏 3a/3b/4a 全链路 + 小说 CRUD + 生图资产。
12. 零新增 IPC/Provider/schema；仅新增一个 prompt 函数 + 工作台内 UI。

- [ ] **Step 6: 人工 E2E 关键场景**

启动 `npm.cmd run dev:electron`，实测：
- 选中一段 → 优化选区 → 对话优化 → 等待 → 对照 modal → 确认替换 → 新段高亮 ✅
- 生成期间尝试改正文（应 readOnly 改不动）✅
- 对照 modal 取消 → 正文不变 ✅
- 零落库：记录 `novel.json` md5 → 优化并取消 → 再记录 md5 → 一致 ✅

- [ ] **Step 7: 无代码改动则不提交**（Task 6 主要是验证；若 Step 1 发现需改，单独提交）

---

## Self-Review（plan 对照 spec）

**Spec 覆盖检查**：
- 第一节 数据口径（零落库/不产 version/不做磁盘防覆盖）→ Global Constraints + Task 5 写回逻辑（`onUpdateChapter` 只传 content）✅
- 第二节 状态设计（optimizeJob/busy 派生）→ Task 2 ✅
- 第三节 快照与写回校验（三重校验 + rAF 回选）→ Task 5 Step 1 ✅
- 第四节 用户流程（readOnly 起点/取消不校验）→ Task 2 Step 6（readOnly=busy）+ Task 3 openOptimizeType + Task 5 confirmOptimizeWrite ✅
- 第五节 AI 行为（prompt/复用通道/取消卸载）→ Task 1 + Task 3 + Task 6 ✅
- 第六节 视觉（复用 modal 骨架）→ Task 4/5 ✅
- 第八节 12 条验收 → Task 6 Step 5 ✅
- 第九节 3 个改动文件 → 全 plan 只碰这 3 个 ✅

**占位符扫描**：无 TBD/TODO；每个 code step 都有完整代码。✅

**类型一致性**：`OptimizeType`（Task 1 定义，Task 2/3 消费）；`OptimizeJob`（Task 2 定义，Task 3/5 消费）；`optimizedText?: string`（Task 3 填入，Task 5 用 `!== undefined` 守卫）；`selection.text` / `selectedText` 命名贯穿一致。✅

**测试机制**：本项目无测试框架（package.json 只有 build 脚本），沿用 4a/3b 模式——每个 Task 以 `npm.cmd run build` + 相关验收点自查收尾，不写单元测试。tsconfig 未开 `noUnusedLocals`，中间态 build 不会因未使用 setter 报错，各 Task 可独立 build 并单独提交。
