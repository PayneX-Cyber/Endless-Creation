# 小说功能入口恢复与对齐 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `8c016cc` 重构后被藏/错位的功能入口对齐——伏笔 AI 归位工作台并从详情页可达、导出归位详情页唯一入口、移除情感曲线假入口、补齐项目编辑入口——不新增任何 AI 能力。

**Architecture:** 纯前端入口对齐 + 导出逻辑抽独立服务模块。分工定死：项目详情页管全书（规划/资料/伏笔台账/进度/成本/编辑/导出/人物关系 AI），章节工作台管当前章（正文生成/多版本/AI 检查/选区优化/伏笔 AI）。跨组件跳转靠 `openProjectWorkbench` 携带一次性意图参数。

**Tech Stack:** React 19 + TypeScript 6 + Vite 8 + Electron 42。无测试框架——验证靠 `npm run build`（renderer tsc+vite / electron tsc）+ Grep 零引用核对 + git diff 审计 + 导出等价字节对比 + GUI 验收。

## Global Constraints

- **单个增量 commit**：spec 文档 + 代码 + 路线图一起进入唯一的 `fix: 补齐小说功能入口与导出归位`。实现全程**不提交**，最后一个 Task 才 commit。
- 保留 `8c016cc`，不 reset、不改写历史。
- **不新增** schema、IPC 通道、AI prompt、AI 调用。（不改 `src/types/novel.ts`、`electron/preload/bridgeTypes.ts`、`electron/main/index.ts`、`src/services/rendererBridge.ts`）
- 大 tsx（NovelCreation.tsx / ChapterWorkbench.tsx）编辑铁律：只信 Grep 工具 + tsc + git diff，不信 Read/bash 转储；改动锚 ASCII-only 行，中文文案塞独立文件；不用 sed 多行插入。
- 导出逻辑**只移动、不修改**：迁移前先从 `8c016cc` 基线生成样本，迁移后逐字节对比。
- 复制/导出提示文案一字不改（见各 Task 内嵌真实文案）。
- 验证命令统一：`npm run build`，期望 exit 0、无 TS 报错。

---

## 文件结构

| 文件 | 责任 | 动作 |
|---|---|---|
| `src/features/novel-creation/novelExport.ts` | 全书导出服务：四 handler + 构建纯函数，只由 NovelCreation 调用 | 新增 |
| `src/features/novel-creation/ChapterWorkbench.tsx` | 移除导出、消费跳转意图自动开伏笔面板、上报最近有效章 | 修改 |
| `src/features/novel-creation/ForeshadowingPanel.tsx` | embedded 头部新增「AI 分析章节」专用 action props | 修改 |
| `src/features/novel-creation/NovelCreation.tsx` | 伏笔跳转+章节选择器、导出菜单、编辑按钮、移除 emotion | 修改 |
| `src/features/novel-creation/NovelCreation.css` | 移除 emotion 样式；选择器/菜单/按钮样式 | 修改 |
| `src/app/icons.tsx` | 删除 ChartIcon | 修改 |
| `docs/plans/2026-07-06-v1-roadmap-adjusted.md` | Phase 4 进入条件追加情感曲线阻断项 | 修改 |
| `docs/plans/2026-07-10-novel-feature-entry-alignment-spec.md` | 本包 spec（随最终 commit 入库） | 已存在 |

**执行顺序理由**：Task 1（基线样本）必须在任何导出代码改动前跑；Task 2（抽导出服务）是纯移动，先做且可独立验证等价；Task 3-4（伏笔归位）依赖面板 props 扩展；Task 5（情感曲线移除）与 Task 6（编辑入口）互相独立，放导出/伏笔之后；Task 7 收尾统一 commit。

---

### Task 1: 生成迁移前导出基线样本（仓库外）

**Files:**
- 无代码改动。产出物写入仓库外临时目录 `$TMPDIR/nfea-baseline/`（不进 git）。

**Interfaces:**
- Consumes: 当前 HEAD = `8c016cc`（迁移前基线）。
- Produces: 三份基线样本供 Task 2 等价对比——`baseline.md`（全书 Markdown）、`baseline.doc.html`（Word HTML）、`baseline.zip`（离线包）+ 其解包文件清单。

**背景**：导出逻辑迁移后无法回溯"迁移前"输出。必须在动任何导出代码前，用同一本测试小说跑一次基线。因项目无独立导出 CLI，采用**临时脚本注入法**：在 GUI 里用一本含 2+ 有正文章 + 简介 + 1 条伏笔的测试小说，手动点四个导出，把产物存到临时目录。

- [ ] **Step 1: 确认基线 commit**

Run: `git -C "F:/AIProject/Endless Creation" log --oneline -1`
Expected: `8c016cc feat: 完善小说设定系统与蓝图导航`（工作区应干净：`git status --porcelain` 空）

- [ ] **Step 2: 建仓库外临时目录**

