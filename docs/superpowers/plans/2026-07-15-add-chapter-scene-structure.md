---
change: add-chapter-scene-structure
design-doc: docs/superpowers/specs/2026-07-15-add-chapter-scene-structure-design.md
base-ref: 6dbd5c629fec524310f30308a2f1a2daab4e9fa2
---

# 正文权威模型下沉到 Scene 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把正文权威模型从扁平 `Chapter.content` 下沉到 `Scene.content`，交付完整 Novel → Volume → Chapter → Scene 四级写作能力（schema v7→v8）。

**Architecture:** 新增 `Scene` 接口与 `Chapter.scenes: Scene[]`、删除 `Chapter.content`，由 TypeScript 编译期强制迁移全部正文消费者；新建独立纯函数模块提供 `orderedScenes`/`chapterText`/场景 CRUD 唯一入口；`ChapterWorkbench` 编辑器、撤销栈、版本历史、AI 续写、查找替换、跨章搜索全部下沉到场景粒度；v7→v8 迁移在 Electron `sanitizeNovel` 与 Web `normalizeWebNovel` 两端语义对称，复用现有整本保存链，不新增 IPC/依赖。

**Tech Stack:** TypeScript、React（renderer）、Electron（main + preload bridge）、Vite；无新增第三方依赖。

## Global Constraints

以下约束适用于**每一个**任务，任务的验收隐含包含本节全部条目：

- **D1 `chapterText(chapter)` 权威定义**：`orderedScenes(chapter).map(scene => scene.content).filter(content => content.trim()).join('\n\n')`。只过滤 trim 后为空的场景，**不 trim 非空正文**（保留用户原文首尾空白，一个字符都不改）。空章聚合出空串、字数为 0。导出、字数/进度、Prompt 前文上下文、分析输入统一消费此函数。
- **D2 `orderedScenes(chapter)` 唯一展开入口**：场景按 `order` 升序，order 相同以原数组位置稳定兜底；**不原地修改入参**。与 change 1 的 `orderedChapters` 同构。
- **D3 `scenes.length >= 1` 不变量（三处守卫）**：v7→v8 迁移、新建章 `addChapter`/`createNovel`/`createChapter`、删除场景（删到最后一个时拒绝、UI 按钮禁用）。默认场景持久化标题**留空**，UI 派生显示"场景 N"（不虚构叙事命名）。
- **D4 撤销栈以 `activeSceneId` 为切换边界**：`activeSceneId` 变化即 `resetEditorHistory` 重置；**不做 `Map<sceneId, EditorHistory>` 缓存、不恢复旧栈**。删除当前场景时选相邻场景（优先后一个，无则前一个）作为新 `activeSceneId` 并触发 reset。
- **D5 流式续写防串线机制不变**：`runRef`/`requestIdRef`/`streamTextRef` 三件套逻辑不动，只把写回目标从 `activeChapter` 改为 `activeScene`。AI 写回不进撤销栈的现有语义保持。
- **D6 版本历史整体下沉 scene 粒度**：`ChapterVersion` 快照 / `selectedVersionId` / `MAX_CHAPTER_VERSIONS` 从 Chapter 移到 Scene，`writeVersionToChapter`→`writeVersionToScene`。
- **D7 删除 `Chapter.content` 字段**（不留 deprecated 派生）；`filledChapterCount` = `chapterText(chapter)` 非空的章数；`wordCount` 按 `chapterText` 聚合重算；v7 的 `content`/`versions`/`selectedVersionId` **原样**迁入默认场景。
- **D8 锚点红线**：伏笔 `plantedChapterId`/`payoffChapterId`、`EmotionPoint.chapterId`、人物图谱继续锚 `chapterId`，**不新增持久化 sceneId 业务锚点**。仅允许搜索结果携带瞬时 `sceneId` 用于导航（用完即弃、不落库）。
- **D9 会话态不落库**：`activeChapterId`/`activeSceneId` 均为 React 会话状态，不进 schema；重开小说默认激活首章首场景。
- **四份协议副本必须同步**：`Scene` 接口、`Chapter.scenes`、删 `Chapter.content`、version 8 必须同步进 `src/types/novel.ts`、`electron/preload/bridgeTypes.ts`、`electron/main/index.ts`、`src/services/rendererBridge.ts`。`version: 7` 字面量共 6 处（types 1、bridgeTypes 1、main 2、rendererBridge 2）全部升到 8。
- **Electron / Web 迁移对称**：`sanitizeNovel`（electron/main/index.ts）与 `normalizeWebNovel`（rendererBridge.ts）两端迁移语义必须逐条对称一致。
- **不新增 IPC、不新增第三方依赖、不改卷层、不做 v8→v9**；复用现有 `saveNovel(novel)` 整体持久化链与原子写入。
- **大 tsx 文件红线**：`ChapterWorkbench.tsx` / `NovelCreation.tsx` 用 Read 工具会渲染幻影字节。实现者必须靠 **Grep 锚点 + tsc/CodeGraph 验证**定位与确认，改文件锚 **ASCII-only 行**，**禁止硬怼多行 sed 插入**。

