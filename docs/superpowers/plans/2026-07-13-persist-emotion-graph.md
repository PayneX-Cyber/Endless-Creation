---
change: persist-emotion-graph
design-doc: docs/superpowers/specs/2026-07-13-persist-emotion-graph-design.md
base-ref: ad1fee0763d89d3ee262cac431d1034e1bb19f8c
archived-with: 2026-07-14-persist-emotion-graph
---

# 情感曲线与人物图谱统一持久化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将情感曲线和人物图谱纳入 Novel v6，并安全地把 renderer localStorage 中的存量成果惰性迁移到小说文件。

**Architecture:** 主进程与 Web fallback 只负责 schema v6 消毒，缺失成果保持 `undefined`；renderer 在 `openNovel` 设置 React state 前调用独立迁移 helper，合并两个合法旧成果并最多保存一次，成功后才清理旧条目。正常 UI 读写直接使用 `Novel.emotionArc` / `Novel.characterGraph`，localStorage 键仅由迁移 helper 使用。

**Tech Stack:** Electron、React、TypeScript、Vite、浏览器 localStorage、现有 `novelService.saveNovel`。

## Global Constraints

- Novel schema version 必须从 5 升到 6，`src/types/novel.ts`、`electron/preload/bridgeTypes.ts`、`electron/main/index.ts`、`src/services/rendererBridge.ts` 四副本一致。
- `emotionArc` / `characterGraph` 必须为可选字段；缺失或非法值消毒为 `undefined`，不得补空成果对象。
- 迁移触发条件只能是字段严格等于 `undefined`；合法空成果不得被覆盖。
- 迁移必须先 `saveNovel` 成功，再删除当前 `novelId` 的旧条目；失败或坏数据必须保留旧条目。
- 旧存储键只能使用全名 `endless-creation.novel-emotion-arcs` 与 `endless-creation.novel-character-graphs`。
- 不新增依赖、IPC、导出格式或伏笔候选持久化；不得改动平台目录或 `skills-lock.json`。

archived-with: 2026-07-14-persist-emotion-graph
---

### Task 1: 提升分析成果类型并同步 Novel v6 四副本

**Files:**
- Modify: `src/types/novel.ts`
- Modify: `electron/preload/bridgeTypes.ts`
- Modify: `electron/main/index.ts`
- Modify: `src/services/rendererBridge.ts`
- Modify: `src/features/novel-creation/emotionArc.ts`
- Modify: `src/features/novel-creation/characterGraph.ts`
- Modify: `src/features/novel-creation/NovelCharacterGraph.tsx`

**Interfaces:**
- Produces: schema 类型 `EmotionPoint`, `EmotionArc`, `GraphCharacter`, `GraphRelationship`, `CharacterGraph`.
- Produces: `Novel.emotionArc?: EmotionArc`, `Novel.characterGraph?: CharacterGraph`, `Novel.version: 6`.
- Consumes: existing chapter/settings/foreshadowing/pinned fields unchanged.

- [x] **Step 1: 在权威 renderer 类型文件定义成果类型并升级版本**

在 `src/types/novel.ts` 的 `Novel` 前加入：

```ts
export interface EmotionPoint {
  chapterId: string;
  score: number;
  reason: string;
  updatedAt: string;
}

export interface EmotionArc {
  points: EmotionPoint[];
  updatedAt: string;
}

export interface GraphCharacter {
  name: string;
  role: string;
  description: string;
}

export interface GraphRelationship {
  from: string;
  to: string;
  label: string;
}

export interface CharacterGraph {
  characters: GraphCharacter[];
  relationships: GraphRelationship[];
}
```

在 `Novel` 中加入：

```ts
emotionArc?: EmotionArc;
characterGraph?: CharacterGraph;
version: 6;
```

并将 `NOVEL_SCHEMA_VERSION` 改为 `6`。

- [x] **Step 2: 同步 preload、main、rendererBridge 三份协议副本**