```bash
mkdir -p "$TMPDIR/nfea-baseline" 2>/dev/null || mkdir -p /tmp/nfea-baseline
```
（Windows Git Bash 下 `$TMPDIR` 可能空，回退 `/tmp/nfea-baseline`；记下实际路径供后续引用）

- [ ] **Step 3: 准备测试小说并生成四份导出**

在 `npm run dev:electron` 启动的 app 里：新建/选一本测试小说，确保含标题、简介、≥2 个有正文章节、≥1 条伏笔。依次点：复制全书 Markdown（粘贴存 `baseline.md`）、导出 .md 文件（存 `baseline.md` 覆盖确认一致）、导出 Word 分镜本（存 `baseline.doc.html`）、导出离线包 ZIP（存 `baseline.zip`）。

**注**：这一步是人工 GUI 操作。执行者若为 subagent 无法开 GUI，则改为在 Task 2 完成后用**同一 novel JSON** 跑迁移前后函数对比（见 Task 2 Step 6 的替代验证）。记录测试小说的 novel.json 到 `$BASELINE/novel.json` 作为可复现输入。

- [ ] **Step 4: 记录 ZIP 文件清单**

```bash
cd "$BASELINE" && unzip -l baseline.zip | tee baseline.zip.list
```
Expected: 列出 `index.html` / `novel.md` / `novel.json` / `README.txt` 四项。

- [ ] **Step 5: 不提交**

基线样本在仓库外，天然不进 git。确认 `git status --porcelain` 仍为空。

---

### Task 2: 抽取导出服务模块 novelExport.ts（纯移动）

**Files:**
- Create: `src/features/novel-creation/novelExport.ts`
- Modify: `src/features/novel-creation/ChapterWorkbench.tsx`（移出导出函数、删四按钮、清 storeZip import）

**Interfaces:**
- Consumes: `Novel` 类型（`src/types/novel.ts`）；`rendererBridge`（`copyText`/`saveTextFile`/`saveBinaryFile`）；`createStoreZip`/`textToBytes`/`StoreZipEntry`（`src/services/storeZip`）。
- Produces: 四个导出 handler 供 NovelCreation（Task 4）调用：
  - `copyWholeBookMarkdown(novel: Novel): Promise<void>`
  - `exportWholeBookMarkdownFile(novel: Novel): Promise<void>`
  - `exportStoryboardDocFile(novel: Novel): Promise<void>`
  - `exportOfflinePackage(novel: Novel): Promise<void>`
  - 内部纯函数 `buildWholeBookMarkdown` / `buildStoryboardDocHtml` / `buildOfflinePackageFiles` / `docParagraphs` / `escapeDocHtml`（依赖闭包，一并迁入；`brief` 不迁，留工作台）。

**关键**：这是**纯移动**——函数体逐字节照搬，只把工作台闭包内引用 `novel` 改为参数 `novel`。原工作台里这些函数已是模块级纯函数（`ChapterWorkbench.tsx:1272-1362`）或仅依赖 `novel`+bridge 的 handler（`752-807`），迁移不改逻辑。

- [ ] **Step 1: 创建 novelExport.ts，迁入四 handler + 五纯函数**

新建 `src/features/novel-creation/novelExport.ts`，内容 = 从 ChapterWorkbench 逐字节搬来的以下函数（保持实现完全一致）：

```typescript
import type { Novel } from '../../types/novel';
import { rendererBridge } from '../../services/rendererBridge';
import { createStoreZip, textToBytes, type StoreZipEntry } from '../../services/storeZip';

export async function copyWholeBookMarkdown(novel: Novel): Promise<void> {
  const markdown = buildWholeBookMarkdown(novel);
  if (!markdown) {
    window.alert('暂无可复制的正文');
    return;
  }
  try {
    await rendererBridge.copyText(markdown);
    window.alert('全书 Markdown 已复制');
  } catch {
    window.alert('复制失败，请手动复制');
  }
}

export async function exportWholeBookMarkdownFile(novel: Novel): Promise<void> {
  const markdown = buildWholeBookMarkdown(novel);
  if (!markdown) {
    window.alert('暂无可导出的正文');
    return;
  }
  const defaultName = `${novel.title.trim() || '未命名小说'}.md`;
  try {
    const result = await rendererBridge.saveTextFile(defaultName, markdown);
    if (result.ok) window.alert('全书 Markdown 已导出');
    else window.alert(result.message || '已取消导出');
  } catch {
    window.alert('导出失败，请重试');
  }
}

export async function exportStoryboardDocFile(novel: Novel): Promise<void> {
  const html = buildStoryboardDocHtml(novel);
  if (!html) {
    window.alert('暂无可导出的内容');
    return;
  }
  const defaultName = `${novel.title.trim() || '未命名小说'}.doc`;
  try {
    const result = await rendererBridge.saveTextFile(defaultName, html, 'doc');
    if (result.ok) window.alert('Word 分镜本已导出');
    else window.alert(result.message || '已取消导出');
  } catch {
    window.alert('导出失败，请重试');
  }
}

export async function exportOfflinePackage(novel: Novel): Promise<void> {
  const defaultName = `${novel.title.trim() || '未命名小说'}.zip`;
  try {
    const zip = createStoreZip(buildOfflinePackageFiles(novel));
    const result = await rendererBridge.saveBinaryFile(defaultName, zip, 'zip');
    if (result.ok) window.alert('离线包已导出');
    else window.alert(result.message || '已取消导出');
  } catch {
    window.alert('导出失败，请重试');
  }
}
```