---

## 文件结构总览

| 文件 | 职责 | 本 change 动作 |
|------|------|----------------|
| `src/types/novel.ts` | 权威类型 | 新增 `Scene`、`Chapter.scenes`、删 `Chapter.content`、`ChapterVersion`/`selectedVersionId` 移到 Scene、version 8 |
| `electron/preload/bridgeTypes.ts` | 桥类型副本 | 同步 schema、version 8 |
| `electron/main/index.ts` | 主进程持久化 + `sanitizeNovel` + `createNovel`/`createChapter` | 同步 schema、迁移、新章默认场景、version 8（2 处字面量） |
| `src/services/rendererBridge.ts` | Web fallback | `normalizeWebNovel` 对称迁移、`createNovel` 新章默认场景、version 8（2 处字面量） |
| `src/features/novel-creation/sceneStructure.ts` | **新建** 场景纯函数模块 | `orderedScenes`/`chapterText`/CRUD/默认场景初始化 |
| `src/features/novel-creation/sceneStructure.test.ts`（或项目现有自检风格文件） | **新建** 自检 | 覆盖不变量/稳定排序/order 归一/删到最后一个被拒/迁移聚合 |
| `src/features/novel-creation/NovelCreation.tsx` | 章节创建入口 `addChapter` | 新章初始化默认场景 |
| `src/features/novel-creation/ChapterWorkbench.tsx` | 编辑器内核 | `activeSceneId`、场景 UI、撤销栈按 scene、版本 scene 粒度、AI 续写落 scene、查找替换落 scene |
| `src/features/novel-creation/novelEditorTools.tsx` | 编辑历史/查找替换工具 | 视需要调整 `EditorHistory` 调用锚点（不改核心算法） |
| `novelExport.ts` / `novelProgress.ts` / `NovelStats.tsx` / `novelPrompts.ts` / `characterGraph.ts` / `emotionArc.ts` / `EmotionArcPanel.tsx` / `novelNavigation.tsx` | 正文消费者 | 全部改读 `chapterText(chapter)` / `orderedScenes(chapter)` |

---

## Task 1: Scene schema v8 与四份协议副本同步（tasks 1.1）

**Files:**
- Modify: `src/types/novel.ts`
- Modify: `electron/preload/bridgeTypes.ts`
- Modify: `electron/main/index.ts`（类型副本部分）
- Modify: `src/services/rendererBridge.ts`（类型副本部分）

**Interfaces:**
- Produces（后续所有任务依赖的权威类型）：
  ```ts
  export interface Scene {
    id: string;
    title: string;          // 默认场景持久化留空字符串，UI 派生"场景 N"
    outline?: string;       // 可选场景大纲，供编辑与搜索
    content: string;
    order: number;
    versions?: ChapterVersion[];
    selectedVersionId?: string;
  }

  export interface Chapter {
    // ...保留现有 id/title/outline/order/status/wordGoal 等既有字段...
    scenes: Scene[];        // 新增；不变量 length >= 1
    // content: string;     // 删除
    // versions?: ...;      // 移到 Scene
    // selectedVersionId?:  // 移到 Scene
  }
  ```
  `ChapterVersion` 接口定义保持不变（快照 `content`/`createdAt`/`id` 等既有字段），只是宿主从 Chapter 变为 Scene。

- [x] **Step 1: 定位 `Chapter` 与 `ChapterVersion` 现有定义**

用 Grep（不要用 Read 打开大文件全文，本文件是小类型文件可直接 Read）确认 `src/types/novel.ts` 中 `Chapter`、`ChapterVersion`、`Scene`（应不存在）的当前字段。

Run: `git grep -n "content" src/types/novel.ts`
Expected: 命中 `Chapter.content`、`ChapterVersion.content` 等，确认改动锚点。

- [x] **Step 2: 在 `src/types/novel.ts` 落 Scene 与 Chapter 改动**

新增 `Scene` 接口（见 Interfaces）；在 `Chapter` 中新增 `scenes: Scene[]`；删除 `Chapter.content`；把 `versions?`/`selectedVersionId?` 从 `Chapter` 移到 `Scene`。此时 tsc 会在消费者处报红——这是预期的迁移清单来源（D7），本任务只改类型定义。