在另外三份 Novel 协议旁复制相同五个接口，在 `Novel` 中复制相同两个可选字段，并把字面量版本改为：

```ts
version: 6;
```

逐份确认字段名、必选属性、可选性与数组元素类型完全一致，不以 `unknown` 或宽泛对象替代。

- [x] **Step 3: 删除功能模块的重复类型权威源**

`emotionArc.ts` 改为从 schema 导入并按兼容需要 re-export：

```ts
import type { Chapter, EmotionArc, EmotionPoint, Novel } from '../../types/novel';
export type { EmotionArc, EmotionPoint } from '../../types/novel';
```

`characterGraph.ts` 同理：

```ts
import type {
  CharacterGraph,
  GraphCharacter,
  GraphRelationship,
  Novel,
} from '../../types/novel';
export type {
  CharacterGraph,
  GraphCharacter,
  GraphRelationship,
} from '../../types/novel';
```

`NovelCharacterGraph.tsx` 的类型导入改为：

```ts
import type { CharacterGraph } from '../../types/novel';
```

- [x] **Step 4: 运行双端类型构建确认四副本一致**

Run:

```powershell
npm.cmd run build
```

Expected: renderer Vite 与 Electron TypeScript 均成功，exit code 0；不得出现 `version: 5` 或重复类型不兼容错误。

- [x] **Step 5: 提交 schema 原子变更**

```powershell
git add src/types/novel.ts electron/preload/bridgeTypes.ts electron/main/index.ts src/services/rendererBridge.ts src/features/novel-creation/emotionArc.ts src/features/novel-creation/characterGraph.ts src/features/novel-creation/NovelCharacterGraph.tsx
git commit -m "feat: add novel analysis fields to schema v6"
```

### Task 2: 实现主进程/Web fallback 消毒与 renderer 安全迁移

**Files:**
- Modify: `electron/main/index.ts`
- Modify: `src/services/rendererBridge.ts`
- Create: `src/features/novel-creation/novelAnalysisPersistence.ts`
- Modify: `src/features/novel-creation/NovelCreation.tsx`

**Interfaces:**
- Consumes: Task 1 的 `EmotionArc`, `CharacterGraph`, `Novel`.
- Produces: `migrateLegacyNovelAnalysis(novel, storage, saveNovel): Promise<Novel>`.
- Produces: pure validators `isEmotionArc(value): value is EmotionArc`, `isCharacterGraph(value): value is CharacterGraph`.
- Save callback signature: `(novel: Novel) => Promise<{ ok: boolean; novel?: Novel }>`.

- [x] **Step 1: 在主进程实现严格、保守的字段消毒**

在 `electron/main/index.ts` 的 `sanitizeNovel` 附近加入有限数值、字符串和成果校验器。核心结构必须等价于：

```ts
function sanitizeEmotionArc(value: unknown): EmotionArc | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as Partial<EmotionArc>;
  if (typeof candidate.updatedAt !== 'string' || !Array.isArray(candidate.points)) return undefined;
  const points = candidate.points.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const point = item as Partial<EmotionPoint>;
    return typeof point.chapterId === 'string'
      && typeof point.score === 'number'
      && Number.isFinite(point.score)
      && point.score >= -100
      && point.score <= 100
      && typeof point.reason === 'string'
      && typeof point.updatedAt === 'string'
      ? [point as EmotionPoint]
      : [];
  });
  if (points.length !== candidate.points.length) return undefined;
  return { points, updatedAt: candidate.updatedAt };
}

function sanitizeCharacterGraph(value: unknown): CharacterGraph | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as Partial<CharacterGraph>;
  if (!Array.isArray(candidate.characters) || !Array.isArray(candidate.relationships)) return undefined;
  const characters = candidate.characters.filter((item): item is GraphCharacter =>
    Boolean(item)
    && typeof item === 'object'
    && typeof (item as GraphCharacter).name === 'string'
    && typeof (item as GraphCharacter).role === 'string'
    && typeof (item as GraphCharacter).description === 'string');
  const relationships = candidate.relationships.filter((item): item is GraphRelationship =>
    Boolean(item)
    && typeof item === 'object'
    && typeof (item as GraphRelationship).from === 'string'
    && typeof (item as GraphRelationship).to === 'string'
    && typeof (item as GraphRelationship).label === 'string');
  if (characters.length !== candidate.characters.length || relationships.length !== candidate.relationships.length) return undefined;
  return { characters, relationships };
}
```