**再把这五个纯函数从 ChapterWorkbench 逐字节搬入本文件**（在上述 export 之后）：`buildOfflinePackageFiles`（工作台 1290-1312）、`buildStoryboardDocHtml`（1314-1351）、`buildWholeBookMarkdown`（1353-1362）、`docParagraphs`（1281-1288）、`escapeDocHtml`（1277-1279）。

**先取原始字节**（不信 Read 渲染），再照搬：

Run: `git -C "F:/AIProject/Endless Creation" show HEAD:src/features/novel-creation/ChapterWorkbench.tsx | sed -n '1277,1362p'`
把这段五个函数原样粘入 novelExport.ts（`brief` 1272-1275 **不搬**）。

- [ ] **Step 2: 从 ChapterWorkbench 删除已迁出的函数与 handler**

用 Grep 工具定位后，Edit 删除 ChapterWorkbench 中的：`copyWholeBookMarkdown`/`exportWholeBookMarkdownFile`/`exportStoryboardDocFile`/`exportOfflinePackage`（组件内闭包 752-807）、`docParagraphs`/`escapeDocHtml`/`buildOfflinePackageFiles`/`buildStoryboardDocHtml`/`buildWholeBookMarkdown`（模块级 1277-1362）。**保留 `brief`（1272-1275）**。

- [ ] **Step 3: 删除工作台四个导出按钮**

Grep 定位 `ChapterWorkbench.tsx` 中导出按钮块（原 1019-1022）：

```
<button className="novel-flow__ghost" onClick={() => void copyWholeBookMarkdown()} type="button">复制全书 Markdown</button>
<button className="novel-flow__ghost" onClick={() => void exportWholeBookMarkdownFile()} type="button">导出 .md 文件</button>
<button className="novel-flow__ghost" onClick={() => void exportStoryboardDocFile()} type="button">导出 Word 分镜本</button>
<button className="novel-flow__ghost" onClick={() => void exportOfflinePackage()} type="button">导出离线包 ZIP</button>
```

Edit 删除这四行。若它们外层有专属容器（如导出工具条 div）且删后为空，一并删容器。

- [ ] **Step 4: 清理 ChapterWorkbench 不再使用的 storeZip import**

原 import（`ChapterWorkbench.tsx:11`）：
```typescript
import { assertStoreZipSelfCheck, createStoreZip, textToBytes, type StoreZipEntry } from '../../services/storeZip';
```
用 Grep 核对删除导出函数后，`createStoreZip`/`textToBytes`/`StoreZipEntry`/`assertStoreZipSelfCheck` 在 ChapterWorkbench 内是否还有其它引用：

Run: `git -C "F:/AIProject/Endless Creation" grep -n "createStoreZip\|textToBytes\|StoreZipEntry\|assertStoreZipSelfCheck" -- src/features/novel-creation/ChapterWorkbench.tsx`
Expected: 删除后应只剩 import 行本身。若确认无其它引用，Edit 删掉整行 import。**若 `assertStoreZipSelfCheck` 仍在别处被调用则保留该符号**（按 grep 实际结果决定，不臆断）。

- [ ] **Step 5: build 验证**

Run: `cd "F:/AIProject/Endless Creation" && npm run build`
Expected: exit 0，无 TS 报错（尤其无 "unused import" / "cannot find name copyWholeBookMarkdown" 类错误）。

- [ ] **Step 6: 导出等价字节对比**

用与 Task 1 相同的 novel.json，在迁移后 app 里重跑四个导出（此时入口已不在工作台——用 Task 4 完成后的详情页菜单；若 Task 顺序上此处菜单未就绪，把本 Step 推迟到 Task 4 之后执行，标注依赖）。产物存 `$AFTER/`。逐一对比：

```bash
diff "$BASELINE/baseline.md" "$AFTER/after.md" && echo "MD 一致"
diff "$BASELINE/baseline.doc.html" "$AFTER/after.doc.html" && echo "Word HTML 一致"
cmp "$BASELINE/baseline.zip" "$AFTER/after.zip" && echo "ZIP 字节一致"
```
Expected: 三者全一致（Markdown 字符串相同、Word HTML 相同、ZIP 逐字节相同）。

**替代验证（无 GUI 时）**：因四函数是纯函数（除 handler 的 alert/bridge 副作用），可写一次性 node 脚本 import `buildWholeBookMarkdown`/`buildStoryboardDocHtml`/`buildOfflinePackageFiles`，喂同一 novel.json，对比输出与基线。跑完即删脚本。

- [ ] **Step 7: 不 commit，暂存快照**