- [x] **Step 3: 同步 `electron/preload/bridgeTypes.ts`**

用 Grep 锚定该文件的 `Chapter` 类型副本，作对称改动：新增 `Scene`、`Chapter.scenes`、删 `content`、移 `versions`/`selectedVersionId`。

Run: `git grep -n "version" electron/preload/bridgeTypes.ts`
Expected: 命中 `version: 7`（1 处），改为 `version: 8`。

- [x] **Step 4: 同步 `electron/main/index.ts` 与 `src/services/rendererBridge.ts` 的类型副本**

对两文件中的 `Chapter`/`Scene` 类型副本作同样对称改动（仅类型部分；迁移/创建逻辑在 Task 2）。

- [x] **Step 5: 全仓核对 `version: 7` 字面量已全部升 8**

Run: `git grep -n "version: 7" src electron`
Expected: 无输出（6 处已全部改为 `version: 8`：types 1、bridgeTypes 1、main 2、rendererBridge 2）。

- [x] **Step 6: 编译（预期报红，用作迁移清单）**

Run: `npm.cmd run build`
Expected: renderer tsc 报出 `chapter.content` / `chapter.versions` / `chapter.selectedVersionId` 相关的红点清单（Task 2/6/7 逐处消灭）。记录报红文件清单。

- [x] **Step 7: Commit**

```bash
git add src/types/novel.ts electron/preload/bridgeTypes.ts electron/main/index.ts src/services/rendererBridge.ts
git commit -m "feat: add Scene schema and bump novel version to v8"
```

---

## Task 2: v7→v8 迁移与新章默认场景（tasks 1.2 / 1.3）

**Files:**
- Modify: `electron/main/index.ts`（`sanitizeNovel`、`createNovel`、`createChapter`）
- Modify: `src/services/rendererBridge.ts`（`normalizeWebNovel`、`createNovel`）

**Interfaces:**
- Consumes: Task 1 的 `Scene`/`Chapter.scenes`。
- Produces: 迁移与创建入口保证 `scenes.length >= 1`（D3），后续 UI/编辑器可无条件假设每章至少一个场景。默认场景形如 `{ id, title: '', content, order: 0 }`。

- [x] **Step 1: 定位现有迁移与创建逻辑**

Run: `git grep -n "sanitizeNovel\|createChapter\|createNovel" electron/main/index.ts`
Run: `git grep -n "normalizeWebNovel\|createNovel" src/services/rendererBridge.ts`
Expected: 定位 `sanitizeNovel` 章节消毒段、`createNovel` 初始章构造、以及（若存在）`createChapter`。

- [x] **Step 2: 在主进程 `sanitizeNovel` 加 v7→v8 章节迁移**

对每个 chapter 归一为至少一个场景：
```ts
function migrateChapterScenes(ch: any): Scene[] {
  // 已是 v8 且 scenes 合法：仅归一 order
  if (Array.isArray(ch.scenes) && ch.scenes.length > 0) {
    return normalizeSceneOrder(ch.scenes.map(sanitizeScene));
  }
  // v7 或损坏：把旧 content/versions/selectedVersionId 原样迁入唯一默认场景
  return [{
    id: newId(),
    title: '',                          // 默认场景标题留空（D3）
    content: typeof ch.content === 'string' ? ch.content : '',
    order: 0,
    versions: Array.isArray(ch.versions) ? ch.versions : undefined,
    selectedVersionId: ch.selectedVersionId,
  }];
}
```
其中 `normalizeSceneOrder` 按分组升序归一 order（与 change 1 章 order 归一同构），`sanitizeScene` 保证 `content` 为 string、`title` 为 string。空章（无 content）建一个空默认场景。迁移后清除 chapter 上的旧 `content`/`versions`/`selectedVersionId`（不留派生）。`newId` 用文件内现有 id 生成方式。

- [x] **Step 3: 主进程 `createNovel`/`createChapter` 初始化默认场景**

新建整本小说的首章、以及 `createChapter`（若无独立函数则在其等价的新章构造处）都初始化恰好一个默认场景 `{ id, title: '', content: '', order: 0 }`，version 写 8。

> **实施发现（Task 2 核实）**：两端 `createNovel` 均建空 `chapters: []`（electron/main/index.ts:832、rendererBridge.ts:361），全仓无独立 `createChapter` 函数——"新建小说即空章节列表"是现有行为，本 Step 在这两个文件内无落点。新建章节的 D3 默认场景守卫真正落点是 Task 4 Step 5 的 `addChapter`（`scenes: initialScenes()`）。此 Step 属计划冗余描述，非 Task 2 实现缺口。