`sanitizeNovel` 返回对象中加入：

```ts
emotionArc: sanitizeEmotionArc(source.emotionArc),
characterGraph: sanitizeCharacterGraph(source.characterGraph),
version: 6,
```

不得写成 `sanitizeEmotionArc(...) ?? { points: [], updatedAt: ... }`。

- [x] **Step 2: 对 Web fallback sanitizer 使用同一字段语义**

在 `src/services/rendererBridge.ts` 的 fallback Novel 消毒/规范化路径加入同等校验，并确保返回值是：

```ts
emotionArc: sanitizeEmotionArc(source.emotionArc),
characterGraph: sanitizeCharacterGraph(source.characterGraph),
version: 6,
```

Electron 和 Web fallback 对非法点、非法图谱及缺失字段的处理必须一致。

- [x] **Step 3: 创建纯计划 + 副作用分层的迁移 helper**

创建 `src/features/novel-creation/novelAnalysisPersistence.ts`。导出全名存储键、校验器与迁移入口：

```ts
import type { CharacterGraph, EmotionArc, Novel } from '../../types/novel';

export const EMOTION_ARC_STORAGE_KEY = 'endless-creation.novel-emotion-arcs';
export const CHARACTER_GRAPH_STORAGE_KEY = 'endless-creation.novel-character-graphs';

type LegacyTable = Record<string, unknown>;
type SaveNovel = (novel: Novel) => Promise<{ ok: boolean; novel?: Novel }>;

export function isEmotionArc(value: unknown): value is EmotionArc {
  if (!value || typeof value !== 'object') return false;
  const arc = value as EmotionArc;
  return typeof arc.updatedAt === 'string'
    && Array.isArray(arc.points)
    && arc.points.every((point) =>
      typeof point?.chapterId === 'string'
      && typeof point.score === 'number'
      && Number.isFinite(point.score)
      && point.score >= -100
      && point.score <= 100
      && typeof point.reason === 'string'
      && typeof point.updatedAt === 'string');
}

export function isCharacterGraph(value: unknown): value is CharacterGraph {
  if (!value || typeof value !== 'object') return false;
  const graph = value as CharacterGraph;
  return Array.isArray(graph.characters)
    && graph.characters.every((item) =>
      typeof item?.name === 'string'
      && typeof item.role === 'string'
      && typeof item.description === 'string')
    && Array.isArray(graph.relationships)
    && graph.relationships.every((item) =>
      typeof item?.from === 'string'
      && typeof item.to === 'string'
      && typeof item.label === 'string');
}
```

解析必须区分“整表损坏”“无当前条目”“当前条目非法”“当前条目合法”：

```ts
function readTable(storage: Storage, key: string): { table: LegacyTable; readable: boolean } {
  const raw = storage.getItem(key);
  if (raw === null) return { table: {}, readable: true };
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? { table: parsed as LegacyTable, readable: true }
      : { table: {}, readable: false };
  } catch {
    return { table: {}, readable: false };
  }
}

function removeEntry(storage: Storage, key: string, table: LegacyTable, novelId: string): void {
  const next = { ...table };
  delete next[novelId];
  try {
    if (Object.keys(next).length) storage.setItem(key, JSON.stringify(next));
    else storage.removeItem(key);
  } catch {
    // Novel 已落盘；清理失败只留下可在下次加载重试的残留。
  }
}
```

迁移入口必须先构造单个 `nextNovel`，最多保存一次，再清理：