Run: `git -C "F:/AIProject/Endless Creation" add -A && git -C "F:/AIProject/Endless Creation" status --short`
（仅暂存留痕，**不 commit**——全包最后统一提交。后续 Task 继续在此基础上改。）

---

### Task 3: 扩展 ForeshadowingPanel embedded 头部「AI 分析章节」入口

**Files:**
- Modify: `src/features/novel-creation/ForeshadowingPanel.tsx`（`ForeshadowingPanelProps` + embedded 头部渲染）

**Interfaces:**
- Consumes: 现有 `variant?: 'modal' | 'embedded'`、`isForm` 状态、`openCreate`。
- Produces: 三个新可选 prop 供 NovelCreation（Task 4）传入：
  - `onAnalyzeChapter?: () => void`
  - `analyzeDisabled?: boolean`
  - `analyzeDisabledHint?: string`
  只在 `variant === 'embedded' && !isForm` 时渲染「AI 分析章节」按钮，与现有「新增伏笔」并列。modal 形态不传、不渲染，行为不变。

- [ ] **Step 1: Props 接口加三个可选字段**

Grep 定位 `ForeshadowingPanelProps`（约 `ForeshadowingPanel.tsx:15-56`），在 `variant?`/`showAiSuggestions?` 附近 Edit 追加：

```typescript
  onAnalyzeChapter?: () => void;
  analyzeDisabled?: boolean;
  analyzeDisabledHint?: string;
```

- [ ] **Step 2: 解构 props 带默认值**

Grep 定位函数解构（约 62-80），在 `showAiSuggestions = true,` 附近 Edit 追加：

```typescript
  onAnalyzeChapter,
  analyzeDisabled = false,
  analyzeDisabledHint = '',
```

- [ ] **Step 3: embedded 头部渲染「AI 分析章节」按钮**

Grep 定位 embedded 头部（约 143-148，含 `variant === 'embedded' && !isForm && ...新增伏笔` 的那行）。当前是：
```tsx
{variant === 'embedded' && !isForm && <button className="novel-flow__primary novel-flow__primary--compact" onClick={openCreate} type="button">新增伏笔</button>}
```
Edit 改为把「AI 分析章节」与「新增伏笔」并列（用一个 fragment 包裹，AI 按钮在前）：
```tsx
{variant === 'embedded' && !isForm && (
  <div className="novel-project-panel__head-actions">
    {onAnalyzeChapter && <button className="novel-flow__ghost" disabled={analyzeDisabled} title={analyzeDisabled ? analyzeDisabledHint : undefined} onClick={onAnalyzeChapter} type="button">AI 分析章节</button>}
    <button className="novel-flow__primary novel-flow__primary--compact" onClick={openCreate} type="button">新增伏笔</button>
  </div>
)}
```

- [ ] **Step 4: build 验证**

Run: `cd "F:/AIProject/Endless Creation" && npm run build`
Expected: exit 0。ChapterWorkbench 的 modal 形态调用（不传新 props）应仍编译通过（props 全可选）。

- [ ] **Step 5: 暂存不 commit**

Run: `git -C "F:/AIProject/Endless Creation" add -A`

---

### Task 4: 伏笔 AI 归位跳转 + 章节选择器 + 导出菜单（NovelCreation + ChapterWorkbench）

**Files:**
- Modify: `src/features/novel-creation/NovelCreation.tsx`（跳转意图 state、最近有效章 Map、章节选择器、导出菜单接线、伏笔面板传 analyze props）
- Modify: `src/features/novel-creation/ChapterWorkbench.tsx`（消费 initialPanel 自动开伏笔面板、上报最近有效章、返回 tab）

**Interfaces:**
- Consumes: `openProjectWorkbench(id: string, chapterId?: string)`（现签名 `NovelCreation.tsx:220`）；`ChapterWorkbenchProps`（含 `onOpenProjectView`/`activeChapterId`/`onSelectChapter`）；Task 2 的 `novelExport` 四 handler；Task 3 的面板 analyze props。
- Produces: 一次性跳转意图（`initialForeshadowPanel` + `workbenchReturnTab`）、按 novelId 的最近有效章内存 Map。

**设计要点**（对齐 spec §2.4）：
- 意图仅本会话内存 state，不落库、不新增 Novel 字段。
- `openProjectWorkbench` 增加可选参数携带意图；只有 openNovel 成功后才写意图，失败清意图留伏笔页。
- 最近有效章 Map 在"工作台选中有正文章"**和**"空章生成出正文"两处都更新。
- initialPanel 消费一次即清；普通「开始创作」不带、不继承。

- [ ] **Step 1: NovelCreation 加意图与最近有效章 state**

Grep 定位 state 声明区（约 `NovelCreation.tsx:51` `activeChapterId` 附近），Edit 追加：

```typescript
  const [initialForeshadowPanel, setInitialForeshadowPanel] = useState(false);
  const [workbenchReturnTab, setWorkbenchReturnTab] = useState<ProjectViewTab | null>(null);
  const lastValidChapterRef = useRef<Map<string, string>>(new Map());
```