- [x] **Step 4: Web 端 `normalizeWebNovel` 对称迁移**

在 `src/services/rendererBridge.ts` 的 `normalizeWebNovel` 落与 Step 2 **逐条对称**的迁移逻辑（同样 content/versions/selectedVersionId 原样迁入、空章建空默认场景、order 分组归一）。`createNovel`（Web fallback）新章初始化默认场景、version 8。两端语义必须一致。

- [x] **Step 5: 编译验证两端类型通过**

Run: `npm.cmd run build`
Expected: `electron/main/index.ts` 与 `src/services/rendererBridge.ts` 相关红点消除（其余消费者红点留待 Task 7）。

- [x] **Step 6: Commit**

```bash
git add electron/main/index.ts src/services/rendererBridge.ts
git commit -m "feat: migrate chapters to scenes on load and init default scene on create"
```

---

## Task 3: sceneStructure 纯函数模块 + 自检（tasks 2.1 / 2.2 / 2.3 / 2.4）

**Files:**
- Create: `src/features/novel-creation/sceneStructure.ts`
- Create: `src/features/novel-creation/sceneStructure.test.ts`（或对齐项目现有自检文件命名，先 Grep 现有 `*.test.ts` 风格）

**Interfaces:**
- Consumes: Task 1 的 `Scene`/`Chapter`。
- Produces（后续 Task 4-8 依赖的唯一入口）：
  ```ts
  export function orderedScenes(chapter: Chapter): Scene[];
  export function chapterText(chapter: Chapter): string;
  export function createScene(existing: Scene[]): Scene;              // order = 末尾+1，title=''
  export function renameScene(scenes: Scene[], sceneId: string, title: string): Scene[];
  export function reorderScenes(scenes: Scene[], sceneId: string, direction: 'up' | 'down'): Scene[]; // 或按目标 index
  export function removeScene(scenes: Scene[], sceneId: string): Scene[]; // 删到最后一个抛错/返回原数组
  export function canRemoveScene(scenes: Scene[]): boolean;           // scenes.length > 1
  export function adjacentSceneId(scenes: Scene[], removingId: string): string | undefined; // 优先后一个，无则前一个
  export function initialScenes(): Scene[];                          // 返回恰好一个空默认场景
  ```

- [x] **Step 1: 先确认项目自检风格**

Run: `git grep -l "describe\|it(" src --include=*.test.ts`
Expected: 找到现有测试文件，确认使用的断言/测试框架（对齐其风格，不引入新框架）。

- [x] **Step 2: 写自检（按现有模块内 `assertXxxSelfCheck()` 风格）**

覆盖：
```ts
// orderedScenes：稳定排序，同 order 保持原数组位置，不改入参
// chapterText：多场景 '\n\n' 拼接；trim 后为空的场景被过滤；非空正文首尾空白不被 trim；空章 => ''
// createScene：order 递增、title 为 ''
// removeScene / canRemoveScene：删到最后一个被拒（canRemoveScene 为 false）
// adjacentSceneId：删中间选后一个，删末尾选前一个
// reorderScenes：上/下移后 order 归一、位置正确
// initialScenes：返回长度 1 的空默认场景
```
每条断言写出具体输入与期望值（例如 `chapterText({scenes:[{content:'  A  '},{content:'   '},{content:'B'}]}) === '  A  \n\nB'`，验证非空场景 `'  A  '` 首尾空白被保留、空白场景 `'   '` 被过滤）。

- [x] **Step 3: direct 模式不要求预先运行失败自检**

Run: `npm.cmd test`（或项目自检命令；先 Grep `package.json` 的 scripts 确认）
Expected: FAIL（模块未实现）。

- [x] **Step 4: 实现 `sceneStructure.ts`**

按 Interfaces 与 D1/D2/D3 实现：
```ts
export function orderedScenes(chapter: Chapter): Scene[] {
  return chapter.scenes
    .map((scene, index) => ({ scene, index }))
    .sort((a, b) => a.scene.order - b.scene.order || a.index - b.index)
    .map(entry => entry.scene);
}

export function chapterText(chapter: Chapter): string {
  return orderedScenes(chapter)
    .map(scene => scene.content)
    .filter(content => content.trim())
    .join('\n\n');
}
```
其余 CRUD 复用同一 order 归一逻辑（`reorderScenes`/`createScene`/`removeScene` 共用一个 `normalizeOrder(scenes: Scene[]): Scene[]`），`removeScene` 在 `scenes.length <= 1` 时拒绝。所有函数返回新数组，不原地改入参。

- [x] **Step 5: 运行自检确认通过**

Run: `npm.cmd test`
Expected: PASS（全部自检绿）。