```ts
export async function migrateLegacyNovelAnalysis(
  novel: Novel,
  storage: Storage,
  saveNovel: SaveNovel,
): Promise<Novel> {
  const emotionTable = readTable(storage, EMOTION_ARC_STORAGE_KEY);
  const graphTable = readTable(storage, CHARACTER_GRAPH_STORAGE_KEY);
  const emotionValue = emotionTable.table[novel.id];
  const graphValue = graphTable.table[novel.id];
  const validEmotion = emotionTable.readable && isEmotionArc(emotionValue);
  const validGraph = graphTable.readable && isCharacterGraph(graphValue);

  let nextNovel = novel;
  let migratedEmotion = false;
  let migratedGraph = false;

  if (novel.emotionArc === undefined && validEmotion) {
    nextNovel = { ...nextNovel, emotionArc: emotionValue, updatedAt: new Date().toISOString() };
    migratedEmotion = true;
  }
  if (novel.characterGraph === undefined && validGraph) {
    nextNovel = { ...nextNovel, characterGraph: graphValue, updatedAt: new Date().toISOString() };
    migratedGraph = true;
  }

  if (migratedEmotion || migratedGraph) {
    try {
      const saved = await saveNovel(nextNovel);
      if (!saved.ok) return novel;
      if (migratedEmotion) removeEntry(storage, EMOTION_ARC_STORAGE_KEY, emotionTable.table, novel.id);
      if (migratedGraph) removeEntry(storage, CHARACTER_GRAPH_STORAGE_KEY, graphTable.table, novel.id);
      return saved.novel ? { ...nextNovel, updatedAt: saved.novel.updatedAt } : nextNovel;
    } catch {
      return novel;
    }
  }

  if (novel.emotionArc !== undefined && validEmotion) {
    removeEntry(storage, EMOTION_ARC_STORAGE_KEY, emotionTable.table, novel.id);
  }
  if (novel.characterGraph !== undefined && validGraph) {
    removeEntry(storage, CHARACTER_GRAPH_STORAGE_KEY, graphTable.table, novel.id);
  }
  return novel;
}
```

注意：`undefined` 条目不是有效旧成果；坏整表或坏当前条目不得被 `removeEntry`。

- [x] **Step 4: 在 openNovel 的 state 写入前 await 惰性迁移**

在 `NovelCreation.tsx` 导入 helper：

```ts
import { migrateLegacyNovelAnalysis } from './novelAnalysisPersistence';
```

将成功加载分支改为：

```ts
const novel = await migrateLegacyNovelAnalysis(
  result.novel,
  window.localStorage,
  (nextNovel) => novelService.saveNovel(nextNovel),
);
setCurrentNovel(novel);
setActiveChapterId(novel.chapters[0]?.id ?? null);
setSaveStatus('saved');
setFeedback('');
return true;
```

迁移 helper 必须吞掉 localStorage/save 异常并返回原 Novel，因此打不开 localStorage 或保存失败不应让 `openNovel` 返回 false。

- [x] **Step 5: 添加可直接运行的迁移自检**

在 helper 中导出 pure validator；使用临时 TypeScript/Node 自检脚本或项目已有运行方式验证以下断言，脚本不作为产品文件提交：

```ts
// 双字段有效 + 均 undefined => saveCalls === 1，返回值含两字段，两旧表仅删当前 id
// Novel 已有合法空成果 => saveCalls === 0，不覆盖，合法残留被清理
// save 返回 { ok: false } => 返回原 Novel，两旧条目保留
// JSON 损坏或条目结构非法 => saveCalls === 0，不写字段、不删条目
// Novel 已有字段 + 合法残留 => saveCalls === 0，只删当前 novelId
```

Expected: 所有断言通过，无未捕获异常。

- [x] **Step 6: 提交安全迁移链**