- [ ] **Step 2: openProjectWorkbench 支持携带意图 + 失败清意图**

Grep 取原始函数体：
Run: `git -C "F:/AIProject/Endless Creation" grep -n "async function openProjectWorkbench" -- src/features/novel-creation/NovelCreation.tsx`

原签名 `async function openProjectWorkbench(id: string, chapterId?: string)`。Edit 改为增加第三参数与意图写入：

```typescript
  async function openProjectWorkbench(id: string, chapterId?: string, intent?: { foreshadowPanel?: boolean; returnTab?: ProjectViewTab }) {
    // ...原有 openNovel 加载逻辑保持...
    // 仅在 openNovel 成功后写意图；失败分支清意图、留在当前页
  }
```
**关键**：定位函数内 openNovel 成功/失败分支。成功后 `setInitialForeshadowPanel(Boolean(intent?.foreshadowPanel)); setWorkbenchReturnTab(intent?.returnTab ?? null);`；失败分支（return 前）`setInitialForeshadowPanel(false); setWorkbenchReturnTab(null);`。普通调用（不传 intent）等价于清意图。取原始字节后按实际结构 Edit，不臆改加载逻辑。

- [ ] **Step 3: 章节选择器 state + 组件**

Grep 定位组件 return 前，加选择器 state（Step 1 附近）：
```typescript
  const [chapterPickerOpen, setChapterPickerOpen] = useState(false);
```
在 return 内 modal 区域（如 `modalMode` 弹窗 `NovelCreation.tsx:1091` 附近）Edit 追加章节选择器 modal。列表来自 `currentNovel.chapters`，每项展示序号/标题/字数/状态，无正文（`chapter.content.trim() === ''`）禁用并标注「暂无正文」，默认选中 = `lastValidChapterRef.current.get(currentNovel.id)` 或第一个有正文章：

```tsx
{chapterPickerOpen && currentNovel && (
  <div className="novel-modal" role="dialog" aria-modal="true" aria-label="选择要分析的章节" onClick={() => setChapterPickerOpen(false)}>
    <div className="novel-chapter-picker" onClick={(event) => event.stopPropagation()}>
      <h2>选择要分析的章节</h2>
      <p className="novel-workbench__preview-sub">伏笔 AI 会分析所选章节的正文，识别新埋线索与可回收伏笔。</p>
      <div className="novel-chapter-picker__list">
        {currentNovel.chapters.map((chapter, index) => {
          const empty = chapter.content.trim() === '';
          const defaultId = lastValidChapterRef.current.get(currentNovel.id) ?? currentNovel.chapters.find((c) => c.content.trim())?.id;
          return (
            <label className={empty ? 'novel-chapter-picker__item novel-chapter-picker__item--disabled' : 'novel-chapter-picker__item'} key={chapter.id}>
              <input type="radio" name="analyze-chapter" value={chapter.id} disabled={empty} defaultChecked={chapter.id === defaultId} />
              <span className="novel-chapter-picker__index">{index + 1}</span>
              <span className="novel-chapter-picker__title">{chapter.title || '未命名章节'}</span>
              <span className="novel-chapter-picker__meta">{countWords(chapter.content)} 字 · {CHAPTER_STATUS_LABEL[resolveChapterStatus(chapter)]}{empty ? ' · 暂无正文' : ''}</span>
            </label>
          );
        })}
      </div>
      <footer>
        <button className="novel-flow__ghost" onClick={() => setChapterPickerOpen(false)} type="button">取消</button>
        <button className="novel-flow__primary novel-flow__primary--compact" onClick={() => {
          const picked = (document.querySelector('input[name="analyze-chapter"]:checked') as HTMLInputElement | null)?.value;
          if (!picked) return;
          setChapterPickerOpen(false);
          void openProjectWorkbench(currentNovel.id, picked, { foreshadowPanel: true, returnTab: 'foreshadowing' });
        }} type="button">进入工作台分析</button>
      </footer>
    </div>
  </div>
)}
```

- [ ] **Step 4: 伏笔 tab 传 analyze props + 打开选择器**

Grep 定位 foreshadowing tab 的 `<ForeshadowingPanel variant="embedded" ...>`（约 `NovelCreation.tsx:953`）。Edit 追加三 prop。全书无正文时禁用：

```tsx
                    onAnalyzeChapter={() => setChapterPickerOpen(true)}
                    analyzeDisabled={!chapters.some((c) => c.content.trim())}
                    analyzeDisabledHint="请先完成章节正文"
```
（`chapters` 已是组件内当前小说章节列表。）

- [ ] **Step 5: ChapterWorkbench 消费 initialPanel + 返回 tab**