- [x] **Step 6: Commit**

```bash
git add src/features/novel-creation/sceneStructure.ts src/features/novel-creation/sceneStructure.test.ts
git commit -m "feat: add sceneStructure pure functions with self-tests"
```

---

## Task 4: 分场景编辑器与场景管理 UI（tasks 3.1 / 3.2）

**Files:**
- Modify: `src/features/novel-creation/ChapterWorkbench.tsx`（大 tsx，Grep 锚点 + tsc 验证，ASCII-only 行，禁止多行 sed 硬插）
- Modify: `src/features/novel-creation/NovelCreation.tsx`（`addChapter` 初始化默认场景）

**Interfaces:**
- Consumes: Task 3 的 `orderedScenes`/`createScene`/`renameScene`/`reorderScenes`/`removeScene`/`canRemoveScene`/`adjacentSceneId`；Task 1 的 `Scene`。
- Produces: `activeSceneId` 会话态（D9）；场景切换切换编辑目标，供 Task 5/6 的撤销栈/版本/AI 挂载。

- [x] **Step 1: 锚定 ChapterWorkbench 现有章节状态**

Run: `git grep -n "activeChapterId\|activeChapter\b\|\.content" src/features/novel-creation/ChapterWorkbench.tsx`
Expected: 定位 `activeChapterId` 会话态、`activeChapter` 派生、textarea 绑定 `activeChapter.content` 的锚点。

- [x] **Step 2: 新增 `activeSceneId` 会话态与 `activeScene` 派生**

新增 `const [activeSceneId, setActiveSceneId] = useState<string | undefined>()`（D9 不落库）。派生 `activeScene = activeChapter ? orderedScenes(activeChapter).find(s => s.id === activeSceneId) : undefined`。切章 effect（现有 `[activeChapterId]`）中把 `activeSceneId` 默认设为 `orderedScenes(activeChapter)[0]?.id`（默认激活首场景）。

- [x] **Step 3: 编辑目标改绑 activeScene**

textarea 的 value 与 onChange 从 `activeChapter.content` 改为 `activeScene.content`；写回时通过 `renameScene`/更新 scene content 的方式回写到 `chapter.scenes` 对应场景，再走既有 `saveNovel`/状态更新链。写回**不 trim**正文（D1）。

- [x] **Step 4: 加场景列表、场景大纲与 CRUD 控件**

在编辑区加章内场景列表：每项显示派生名（title 为空时显示 `场景 ${index+1}`）、点击切换 `activeSceneId`；新建（`createScene`）、重命名（`renameScene`）、上移/下移（`reorderScenes`）、删除（`removeScene`）。删除按钮在 `canRemoveScene(activeChapter.scenes) === false` 时 `disabled`。每个控件加明确 `aria-label`（如 `aria-label="新建场景"`、`aria-label="删除场景 2"`）。删除当前场景时用 `adjacentSceneId` 选相邻场景作为新 `activeSceneId`。

- [x] **Step 5: `NovelCreation.tsx` 的 `addChapter` 初始化默认场景**

Run: `git grep -n "addChapter" src/features/novel-creation/NovelCreation.tsx`
Expected: 定位 `addChapter`（约 319 行）。将新章构造改为 `scenes: initialScenes()`（一个空默认场景，D3），移除任何对 `content` 的初始化。

- [x] **Step 6: 编译验证**

Run: `npm.cmd run build`
Expected: ChapterWorkbench / NovelCreation 编辑相关红点消除；exit 0（或仅剩 Task 5/6/7 待迁移点）。

- [x] **Step 7: Commit**

```bash
git add src/features/novel-creation/ChapterWorkbench.tsx src/features/novel-creation/NovelCreation.tsx
git commit -m "feat: per-scene editing with scene management UI"
```

---

## Task 5: 撤销栈按 sceneId 隔离 + 查找替换落场景（tasks 3.3 / 3.4）

**Files:**
- Modify: `src/features/novel-creation/ChapterWorkbench.tsx`
- Modify: `src/features/novel-creation/novelEditorTools.tsx`（仅在需要调整 `EditorHistory` 调用签名/锚点时）

**Interfaces:**
- Consumes: Task 4 的 `activeSceneId`/`activeScene`；`novelEditorTools.tsx` 的 `resetEditorHistory`/`pushEditorHistory`/`undoEditorHistory`/`redoEditorHistory`。
- Produces: 撤销栈与查找替换均以 activeScene 为作用域，供 Task 6 AI 续写复用同一场景写回目标。

- [x] **Step 1: 锚定现有撤销栈 reset effect**