```powershell
git add electron/main/index.ts src/services/rendererBridge.ts src/features/novel-creation/novelAnalysisPersistence.ts src/features/novel-creation/NovelCreation.tsx
git commit -m "feat: migrate legacy novel analysis safely"
```

### Task 3: 将情感曲线和人物图谱正常读写切到 Novel

**Files:**
- Modify: `src/features/novel-creation/emotionArc.ts`
- Modify: `src/features/novel-creation/EmotionArcPanel.tsx`
- Modify: `src/features/novel-creation/NovelCreation.tsx`

**Interfaces:**
- Consumes: `Novel.emotionArc`, `Novel.characterGraph`, existing `updateNovel`.
- Produces: `mergeEmotionPoints(novel, points): EmotionArc`（纯函数；沿用现有合并语义）。
- Produces: Emotion panel prop `onUpdateNovel: (update: (novel: Novel) => Novel) => void`.

- [x] **Step 1: 把 emotionArc.ts 收敛为纯计算模块**

删除存储键、`readEmotionArc` 和任何 `localStorage.getItem/setItem`。把现有 upsert 的合并算法保留为纯函数：

```ts
export function mergeEmotionPoints(
  novel: Novel,
  points: EmotionPoint[],
): EmotionArc {
  const byChapter = new Map((novel.emotionArc?.points ?? []).map((point) => [point.chapterId, point]));
  for (const point of points) byChapter.set(point.chapterId, point);
  const chapterOrder = new Map(novel.chapters.map((chapter) => [chapter.id, chapter.order]));
  const now = new Date().toISOString();
  return {
    points: [...byChapter.values()]
      .filter((point) => chapterOrder.has(point.chapterId))
      .sort((a, b) => (chapterOrder.get(a.chapterId) ?? 0) - (chapterOrder.get(b.chapterId) ?? 0)),
    updatedAt: now,
  };
}
```

若现有 `upsertEmotionPoints` 还包含业务上必需的规范化逻辑，应迁入该纯函数，不保留任何 IO 或 `{ ok, message }` 保存返回模型。

- [x] **Step 2: EmotionArcPanel 直接派生 Novel 字段并通过父级更新**

Props 增加：

```ts
onUpdateNovel: (update: (novel: Novel) => Novel) => void;
```

移除本地 `arc` authority、`readEmotionArc` 导入及切书时的 storage 读取。使用：

```ts
const arc = novel.emotionArc ?? null;
```

确认候选时执行一次 Novel 更新：

```ts
function confirm() {
  if (!results || !selectedIds.size) return;
  const points = results.flatMap((result) =>
    result.candidate && selectedIds.has(result.chapter.id) ? [result.candidate] : []);
  onUpdateNovel((current) => ({
    ...current,
    emotionArc: mergeEmotionPoints(current, points),
    updatedAt: new Date().toISOString(),
  }));
  setResults(null);
  setSelectedIds(new Set());
  setError('');
}
```

在 `NovelCreation.tsx` 渲染面板时传入现有更新函数：

```tsx
<EmotionArcPanel
  novel={currentNovel}
  resolveModel={ensureTextModelReady}
  onUpdateNovel={updateNovel}
/>
```

- [x] **Step 3: 删除图谱镜像 state 与 localStorage 正常读写**

在 `NovelCreation.tsx`：

- 删除 `CHARACTER_GRAPH_STORAGE_KEY`。
- 删除 `graphData` state。
- 删除按 `currentNovel?.id` 调用 `readCharacterGraph` 的 effect。
- 删除文件尾部 `readCharacterGraph` / `saveCharacterGraph`。
- 保留应用级 `readLocalStorage`，因为模型偏好和 API 配置仍使用它。

在组件内以 Novel 字段为唯一读源：

```ts
const graphData = currentNovel?.characterGraph ?? null;
```

AI 图谱解析成功（包括合法空图谱）后用一条更新写回：

```ts
updateNovel((novel) => ({
  ...novel,
  characterGraph: parsed.graph,
  updatedAt: new Date().toISOString(),
}));
```