给 `ChapterWorkbenchProps` 加两可选 prop，Grep 定位接口（`ChapterWorkbench.tsx:33`）：
```typescript
  initialForeshadowPanel?: boolean;
  onConsumeInitialPanel?: () => void;
```
在 NovelCreation 渲染 `<ChapterWorkbench .../>`（约 `NovelCreation.tsx:1073`）传入：
```tsx
          initialForeshadowPanel={initialForeshadowPanel}
          onConsumeInitialPanel={() => setInitialForeshadowPanel(false)}
```
ChapterWorkbench 内：Grep 定位伏笔 modal 开关 state（现有控制「伏笔记录」modal 的 state，如 `foreshadowOpen`/`showForeshadow` 之类——先 grep 确认真实名）。加 useEffect 挂载时消费一次：
```typescript
  useEffect(() => {
    if (initialForeshadowPanel) {
      setShowForeshadow(true); // 用 grep 确认的真实 state setter 名替换
      onConsumeInitialPanel?.();
    }
  }, [initialForeshadowPanel]);
```

- [ ] **Step 6: ChapterWorkbench 上报最近有效章（选中有正文章 + 空章生成出正文）**

在 NovelCreation 侧提供回调 prop（避免 ChapterWorkbench 直接持 Map）。给 `ChapterWorkbenchProps` 加：
```typescript
  onValidChapter?: (chapterId: string) => void;
```
NovelCreation 传：
```tsx
          onValidChapter={(chapterId) => { if (currentNovel) lastValidChapterRef.current.set(currentNovel.id, chapterId); }}
```
ChapterWorkbench 内两处触发（Grep 定位）：① 选中章节且该章有正文时（`onSelectChapter` 或 activeChapter 变更处，判 `content.trim()` 非空）；② 正文生成/写入成功、章节从空变有正文处。两处调 `onValidChapter?.(chapter.id)`。按 grep 实际生成成功点接线，不臆造新流程。

- [ ] **Step 7: 工作台「项目详情」返回按 returnTab**

Grep 定位 `onOpenProjectView`（`ChapterWorkbench.tsx:1024` 按钮 + NovelCreation 传入处）。NovelCreation 里 `onOpenProjectView` 回调改为：若 `workbenchReturnTab` 非空则 `setProjectViewTab(workbenchReturnTab)` 后清空，否则默认行为（回项目概览/现状）。取原始传入字节后 Edit：
```tsx
          onOpenProjectView={() => {
            setView('projectView');
            if (workbenchReturnTab) { setProjectViewTab(workbenchReturnTab); setWorkbenchReturnTab(null); }
          }}
```
（若现有 `onOpenProjectView` 已有逻辑，保留并在其后插入 returnTab 分支。）

- [ ] **Step 8: 详情页顶部「导出作品」菜单接线**

Grep 定位详情页顶部操作 nav（`NovelCreation.tsx:824-828` 附近，含「返回列表」「开始创作」）。Edit 追加导出菜单。先 import Task 2 的服务：
```typescript
import { copyWholeBookMarkdown, exportOfflinePackage, exportStoryboardDocFile, exportWholeBookMarkdownFile } from './novelExport';
```
用一个受控展开菜单（新 state `const [exportMenuOpen, setExportMenuOpen] = useState(false);`）：
```tsx
              <div className="novel-project-view__export">
                <button className="novel-project-view__action" onClick={() => setExportMenuOpen((v) => !v)} type="button"><span>导出作品</span></button>
                {exportMenuOpen && (
                  <div className="novel-project-view__export-menu" onMouseLeave={() => setExportMenuOpen(false)}>
                    <button onClick={() => { setExportMenuOpen(false); void copyWholeBookMarkdown(currentNovel); }} type="button">复制全书 Markdown</button>
                    <button onClick={() => { setExportMenuOpen(false); void exportWholeBookMarkdownFile(currentNovel); }} type="button">导出 .md 文件</button>
                    <button onClick={() => { setExportMenuOpen(false); void exportStoryboardDocFile(currentNovel); }} type="button">导出 Word 分镜本</button>
                    <button onClick={() => { setExportMenuOpen(false); void exportOfflinePackage(currentNovel); }} type="button">导出离线包 ZIP</button>
                  </div>
                )}
              </div>
```

- [ ] **Step 9: build 验证**

Run: `cd "F:/AIProject/Endless Creation" && npm run build`
Expected: exit 0，无 TS 报错。

- [ ] **Step 10: 执行 Task 2 Step 6 延迟的导出等价对比**

现在详情页导出菜单已就绪，跑迁移后四导出，按 Task 2 Step 6 的 diff/cmp 对比基线。Expected: MD/Word/ZIP 全等价。

- [ ] **Step 11: 暂存不 commit**

Run: `git -C "F:/AIProject/Endless Creation" add -A`

---

### Task 5: 移除情感曲线假入口 + 删 ChartIcon + 路线图阻断项

**Files:**
- Modify: `src/features/novel-creation/NovelCreation.tsx`（emotion 类型/导航项/空页 JSX/import）
- Modify: `src/features/novel-creation/NovelCreation.css`（`novel-emotion-empty*`）
- Modify: `src/app/icons.tsx`（删 ChartIcon）
- Modify: `docs/plans/2026-07-06-v1-roadmap-adjusted.md`（Phase 4 阻断项）