Run: `git grep -n "resetEditorHistory\|historyRef\|activeChapterId\]" src/features/novel-creation/ChapterWorkbench.tsx`
Expected: 定位靠 `[activeChapterId]` 触发、读 `activeChapter.content` 的 `resetEditorHistory` effect（D4）。

- [x] **Step 2: reset effect 改锚 `activeSceneId`**

把该 effect 依赖从 `[activeChapterId]` 改为 `[activeSceneId]`，重置时读 `activeScene.content`（D4）。切换场景即清栈；不做 `Map<sceneId, EditorHistory>` 缓存、不恢复旧栈。

- [x] **Step 3: 删除当前场景联动清栈**

Task 4 的删除场景逻辑中，删当前场景后经 `adjacentSceneId` 切到相邻场景，`activeSceneId` 变化自然触发 Step 2 的 reset（清除原场景历史）。确认删除路径最终改写 `activeSceneId`，无遗留指向已删场景。

- [x] **Step 4: 查找/替换目标改 activeScene**

Run: `git grep -n "replace\|find\|search" src/features/novel-creation/ChapterWorkbench.tsx`
Expected: 定位章内查找/替换逻辑。将作用目标从 `activeChapter.content` 改为 `activeScene.content`；替换写回到该场景，并 `pushEditorHistory` 进当前场景（activeScene）历史栈（替换原子可撤销，与现状一致）。

- [x] **Step 5: 编译验证**

Run: `npm.cmd run build`
Expected: exit 0（或仅剩 Task 6/7 待迁移点）。

- [x] **Step 6: Commit**

```bash
git add src/features/novel-creation/ChapterWorkbench.tsx src/features/novel-creation/novelEditorTools.tsx
git commit -m "feat: isolate undo history and find/replace by scene"
```

---

## Task 6: 版本历史与 AI 续写下沉 scene 粒度（tasks 4.1 / 4.2）

**Files:**
- Modify: `src/features/novel-creation/ChapterWorkbench.tsx`

**Interfaces:**
- Consumes: Task 4 的 `activeScene`；Task 1 的 `Scene.versions`/`Scene.selectedVersionId`；`MAX_CHAPTER_VERSIONS`。
- Produces: 版本快照与 AI 写回目标均为 activeScene，闭合场景粒度写作闭环。

- [x] **Step 1: 锚定现有版本历史逻辑**

Run: `git grep -n "writeVersionToChapter\|restoreVersion\|selectedVersionId\|MAX_CHAPTER_VERSIONS" src/features/novel-creation/ChapterWorkbench.tsx`
Expected: 定位版本写回/预览/`selectedVersionId` 读写点。

- [x] **Step 2: 版本历史下沉 scene**

`writeVersionToChapter`→`writeVersionToScene`：快照写入 `activeScene.versions`（上限 `MAX_CHAPTER_VERSIONS`）；`selectedVersionId` 读写改到 `activeScene.selectedVersionId`；版本预览/写回（`restoreVersion`）目标为 activeScene 的 content。写回后走 Step 4/Task 5 的历史 reset 语义。

- [x] **Step 3: 锚定 AI 流式续写写回点**

Run: `git grep -n "runRef\|requestIdRef\|streamTextRef" src/features/novel-creation/ChapterWorkbench.tsx`
Expected: 定位三件套防串线机制与逐字写回目标。

- [x] **Step 4: AI 写回目标改 activeScene**

`runRef`/`requestIdRef`/`streamTextRef` 三件套逻辑**不动**（D5），只把逐字写回目标从 `activeChapter.content` 改为 `activeScene.content`。AI 前驱上下文按 `orderedChapters × orderedScenes` 顺序衔接（通过 `chapterText`）。AI 写回**不进撤销栈**的现有语义保持。

- [x] **Step 5: 编译验证**

Run: `npm.cmd run build`
Expected: ChapterWorkbench 全部红点消除；exit 0（或仅剩 Task 7 消费者红点）。

- [x] **Step 6: Commit**

```bash
git add src/features/novel-creation/ChapterWorkbench.tsx
git commit -m "feat: sink version history and AI continuation to scene granularity"
```

---

## Task 7: 正文消费者编译期迁移（tasks 5.1 / 5.2 / 5.3）

**Files:**
- Modify: `src/features/novel-creation/novelExport.ts`
- Modify: `src/features/novel-creation/novelProgress.ts`
- Modify: `src/features/novel-creation/NovelStats.tsx`
- Modify: `src/features/novel-creation/novelPrompts.ts`
- Modify: `src/features/novel-creation/characterGraph.ts`
- Modify: `src/features/novel-creation/emotionArc.ts`
- Modify: `src/features/novel-creation/EmotionArcPanel.tsx`
- Modify: `src/features/novel-creation/novelNavigation.tsx`（搜索的正文部分；场景内定位在 Task 8）
- Modify: `src/features/novel-creation/novelStructure.ts`（change 1 自检夹具：`assertNovelStructureSelfCheck` 的 `base()` helper `version: 7`→`8`，并为其构造的 chapter 夹具补 `scenes` 字段。Task 1 事实偏差归入此处——`version: 7` 实为 8 处，第 8 处在此文件、越出 Task 1 允许范围）