不得再调用 `setGraphData` 或 `saveCharacterGraph`。失败路径继续只设置 `graphError`，不得覆盖已有字段。

- [x] **Step 4: 扫描并证明旧键只剩迁移 helper 使用**

Run:

```powershell
Get-ChildItem src -Recurse -File | Select-String -Pattern 'endless-creation\.novel-emotion-arcs|endless-creation\.novel-character-graphs'
Get-ChildItem src -Recurse -File | Select-String -Pattern 'readEmotionArc|saveCharacterGraph|readCharacterGraph'
```

Expected:

- 两个全名 key 仅出现在 `novelAnalysisPersistence.ts`。
- 三个旧 IO 函数零命中。
- 模型偏好/API provider 的 `readLocalStorage` 仍保留。

- [x] **Step 5: 构建并提交读写源切换**

Run:

```powershell
npm.cmd run build
```

Expected: exit code 0。

Then:

```powershell
git add src/features/novel-creation/emotionArc.ts src/features/novel-creation/EmotionArcPanel.tsx src/features/novel-creation/NovelCreation.tsx
git commit -m "feat: use novel fields for analysis results"
```

### Task 4: 完整验证并更新 OpenSpec task 状态

**Files:**
- Modify: `openspec/changes/persist-emotion-graph/tasks.md`
- Verify only: all changed source files

**Interfaces:**
- Consumes: Tasks 1–3 的完整实现。
- Produces: build 阶段可交给 Comet full verify 的新鲜证据。

- [x] **Step 1: 运行项目双端构建**

```powershell
npm.cmd run build
```

Expected: Electron tsc 与 renderer Vite 全绿，exit code 0。

- [x] **Step 2: 运行权威文本完整性扫描**

```powershell
python "C:\Users\x1176\.codex\skills\endless-creation-guardrails\scripts\scan_text_integrity.py" "F:\AIProject\Endless Creation\src"
```

Expected: `TEXT INTEGRITY OK`，无 U+FFFD 或乱码报告。

- [x] **Step 3: 校验 diff 与 OpenSpec**

```powershell
git diff --check
npx.cmd openspec validate persist-emotion-graph --strict
```

Expected: 两条命令 exit code 0。

- [x] **Step 4: 重跑迁移运行时自检**

至少覆盖：

```text
双字段同时迁移只 save 一次
合法空 EmotionArc/CharacterGraph 不被覆盖
saveNovel 失败时旧条目保留
坏表/坏条目不写不删且不抛错
字段已有时只清理合法崩溃残留
删除当前 novelId 后同表其他小说仍存在
```

Expected: 全部 PASS。

- [x] **Step 5: 核对导出协议无需改代码**

确认 `src/features/novel-creation/novelExport.ts` 仍直接 `JSON.stringify(novel)`；用含两字段的 Novel 生成离线包，检查 `novel.json` 含 `emotionArc` 与 `characterGraph`。

- [x] **Step 6: 勾选 tasks.md 并提交验证产物状态**

仅在对应实现和命令已有证据后，将 `openspec/changes/persist-emotion-graph/tasks.md` 的 20 项全部改为 `[x]`。

```powershell
git add openspec/changes/persist-emotion-graph/tasks.md
git commit -m "chore: complete persist emotion graph tasks"
```

- [x] **Step 7: 保留 GUI/PO full verify 清单**

进入 verify 阶段后真机核验：

1. 新分析/推演写 Novel 字段且不新写 localStorage。
2. 字段 `undefined` 的旧小说首次打开即显示迁入成果。
3. 保存成功后只删除当前 novelId 条目；人为制造保存失败时旧条目保留。
4. 合法空成果不被旧数据覆盖。
5. 字段已有且旧条目合法时清理崩溃残留；坏条目不删。
6. 重开仍保留成果，导出 `novel.json` 含两字段。
7. v4/v5 小说升为 v6，章节、设定、伏笔、钉选数据不丢。