**Interfaces:**
- Consumes: 无。
- Produces: 7 tab 导航（去 emotion），全库 ChartIcon 零引用。

- [ ] **Step 1: ProjectViewTab 类型去 emotion**

Grep 定位（`NovelCreation.tsx:20` 一带）：
```typescript
type ProjectViewTab = 'overview' | 'world' | 'characters' | 'graph' | 'outline' | 'chapters' | 'emotion' | 'foreshadowing';
```
Edit 删 `'emotion' | `。

- [ ] **Step 2: PROJECT_VIEW_TABS 删情感曲线项**

Grep 定位数组项：
```typescript
  { id: 'emotion', label: '情感曲线', description: '追踪章节情感变化', Icon: ChartIcon },
```
Edit 删整行。

- [ ] **Step 3: 删情感曲线空页 JSX**

Grep 定位 `projectViewTab === 'emotion'` 渲染块（约 `NovelCreation.tsx:940-950`，含 `novel-emotion-empty`）。Edit 删整个 `{projectViewTab === 'emotion' && (...)}` 块。

- [ ] **Step 4: 删 ChartIcon import 引用**

Grep 定位 `NovelCreation.tsx:2` import 行，Edit 从解构中删 `ChartIcon, `。删后 grep 确认 NovelCreation 内 ChartIcon 零引用：
Run: `git -C "F:/AIProject/Endless Creation" grep -n "ChartIcon" -- src/features/novel-creation/NovelCreation.tsx`
Expected: 无输出。

- [ ] **Step 5: 删 icons.tsx 里 ChartIcon 定义**

Grep 定位 `src/app/icons.tsx:206` `export function ChartIcon`。Edit 删整个函数（含前后空行）。全库确认零引用：
Run: `git -C "F:/AIProject/Endless Creation" grep -n "ChartIcon" -- src`
Expected: 无输出。

- [ ] **Step 6: 删 NovelCreation.css 情感曲线样式**

Grep 定位 `novel-emotion-empty`：
Run: `git -C "F:/AIProject/Endless Creation" grep -n "novel-emotion" -- src/features/novel-creation/NovelCreation.css`
Edit 删除所有 `.novel-emotion-empty*` 规则块。删后再 grep 确认零残留。

- [ ] **Step 7: 路线图追加 Phase 4 阻断项**

Read `docs/plans/2026-07-06-v1-roadmap-adjusted.md`，定位 Phase 4「进入条件」清单（若无明确清单，定位 Phase 4 章节起始）。Edit 追加：
```
- [ ] 情感曲线闭环：按章节 AI 分析情绪、按 novelId 持久化、支持重新分析并展示真实曲线；完成前不得进入 Phase 4。
```

- [ ] **Step 8: build 验证**

Run: `cd "F:/AIProject/Endless Creation" && npm run build`
Expected: exit 0，无 "ChartIcon is not defined" / unused 类错误。

- [ ] **Step 9: 暂存不 commit**

Run: `git -C "F:/AIProject/Endless Creation" add -A`

---

### Task 6: 补齐项目「编辑信息」入口

**Files:**
- Modify: `src/features/novel-creation/NovelCreation.tsx`（详情页顶部加编辑按钮，接现有 `setModalMode('edit')`）

**Interfaces:**
- Consumes: 现有 `modalMode` state（`'create'|'edit'|null`，`NovelCreation.tsx:55`）、`form` state、`submitNovelForm`（edit 分支已存在）、`setForm`。
- Produces: 详情页可触发编辑弹窗；保存走现有 saveNovel 链。

- [ ] **Step 1: 详情页顶部加「编辑信息」按钮**

Grep 定位详情页顶部 nav（Task 4 Step 8 同区域，`NovelCreation.tsx:824-828`）。Edit 追加按钮，点击预填 form 再开弹窗：
```tsx
              <button className="novel-project-view__action" onClick={() => {
                setForm({ title: currentNovel.title, summary: currentNovel.summary, note: currentNovel.note });
                setModalMode('edit');
              }} type="button"><span>编辑信息</span></button>
```
**核对**：`NovelForm` 类型是 `{ title; summary; note }`（`NovelCreation.tsx` 顶部 type）。确认 `currentNovel.note` 字段存在（Grep `note` 于 novel 类型）。若 `submitNovelForm` 的 edit 分支依赖某个"当前编辑 id"，Grep 确认它读的是 `currentNovel.id` 或已有 selectedId，不足则补线（取原始字节后判断）。

- [ ] **Step 2: build 验证**

Run: `cd "F:/AIProject/Endless Creation" && npm run build`
Expected: exit 0。

- [ ] **Step 3: GUI 验证编辑落库**

`npm run dev:electron`：详情页点「编辑信息」→ 弹窗预填当前标题/简介/备注 → 改三字段 → 保存 → 确认详情页/列表即时更新 → 刷新（Ctrl+R）后仍保留 → 重启 app 后仍保留。

- [ ] **Step 4: 暂存不 commit**

Run: `git -C "F:/AIProject/Endless Creation" add -A`