**Interfaces:**
- Consumes: Task 3 的 `chapterText(chapter)` / `orderedScenes(chapter)`。
- Produces: 全部消费者读聚合结果，`chapter.content` 直接引用清零；全仓 `version: 7` 字面量清零。

- [x] **Step 1: 生成待迁移红点清单**

Run: `npm.cmd run build`
Expected: renderer tsc 报出所有 `chapter.content` / `chapter.versions` / `chapter.selectedVersionId` 残留引用（D7 编译期清单）。记录逐文件红点。

- [x] **Step 2: 导出与字数/进度改读 `chapterText`**

`novelExport.ts`、`novelProgress.ts`、`NovelStats.tsx` 中所有 `chapter.content` 改为 `chapterText(chapter)`；`NovelSummary.wordCount`/`filledChapterCount` 按场景聚合重算（`filledChapterCount` = `chapterText(chapter).trim()` 非空的章数，`wordCount` 对 `chapterText` 聚合，D7）。

- [x] **Step 3: Prompt 前文上下文改读 `chapterText`**

`novelPrompts.ts` 中前文/上下文拼接从 `chapter.content` 改为 `chapterText(chapter)`（D1，保证 AI 上下文与成品正文一致）。

- [x] **Step 4: 分析输入改按 `orderedScenes` 聚合**

`characterGraph.ts`、`emotionArc.ts`、`EmotionArcPanel.tsx` 的分析输入改读 `chapterText(chapter)`。**锚点红线（D8）**：伏笔 `plantedChapterId`/`payoffChapterId`、`EmotionPoint.chapterId`、图谱锚点保持 `chapterId` 不变，本 change 不新增持久化 sceneId 引用。仅迁移正文读取，不动锚点字段。

- [x] **Step 5: 全仓扫描残留引用**

Run: `git grep -n "\.content" src/features/novel-creation | git grep -v "scene"`（人工核对是否还有 `chapter.content` 语义残留）
Run: `git grep -n "chapter\.content\|\.versions\b\|\.selectedVersionId" src`
Expected: 除 Scene 自身的 `.content`/`.versions`/`.selectedVersionId` 外，无 `chapter.content` 直接引用。

- [x] **Step 6: 编译确认清零**

Run: `npm.cmd run build`
Expected: exit 0，`chapter.content` 相关红点全部消除（Task 8 的搜索定位另计）。

- [x] **Step 7: Commit**

```bash
git add src/features/novel-creation/novelExport.ts src/features/novel-creation/novelProgress.ts src/features/novel-creation/NovelStats.tsx src/features/novel-creation/novelPrompts.ts src/features/novel-creation/characterGraph.ts src/features/novel-creation/emotionArc.ts src/features/novel-creation/EmotionArcPanel.tsx src/features/novel-creation/novelNavigation.tsx
git commit -m "feat: migrate body consumers to chapterText aggregate"
```

---

## Task 8: 搜索纳入场景与场景内定位（tasks 6.1 / 6.2）

**Files:**
- Modify: `src/features/novel-creation/novelNavigation.tsx`（搜索扫描与结果结构）
- Modify: `src/features/novel-creation/ChapterWorkbench.tsx`（命中定位到场景 textarea）

**Interfaces:**
- Consumes: Task 3 的 `orderedScenes`；Task 4 的 `activeSceneId`/`setActiveSceneId`。
- Produces: 搜索结果携带瞬时 `sceneId`（D8，不落库），编辑器据此激活章+场景并定位选中。

- [x] **Step 1: 锚定现有搜索扫描**

Run: `git grep -n "search\|title\|outline\|content" src/features/novel-creation/novelNavigation.tsx`
Expected: 定位当前跨章搜索的扫描范围（title/outline/content）与结果结构。

- [x] **Step 2: 搜索扫描纳入场景**

跨章搜索扫描范围纳入场景标题（派生名可选）/大纲/正文：遍历 `orderedScenes(chapter)`，正文命中的结果结构携带 `chapterId`、章号、场景号与瞬时 `sceneId`（**仅内存、不落库**，D8）。章级/大纲命中不带 sceneId。

- [x] **Step 3: 命中定位到场景 textarea**