---

### Task 7: 全量对账验收 + 唯一 commit

**Files:**
- 无新改动。验收 + 提交。

**Interfaces:**
- Consumes: Task 1-6 全部改动（已暂存未提交）。
- Produces: 唯一 commit `fix: 补齐小说功能入口与导出归位`。

- [ ] **Step 1: 双端 build 终检**

Run: `cd "F:/AIProject/Endless Creation" && npm run build`
Expected: exit 0（renderer tsc+vite + electron tsc 全绿）。

- [ ] **Step 2: git diff --check + 无 schema/IPC 改动审计**

Run: `git -C "F:/AIProject/Endless Creation" diff --cached --check`
Expected: 无空白错误/冲突标记。

Run: `git -C "F:/AIProject/Endless Creation" diff --cached --stat -- src/types/novel.ts electron/preload/bridgeTypes.ts electron/main/index.ts src/services/rendererBridge.ts`
Expected: 无输出（这四个文件零改动，证明无新增 schema/IPC）。

- [ ] **Step 3: ChartIcon / emotion 全库零引用终检**

Run: `git -C "F:/AIProject/Endless Creation" grep -n "ChartIcon\|novel-emotion\|'emotion'\|情感曲线" -- src`
Expected: 无输出。

- [ ] **Step 4: 无回退全量对账（GUI）**

`npm run dev:electron`，逐条确认工作台原有能力仍在（spec §6-E16）：SSE 流式生成+取消+草稿确认、多版本+历史写回、评审、一致性、节奏、四类选区优化、AI 生成后续大纲、章节状态/字数目标/软提示、设定速查、伏笔记录（工作台 modal 含 AI 找伏笔/识别回收）。确认成本统计在详情页 NovelStats 正常显示、按 novel.id 隔离（§6-E17）。确认伏笔跳转全链路（§6-A）、导出菜单四项（§6-B）、7 tab（§6-C）、编辑入口（§6-D）。

- [ ] **Step 5: 清理基线临时目录**

Run: `rm -rf "$BASELINE" "$AFTER"`（仓库外，天然不在 git）。确认 `git status --porcelain` 只含本包应有改动。

- [ ] **Step 6: 唯一 commit**

Run:
```bash
git -C "F:/AIProject/Endless Creation" add -A
git -C "F:/AIProject/Endless Creation" commit -m "fix: 补齐小说功能入口与导出归位"
```
Expected: 提交成功。commit 内含：novelExport.ts（新）、ChapterWorkbench.tsx、ForeshadowingPanel.tsx、NovelCreation.tsx、NovelCreation.css、icons.tsx、roadmap.md、本包 spec.md。

- [ ] **Step 7: 提交后核对**

Run: `git -C "F:/AIProject/Endless Creation" show --stat HEAD | head -20`
Expected: 单 commit，文件清单符合预期，工作区干净。**是否 push 由 PO 决定，本计划不自动 push。**

---

## Self-Review

**Spec 覆盖对照**（spec §2-§6 逐项 → task）：
- §2 伏笔归位/跳转/选择器/状态隔离/失败路径 → Task 3（面板入口）+ Task 4（跳转/选择器/意图/Map/返回）✓
- §3 导出抽取/菜单/删按钮/等价证据/基线 → Task 1（基线）+ Task 2（抽取+删按钮+等价）+ Task 4 Step 8/10（菜单+对比）✓
- §4 情感曲线移除/ChartIcon/路线图 → Task 5 ✓
- §5 编辑入口 → Task 6 ✓
- §6 验收清单 A-F → Task 7 全量对账 + 各 Task 内嵌 build/grep/等价 ✓
- §1.3 单 commit/不改 schema → Task 7 Step 2/6 审计 ✓

**Placeholder 扫描**：无 TBD/TODO。所有 JSX/TS 代码块为可粘贴内容；"用 grep 确认真实 state 名"处均给了定位命令 + 占位替换说明（真实名依赖当前字节，不臆造）。

**类型一致性**：`ProjectViewTab` 去 emotion 后 8→7；`openProjectWorkbench` 第三参 intent 结构 `{foreshadowPanel?, returnTab?}` 在 Task 4 Step 2/3 一致；面板三 prop 名 `onAnalyzeChapter`/`analyzeDisabled`/`analyzeDisabledHint` 在 Task 3/4 一致；`initialForeshadowPanel`/`onConsumeInitialPanel`/`onValidChapter` 在 Task 4 内一致。

**已知实现期依赖真实字节的点**（计划已标注取原始字节后再 Edit，非 placeholder）：ChapterWorkbench 伏笔 modal 的 state setter 真实名（Task 4 Step 5）、`onOpenProjectView` 现有传入逻辑（Step 7）、正文生成成功点（Step 6）、storeZip `assertStoreZipSelfCheck` 是否别处引用（Task 2 Step 4）、`submitNovelForm` edit 分支的 id 来源（Task 6 Step 1）。这些用 Grep 工具核对，符合大 tsx 编辑铁律。