在 `ChapterWorkbench.tsx` 的命中定位逻辑：正文命中先 `setActiveChapterId` + `setActiveSceneId(result.sceneId)`，再在该场景 textarea 选中并滚动到命中位置（复用现有 textarea 选中/滚动锚点）。章级/大纲命中仅切章并默认激活首场景。定位失效（场景已删/位置越界）**不报错**，静默降级。

- [x] **Step 4: 编译验证**

Run: `npm.cmd run build`
Expected: exit 0，全部红点消除。

- [x] **Step 5: Commit**

```bash
git add src/features/novel-creation/novelNavigation.tsx src/features/novel-creation/ChapterWorkbench.tsx
git commit -m "feat: include scenes in search and locate hits within scene"
```

---

## Task 9: 验证与交付（tasks 7.1 / 7.2 / 7.3 / 7.4）

**Files:** 无源码新增；仅验证与收口。

- [x] **Step 1: 全量构建**

Run: `npm.cmd run build`
Expected: renderer tsc + Vite 与 Electron tsc 全部 exit 0，无 `chapter.content` 残留报红。

- [x] **Step 2: 自检全绿**

Run: `npm.cmd test`（或项目自检命令）
Expected: `sceneStructure` 自检全部 PASS。

- [x] **Step 3: 文本完整性扫描**

Run: `python "C:\Users\x1176\.codex\skills\endless-creation-guardrails\scripts\scan_text_integrity.py" "F:\AIProject\Endless Creation\src"`
Expected: 输出 `TEXT INTEGRITY OK`。

- [x] **Step 4: 空白检查**

Run: `git diff --check`
Expected: 无空白错误输出。

- [x] **Step 5: GUI 真机验收（逐项）**

启动应用，逐条实测并记录结果：
- v7→v8 迁移：打开一本 v7 老小说（含空章、仅大纲无正文章），确认正文/版本/selectedVersionId 全量迁入默认场景，空章有一个空默认场景，正文一字未丢。
- 场景 CRUD：新建/重命名/上下移场景、删除场景；删到最后一个时删除按钮禁用。
- 分场景编辑与撤销栈隔离：在场景 A 编辑后切到场景 B，Ctrl+Z 不串到 A；删当前场景激活相邻场景且历史清空。
- AI 续写/版本 scene 粒度：AI 续写写入当前场景；版本快照/预览/写回按场景；AI 写回不入撤销栈。
- 字数/导出/Prompt/分析按场景聚合：导出成品无场景边界痕迹（`\n\n` 段落级），字数按 `chapterText` 统计，Prompt 前文一致，人物图谱/情感曲线分析读到聚合正文。
- 搜索场景内定位：正文命中切到对应章+场景并 textarea 选中滚动；章级/大纲命中切章默认首场景；定位失效不报错。
- 重启持久化：关闭重开，默认激活首章首场景（会话态不落库）。
- 分析锚点：伏笔/情感/图谱仍锚 chapterId，无新增持久化 sceneId。

- [x] **Step 6: 收口提交（仅本 change 源文件与 artifacts）**

先确认未跟踪的平台/工具目录（`.agent/`、`.agents/`、`.claude/`、`.codegraph/`、`.codex/`、`.comet/` 等）不入库；仅提交本 change 的源文件与 artifacts。若前序任务已逐 task commit，本步只补 artifacts 与 tasks.md 勾选。

```bash
git add openspec/changes/add-chapter-scene-structure src/features/novel-creation
git status   # 核对无平台/工具未跟踪目录被 add
git commit -m "feat: sink novel body model to scene (v7->v8)"
```

---

## Self-Review

- **Spec coverage**：tasks 1.1→Task1；1.2/1.3→Task2；2.1-2.4→Task3；3.1/3.2→Task4；3.3/3.4→Task5；4.1/4.2→Task6；5.1/5.2/5.3→Task7；6.1/6.2→Task8；7.1-7.4→Task9。Design D1-D9 落 Global Constraints 并在对应任务引用（D1/D2/D3→Task3；D4→Task5；D5→Task6；D6→Task6；D7→Task1/Task7；D8→Task7/Task8；D9→Task4）。四份副本、Electron/Web 对称、无新增 IPC/依赖、chapterId 锚点红线均在 Global Constraints 逐条覆盖。
- **Placeholder scan**：无 TBD/TODO；code steps 均给具体代码或具体 Grep 锚点命令与期望输出。
- **Type consistency**：`Scene`/`chapterText`/`orderedScenes`/`createScene`/`removeScene`/`canRemoveScene`/`adjacentSceneId`/`initialScenes`/`writeVersionToScene` 全程一致；`activeSceneId` 会话态贯穿 Task4-8。
