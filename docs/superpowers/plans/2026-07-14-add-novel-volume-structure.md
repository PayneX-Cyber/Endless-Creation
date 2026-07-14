---
change: add-novel-volume-structure
design-doc: docs/superpowers/specs/2026-07-14-add-novel-volume-structure-design.md
base-ref: 6dc6c496a824fcacf9071cc2eaa54b296afb6cd9
---

# 小说卷（Volume）层级结构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在保持章节扁平存储的前提下，为小说引入卷（Volume）元数据，把 schema 从 v6 升到 v7，并让全书章节顺序、导航、搜索、导出、Prompt、统计、分析统一走一个卷序展开入口。

**Architecture:** 新增 `Volume[]` 与 `Chapter.volumeId?` 两个数据字段；`Chapter.order` 语义降级为“组内顺序键”。所有全书顺序语义由新纯函数模块 `novelStructure.ts` 的 `orderedChapters(novel)` / `groupChaptersByVolume(novel)` 唯一定义，卷/章结构变更也全部由该模块的纯函数生成新 `Novel`，再走现有 `updateNovel` → 600ms 自动保存 → `saveNovel(novel)` 链持久化。卷管理 UI 集中在“章节大纲”页的独立组件 `VolumeOutline.tsx`，工作台侧栏与“章节内容”页只做只读卷分组展示。

**Tech Stack:** Electron、React 19、TypeScript、Vite、HTML5 原生拖拽（`draggable`/`onDragStart`/`onDragOver`/`onDrop`）、现有 `novelService.saveNovel`、浏览器 localStorage（仅 Web fallback）。

## Global Constraints

- Novel schema version 必须从 `6` 升到 `7`，四份协议副本一致：`src/types/novel.ts`、`electron/preload/bridgeTypes.ts`、`electron/main/index.ts`、`src/services/rendererBridge.ts`。
- 硬边界不变：`chapterId`、`chapter.content`、伏笔 `plantedChapterId`/`payoffChapterId` 引用、情感曲线 `EmotionPoint.chapterId`、人物图谱等所有基于 `chapterId` 的业务锚点均保持原样，不做任何 id/正文转换。
- 不新增 IPC、不新增第三方依赖（拖拽用 HTML5 原生 API）、不修改 `NovelSummary`（不加 `volumeCount`）。
- 全局章号 = 该章在 `orderedChapters(novel)` 结果中的 `index + 1`；禁止再用 `chapter.order + 1` 表达全书章号。
- 前后关系 / 前文筛选 = 对 `orderedChapters(novel)` 结果切片；禁止再用 `chapter.order < currentChapter.order` 判断先后。
- `Chapter.order` 降级为纯组内排序键（每分组归一为 `0..n-1`），只在展开函数内部消费。
- 展开规则：正式卷按 `Volume.order` 升序 → 卷内按 `Chapter.order` 升序 → 未分卷（`volumeId` 为空或无法匹配现有卷）按自身 `Chapter.order` 升序，恒定排在所有正式卷之后；排序相同以原数组位置稳定兜底。
- 纯结构操作（卷 CRUD、卷排序、归卷/移出/跨卷移动）MUST NOT 改变 `activeChapterId`，MUST NOT 触发 `ChapterWorkbench` 的切章清栈路径。
- 所有纯函数返回新 `Novel`，不原地修改入参。
- 迁移不自动创建“第一卷”；v6 老章节全部保持未分卷并按原全局 order 保持相对顺序。
- 不新增测试依赖；结构纯函数用项目现有“模块底部 `assertXxxSelfCheck()` + 文件尾调用”的自检模式。
- 删除卷始终使用现有 `window.confirm`，文案必须显示受影响章节数并说明章节仅移入“未分卷”、正文不删。
- 交付验证命令固定：`npm.cmd run build`（renderer tsc+Vite / Electron tsc 均 exit 0）；`python "C:\Users\x1176\.codex\skills\endless-creation-guardrails\scripts\scan_text_integrity.py" "F:\AIProject\Endless Creation\src"` 得 `TEXT INTEGRITY OK`；`git diff --check` 无空白错误。

---

### Task 1: Schema v7 类型与兼容迁移消毒（对齐 tasks.md 组 1）

**Files:**
- Modify: `src/types/novel.ts`
- Modify: `electron/preload/bridgeTypes.ts`
- Modify: `electron/main/index.ts` (`sanitizeNovel` ~718-762, `createNovel` ~865-880)
- Modify: `src/services/rendererBridge.ts` (`createNovel` ~341-362, `normalizeWebNovel` ~504-517)

**Interfaces:**
- Produces: `interface Volume { id: string; title: string; order: number; createdAt: string; updatedAt: string }`。
- Produces: `Chapter.volumeId?: string`；`Novel.volumes: Volume[]`；`Novel.version: 7`。
- Consumes: 既有 `Chapter`/`Novel` 全部字段保持不变。
- Produces（main 内部）: `sanitizeVolumes(value: unknown, now: string): Volume[]`。

- [x] **Step 1: 在权威 renderer 类型文件新增 Volume、Chapter.volumeId 并升级版本**

在 `src/types/novel.ts` 的 `Chapter` 接口之前加入 `Volume`：

```ts
export interface Volume {
  id: string;
  title: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}
```

在 `Chapter` 接口内 `order` 字段之前加入：

```ts
  volumeId?: string;
```

在 `Novel` 接口内 `chapters: Chapter[];` 之前加入 `volumes: Volume[];`，并把 `version: 6;` 改为 `version: 7;`。

- [x] **Step 2: 同步 preload、rendererBridge 两份协议副本到 v7**

在 `electron/preload/bridgeTypes.ts` 复制相同的 `Volume` 接口、`Chapter.volumeId?: string`、`Novel.volumes: Volume[]`，并把该文件内的 `version: 6;`（~195）改为 `version: 7;`。

在 `src/services/rendererBridge.ts`：
- `createNovel` fallback 的 novel 字面量（~345-359）加入 `volumes: []`，把 `version: 6`（~356）改为 `version: 7`。
- `normalizeWebNovel`（~504-517）在返回对象里加入 `volumes: Array.isArray(value.volumes) ? sanitizeWebVolumes(value.volumes) : []`，把 `version: 6`（~515）改为 `version: 7`，并对章节做 `volumeId` 归属校验（见 Step 4 的同义逻辑）。

- [x] **Step 3: 主进程新增 sanitizeVolumes 并在 sanitizeNovel 接入卷 + 归属消毒**

在 `electron/main/index.ts` 靠近其它 `sanitize*` 函数处加入卷消毒（合法条目归一 order 为 0..n-1，非法条目丢弃）：

```ts
function sanitizeVolumes(value: unknown, now: string): Volume[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry): Volume | null => {
      if (!entry || typeof entry !== 'object') return null;
      const item = entry as Partial<Volume>;
      if (typeof item.title !== 'string') return null;
      return {
        id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : randomUUID(),
        title: item.title,
        order: Number.isFinite(item.order) ? Number(item.order) : 0,
        createdAt: typeof item.createdAt === 'string' ? item.createdAt : now,
        updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : now,
      };
    })
    .filter((volume): volume is Volume => volume !== null)
    .sort((a, b) => a.order - b.order)
    .map((volume, order) => ({ ...volume, order }));
}
```

把 `sanitizeNovel` 内章节消毒改为：先消毒卷得到 `volumes` 与合法卷 id 集合，再在每个章节对象里加入 `volumeId`（仅非空字符串且命中合法卷 id 时保留，否则 `undefined`）。用下述块替换 `sanitizeNovel` 中章节消毒与返回值：

```ts
  const volumes = sanitizeVolumes(candidate.volumes, now);
  const volumeIds = new Set(volumes.map((volume) => volume.id));
  const rawChapters = Array.isArray(candidate.chapters) ? candidate.chapters.map((chapter, index): Chapter | null => {
    if (!chapter || typeof chapter !== 'object') return null;
    const item = chapter as Partial<Chapter>;
    const volumeId = typeof item.volumeId === 'string' && item.volumeId.trim() && volumeIds.has(item.volumeId.trim())
      ? item.volumeId.trim()
      : undefined;
    return {
      id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : randomUUID(),
      title: typeof item.title === 'string' ? item.title : '',
      content: typeof item.content === 'string' ? item.content : '',
      outline: typeof item.outline === 'string' ? item.outline : undefined,
      versions: sanitizeChapterVersions(item.versions, now),
      selectedVersionId: typeof item.selectedVersionId === 'string' ? item.selectedVersionId : undefined,
      status: item.status === 'draft' || item.status === 'inProgress' || item.status === 'done' ? item.status : undefined,
      wordTarget: typeof item.wordTarget === 'number' && Number.isFinite(item.wordTarget) && item.wordTarget > 0 ? item.wordTarget : undefined,
      volumeId,
      order: Number.isFinite(item.order) ? Number(item.order) : index,
      createdAt: typeof item.createdAt === 'string' ? item.createdAt : now,
      updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : now,
    };
  }).filter((chapter): chapter is Chapter => chapter !== null) : [];
  const chapters = normalizeChapterGroupOrder(rawChapters, volumes);
```

其中 `normalizeChapterGroupOrder` 是主进程内的小辅助：按 (卷序, 原全局 order, 原数组位置) 稳定分组，每组 order 从 0 归一，v6 未分卷（`volumeId===undefined`）保持相对顺序。加入：

```ts
function normalizeChapterGroupOrder(chapters: Chapter[], volumes: Volume[]): Chapter[] {
  const volumeOrder = new Map(volumes.map((volume) => [volume.id, volume.order]));
  const withPos = chapters.map((chapter, position) => ({ chapter, position }));
  const groups = new Map<string, { chapter: Chapter; position: number }[]>();
  for (const item of withPos) {
    const key = item.chapter.volumeId && volumeOrder.has(item.chapter.volumeId) ? item.chapter.volumeId : '__unassigned__';
    const bucket = groups.get(key) ?? [];
    bucket.push(item);
    groups.set(key, bucket);
  }
  const result: Chapter[] = [];
  for (const bucket of groups.values()) {
    bucket
      .sort((a, b) => (a.chapter.order - b.chapter.order) || (a.position - b.position))
      .forEach((item, order) => result.push({ ...item.chapter, order }));
  }
  return result;
}
```

在 `sanitizeNovel` 返回对象里 `chapters,` 之前加入 `volumes,`，把 `version: 6,`（~758）改为 `version: 7,`。删除原章节消毒尾部的 `.sort((a, b) => a.order - b.order)`（已由 `normalizeChapterGroupOrder` 接管）。

- [x] **Step 4: 主进程 createNovel 与 Web fallback 初始化 volumes: [] / v7**

在 `electron/main/index.ts` 的 `createNovel`（~868-880）的 novel 字面量里 `chapters: [],` 之前加入 `volumes: [],`，把 `version: 6,`（~879）改为 `version: 7,`。

在 `src/services/rendererBridge.ts` 补一个与主进程同义的轻量卷/归属归一（Web 预览无 randomUUID 场景可用 `crypto.randomUUID()`）：

```ts
function sanitizeWebVolumes(value: unknown[]): Volume[] {
  return value
    .filter((entry): entry is Volume =>
      Boolean(entry) && typeof entry === 'object'
      && typeof (entry as Volume).id === 'string'
      && typeof (entry as Volume).title === 'string')
    .map((volume) => ({
      id: volume.id,
      title: volume.title,
      order: Number.isFinite(volume.order) ? Number(volume.order) : 0,
      createdAt: typeof volume.createdAt === 'string' ? volume.createdAt : new Date().toISOString(),
      updatedAt: typeof volume.updatedAt === 'string' ? volume.updatedAt : new Date().toISOString(),
    }))
    .sort((a, b) => a.order - b.order)
    .map((volume, order) => ({ ...volume, order }));
}
```

并在 `normalizeWebNovel` 里对章节 `volumeId` 做“命中合法卷 id 才保留”的降级（与 Electron 同义）。若 `rendererBridge` 现有 `normalizeWebNovel` 直接透传 `value.chapters`，改为 map 一遍把无效 `volumeId` 置 `undefined`。

- [x] **Step 5: 构建确认四副本一致**

Run:

```powershell
npm.cmd run build
```

Expected: renderer Vite 与 Electron tsc 均成功，exit code 0；无 `version: 6` 残留导致的字面量类型不匹配错误。

- [x] **Step 6: 提交 schema v7 原子变更**

```powershell
git add src/types/novel.ts electron/preload/bridgeTypes.ts electron/main/index.ts src/services/rendererBridge.ts
git commit -m "feat: add novel volume schema v7 with compatible migration"
```

### Task 2: 卷序与结构变更纯函数模块 + 自检（对齐 tasks.md 组 2）

**Files:**
- Create: `src/features/novel-creation/novelStructure.ts`

**Interfaces:**
- Consumes: Task 1 的 `Volume`、`Chapter.volumeId`、`Novel.volumes`、`Novel.version: 7`。
- Produces: `orderedChapters(novel: Novel): Chapter[]`（卷序展开的新数组，不改原对象）。
- Produces: `groupChaptersByVolume(novel: Novel): { volume: Volume | null; chapters: Chapter[] }[]`（`volume: null` 为未分卷分组，恒定末位；正式卷按 order 升序）。
- Produces: `moveChapterInStructure(novel: Novel, chapterId: string, target: { volumeId: string | null; toIndex: number }): Novel`（跨卷移动 + 卷内重排 + 归属更新 + 源/目标分组 order 归一）。
- Produces: `reorderVolumes(novel: Novel, volumeId: string, direction: 'up' | 'down'): Novel`。
- Produces: `deleteVolume(novel: Novel, volumeId: string): Novel`（清空相关章节 `volumeId`，不删章，归一未分卷 order）。
- Produces: `createVolume(novel: Novel, title: string): Novel`（追加到正式卷末尾；标题 trim 后非空由调用方保证）。
- Produces: `renameVolume(novel: Novel, volumeId: string, title: string): Novel`。
- Produces: `countChaptersInVolume(novel: Novel, volumeId: string): number`（删除确认文案用）。
- Produces: `assertNovelStructureSelfCheck(): void`（文件尾调用）。

- [x] **Step 1: 写展开与分组纯函数**

创建 `src/features/novel-creation/novelStructure.ts`。先写 import 与分组核心：

```ts
import type { Chapter, Novel, Volume } from '../../types/novel';

function sortedVolumes(novel: Novel): Volume[] {
  return novel.volumes
    .map((volume, position) => ({ volume, position }))
    .sort((a, b) => (a.volume.order - b.volume.order) || (a.position - b.position))
    .map((item) => item.volume);
}

function sortGroup(chapters: { chapter: Chapter; position: number }[]): Chapter[] {
  return chapters
    .sort((a, b) => (a.chapter.order - b.chapter.order) || (a.position - b.position))
    .map((item) => item.chapter);
}

export function groupChaptersByVolume(novel: Novel): { volume: Volume | null; chapters: Chapter[] }[] {
  const volumeIds = new Set(novel.volumes.map((volume) => volume.id));
  const buckets = new Map<string, { chapter: Chapter; position: number }[]>();
  const unassigned: { chapter: Chapter; position: number }[] = [];
  novel.chapters.forEach((chapter, position) => {
    if (chapter.volumeId && volumeIds.has(chapter.volumeId)) {
      const bucket = buckets.get(chapter.volumeId) ?? [];
      bucket.push({ chapter, position });
      buckets.set(chapter.volumeId, bucket);
    } else {
      unassigned.push({ chapter, position });
    }
  });
  const groups = sortedVolumes(novel).map((volume) => ({
    volume: volume as Volume | null,
    chapters: sortGroup(buckets.get(volume.id) ?? []),
  }));
  groups.push({ volume: null, chapters: sortGroup(unassigned) });
  return groups;
}

export function orderedChapters(novel: Novel): Chapter[] {
  return groupChaptersByVolume(novel).flatMap((group) => group.chapters);
}
```

- [x] **Step 2: 写卷 CRUD 与章节结构变更纯函数**

在同文件继续加入卷序归一辅助与全部变更函数。所有函数返回新 `Novel`，并刷新受影响对象 `updatedAt`：

```ts
function reindexVolumes(volumes: Volume[]): Volume[] {
  return volumes.map((volume, order) => (volume.order === order ? volume : { ...volume, order }));
}

function reindexGroups(novel: Novel): Chapter[] {
  const groups = groupChaptersByVolume(novel);
  const byId = new Map<string, Chapter>();
  for (const group of groups) {
    group.chapters.forEach((chapter, order) => {
      byId.set(chapter.id, chapter.order === order ? chapter : { ...chapter, order });
    });
  }
  return novel.chapters.map((chapter) => byId.get(chapter.id) ?? chapter);
}

export function createVolume(novel: Novel, title: string): Novel {
  const now = new Date().toISOString();
  const volume: Volume = {
    id: `volume-${crypto.randomUUID()}`,
    title,
    order: novel.volumes.length,
    createdAt: now,
    updatedAt: now,
  };
  return { ...novel, volumes: reindexVolumes([...novel.volumes, volume]), updatedAt: now };
}

export function renameVolume(novel: Novel, volumeId: string, title: string): Novel {
  const now = new Date().toISOString();
  return {
    ...novel,
    volumes: novel.volumes.map((volume) => (volume.id === volumeId ? { ...volume, title, updatedAt: now } : volume)),
    updatedAt: now,
  };
}

export function reorderVolumes(novel: Novel, volumeId: string, direction: 'up' | 'down'): Novel {
  const ordered = sortedVolumes(novel);
  const index = ordered.findIndex((volume) => volume.id === volumeId);
  const target = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= ordered.length) return novel;
  const [moved] = ordered.splice(index, 1);
  ordered.splice(target, 0, moved);
  const now = new Date().toISOString();
  return { ...novel, volumes: reindexVolumes(ordered).map((volume) => ({ ...volume, updatedAt: now })), updatedAt: now };
}

export function deleteVolume(novel: Novel, volumeId: string): Novel {
  if (!novel.volumes.some((volume) => volume.id === volumeId)) return novel;
  const now = new Date().toISOString();
  const detached: Novel = {
    ...novel,
    volumes: reindexVolumes(novel.volumes.filter((volume) => volume.id !== volumeId)),
    chapters: novel.chapters.map((chapter) => (chapter.volumeId === volumeId ? { ...chapter, volumeId: undefined, updatedAt: now } : chapter)),
    updatedAt: now,
  };
  return { ...detached, chapters: reindexGroups(detached) };
}

export function countChaptersInVolume(novel: Novel, volumeId: string): number {
  return novel.chapters.filter((chapter) => chapter.volumeId === volumeId).length;
}

export function moveChapterInStructure(
  novel: Novel,
  chapterId: string,
  target: { volumeId: string | null; toIndex: number },
): Novel {
  const chapter = novel.chapters.find((item) => item.id === chapterId);
  if (!chapter) return novel;
  const now = new Date().toISOString();
  const nextVolumeId = target.volumeId && novel.volumes.some((volume) => volume.id === target.volumeId)
    ? target.volumeId
    : undefined;
  const detached: Novel = {
    ...novel,
    chapters: novel.chapters.map((item) => (item.id === chapterId ? { ...item, volumeId: nextVolumeId, updatedAt: now } : item)),
    updatedAt: now,
  };
  const groups = groupChaptersByVolume(detached);
  const groupKey = nextVolumeId ?? null;
  const targetGroup = groups.find((group) => (group.volume?.id ?? null) === groupKey);
  const targetChapters = (targetGroup?.chapters ?? []).filter((item) => item.id !== chapterId);
  const movedChapter = detached.chapters.find((item) => item.id === chapterId)!;
  const clampedIndex = Math.max(0, Math.min(target.toIndex, targetChapters.length));
  targetChapters.splice(clampedIndex, 0, movedChapter);
  const orderInGroup = new Map(targetChapters.map((item, order) => [item.id, order]));
  const withTargetOrder: Novel = {
    ...detached,
    chapters: detached.chapters.map((item) => (orderInGroup.has(item.id) ? { ...item, order: orderInGroup.get(item.id)! } : item)),
  };
  return { ...withTargetOrder, chapters: reindexGroups(withTargetOrder) };
}
```

- [x] **Step 3: 写模块自检并在文件尾调用**

沿用项目 `emotionArc.ts` 的 `assertXxxSelfCheck()` 模式。加入并在文件末尾直接调用：

```ts
export function assertNovelStructureSelfCheck(): void {
  const now = '2026-01-01T00:00:00.000Z';
  const base = (over: Partial<Novel>): Novel => ({
    id: 'n', title: '', summary: '', note: '', chapters: [], foreshadowings: [], volumes: [],
    version: 7, createdAt: now, updatedAt: now, ...over,
  }) as Novel;
  const ch = (id: string, order: number, volumeId?: string): Chapter =>
    ({ id, title: id, content: '', order, volumeId, createdAt: now, updatedAt: now }) as Chapter;
  const vol = (id: string, order: number): Volume => ({ id, title: id, order, createdAt: now, updatedAt: now });

  // v6 未分卷保持相对顺序
  const v6 = base({ chapters: [ch('a', 0), ch('b', 1), ch('c', 2)] });
  if (orderedChapters(v6).map((c) => c.id).join(',') !== 'a,b,c') throw new Error('structure self-check: v6 order');

  // 正式卷顺序 + 未分卷末尾
  const mixed = base({
    volumes: [vol('v2', 1), vol('v1', 0)],
    chapters: [ch('u', 0), ch('x', 0, 'v1'), ch('y', 0, 'v2')],
  });
  if (orderedChapters(mixed).map((c) => c.id).join(',') !== 'x,y,u') throw new Error('structure self-check: volume order + unassigned tail');

  // 无效 volumeId 降级为未分卷
  const orphan = base({ volumes: [vol('v1', 0)], chapters: [ch('o', 0, 'ghost'), ch('p', 0, 'v1')] });
  if (orderedChapters(orphan).map((c) => c.id).join(',') !== 'p,o') throw new Error('structure self-check: orphan volumeId');

  // 跨卷移动：双侧分组 order 归一
  const moved = moveChapterInStructure(mixed, 'u', { volumeId: 'v1', toIndex: 0 });
  const v1Group = groupChaptersByVolume(moved).find((g) => g.volume?.id === 'v1');
  if (v1Group?.chapters.map((c) => `${c.id}:${c.order}`).join(',') !== 'u:0,x:1') throw new Error('structure self-check: cross-volume move');

  // 删除卷不删章，章节移入未分卷
  const afterDelete = deleteVolume(mixed, 'v1');
  if (afterDelete.chapters.length !== 3 || afterDelete.chapters.find((c) => c.id === 'x')?.volumeId !== undefined) {
    throw new Error('structure self-check: delete volume keeps chapters');
  }
  if (afterDelete.volumes.length !== 1 || afterDelete.volumes[0].order !== 0) throw new Error('structure self-check: delete volume reindex');
}

assertNovelStructureSelfCheck();
```

- [x] **Step 4: 构建并运行自检（自检在模块导入时执行）**

Run:

```powershell
npm.cmd run build
```

Expected: exit code 0；若自检失败，Vite/tsc 之外的运行断言会在开发运行时抛错，构建期先确保类型与语法通过。另可选用临时 Node 脚本 import 该模块触发 `assertNovelStructureSelfCheck` 验证不抛错，脚本不提交。

- [x] **Step 5: 提交结构纯函数模块**

```powershell
git add src/features/novel-creation/novelStructure.ts
git commit -m "feat: add volume-aware chapter structure functions"
```

### Task 3: 顺序消费者统一接入 orderedChapters（对齐 tasks.md 组 3）

**Files:**
- Modify: `src/features/novel-creation/novelNavigation.tsx` (`reorderChapters` ~30-36, `searchChapters` ~42)
- Modify: `src/features/novel-creation/novelExport.ts` (~103, ~118, ~141, ~146)
- Modify: `src/features/novel-creation/novelPrompts.ts` (~448, ~536-541)
- Modify: `src/features/novel-creation/NovelStats.tsx` (~22)
- Modify: `src/features/novel-creation/NovelCreation.tsx` (`chapters` useMemo ~95, `deleteChapter` reindex ~370)
- Modify: `src/features/novel-creation/characterGraph.ts` (~30，可选接入以稳定输出)

**Interfaces:**
- Consumes: Task 2 的 `orderedChapters(novel)`。
- Produces: 无新导出；所有全书顺序点改为 `orderedChapters(novel)` 结果的 `index + 1` 与切片。

- [x] **Step 1: 导航与搜索改走统一卷序**

在 `novelNavigation.tsx` 顶部加入 `import { orderedChapters } from './novelStructure';`。把 `searchChapters`（~42）的 `[...novel.chapters].sort((a, b) => a.order - b.order)` 改为 `orderedChapters(novel)`：

```ts
  return orderedChapters(novel).flatMap((chapter, index) => {
```

`reorderChapters(chapters, fromIndex, toIndex)` 保留（它对已传入的有序数组做组内重排，调用方将改传单个分组的章节数组）；但其内部 `[...chapters].sort((a, b) => a.order - b.order)` 会破坏跨卷语义——改为不再重排入参，直接按传入顺序移动：

```ts
export function reorderChapters(chapters: Chapter[], fromIndex: number, toIndex: number): Chapter[] {
  const ordered = [...chapters];
  if (fromIndex < 0 || fromIndex >= ordered.length || toIndex < 0 || toIndex >= ordered.length) return ordered;
  const [moved] = ordered.splice(fromIndex, 1);
  ordered.splice(toIndex, 0, moved);
  return ordered.map((chapter, order) => ({ ...chapter, order }));
}
```

- [x] **Step 2: 导出改走统一卷序并用展开索引生成章号**

在 `novelExport.ts` 顶部加入 `import { orderedChapters } from './novelStructure';`。
- HTML 导出（~103）`const chapters = novel.chapters.slice().sort((a, b) => a.order - b.order);` 改为 `const chapters = orderedChapters(novel);`。
- HTML 章号（~118）`第 ${chapter.order + 1} 章` 改为按当前遍历 index：用 `chapters.forEach((chapter, index) => ...)` 并写 `第 ${index + 1} 章`。
- md 导出（~141）`const chapters = novel.chapters.filter(...).sort((a, b) => a.order - b.order);` 改为先 `orderedChapters(novel)` 展开、保留展开 index 再 filter 空正文，章号（~146）用展开 index：

```ts
  const chapters = orderedChapters(novel)
    .map((chapter, index) => ({ chapter, index }))
    .filter(({ chapter }) => chapter.content.trim());
  // ...
  parts.push(`## 第 ${index + 1} 章 · ${chapter.title.trim() || '未命名章节'}`, chapter.content.trim());
```

（保证空正文章节不占用后续章号——若 spec 要求“第 N 章”对齐全书序号，则改为对全量展开数组取 index 后再 filter；按 D7“章号来自统一展开索引”，此处以过滤后连续编号即可，实现时与现状行为保持一致：现状 md 用 `chapter.order + 1` 即原全局序号，改为 `orderedChapters` 展开数组的全局 index + 1，filter 不改变 index。）确认最终写法：先 `orderedChapters(novel).map((chapter, index) => ({ chapter, index }))`，再 `.filter(({ chapter }) => chapter.content.trim())`，章号用 `index + 1`。

- [x] **Step 3: Prompt 前文上下文与章号 map 改走统一卷序**

在 `novelPrompts.ts` 顶部加入 `import { orderedChapters } from './novelStructure';`。
- 章号 label map（~448）`novel.chapters.map((item, index) => ...)` 改为 `orderedChapters(novel).map((item, index) => [item.id, ...])`。
- 前一章上下文（~536-541 `buildPreviousChapterContext`）把 `novel.chapters.filter((item) => item.order < currentChapter.order && item.content.trim()).sort((a, b) => b.order - a.order)` 改为对展开数组切片：

```ts
function buildPreviousChapterContext(novel: Novel, currentChapter: Chapter): string {
  const ordered = orderedChapters(novel);
  const currentIndex = ordered.findIndex((item) => item.id === currentChapter.id);
  if (currentIndex < 0) return '';
  for (const chapter of ordered.slice(0, currentIndex).reverse()) {
    if (!chapter.content.trim()) continue;
    // 保留原有拼接与 label（章号改用 ordered 中位置 + 1）
    // ...
  }
  // ...
}
```

章号 `第 ${chapter.order + 1} 章`（~541）改为该章在 `ordered` 中的 `index + 1`（用 `ordered.indexOf(chapter) + 1` 或在 slice 时保留 index）。

- [x] **Step 4: 统计改走统一卷序**

在 `NovelStats.tsx` 顶部加入 `import { orderedChapters } from './novelStructure';`，把 `const ordered = [...novel.chapters].sort((a, b) => a.order - b.order);`（~22）改为 `const ordered = orderedChapters(novel);`。其余 `ordered.map/reduce/filter` 逻辑不变（统计与顺序相关但字段引用不变）。

- [x] **Step 5: NovelCreation 顶层 chapters 派生与删章 reindex 改走卷序**

在 `NovelCreation.tsx` 顶部加入 `import { orderedChapters } from './novelStructure';`。
- 顶层 `const chapters = useMemo(() => [...(currentNovel?.chapters ?? [])].sort((a, b) => a.order - b.order), [currentNovel]);`（~95）改为 `const chapters = useMemo(() => (currentNovel ? orderedChapters(currentNovel) : []), [currentNovel]);`。
- `deleteChapter`（~370）现按全局 order 归一：`chapters: novel.chapters.filter(...).sort((a, b) => a.order - b.order).map((item, order) => ({ ...item, order }))` 会跨卷破坏组内 order；改为删章后按分组归一——删除后调用 Task 2 的组内归一逻辑。最小改动：删章后对每个分组独立重排。实现为：

```ts
      chapters: reindexGroupsAfterDelete(novel, chapterId),
```

其中在 `novelStructure.ts` 追加导出 `deleteChapterInStructure(novel: Novel, chapterId: string): Novel`（filter 掉该章后复用 `reindexGroups`），并在此调用替换。若不新增函数，则内联：filter 掉章节后按 `groupChaptersByVolume` 重排每组 order。优先追加 `deleteChapterInStructure` 到 Task 2 模块并在此调用（保持组内 order 单一事实源）。

- [x] **Step 6: 扫描残留全局 order 排序点并确认与顺序无关逻辑未误改**

Run:

```powershell
Get-ChildItem src -Recurse -File | Select-String -Pattern 'chapters.*\.sort\(\(a, b\) => a\.order - b\.order\)|chapter\.order \+ 1|item\.order < currentChapter\.order'
```

Expected:
- `novelExport.ts`、`novelPrompts.ts`、`NovelStats.tsx`、`novelNavigation.tsx`、`NovelCreation.tsx` 已无“全书语义”的全局 order 排序或 `chapter.order + 1` 章号。
- `characterGraph.ts:30`（无序拼接，D3 豁免）、`emotionArc.ts:30`（按 id 建集，与顺序无关）保持不变即可；如需稳定输出可选接入 `orderedChapters`。
- 伏笔 `plantedChapterId`/`payoffChapterId`、`EmotionPoint.chapterId` 引用逻辑零改动。

- [x] **Step 7: 构建并提交顺序消费者统一**

```powershell
npm.cmd run build
```

Expected: exit code 0。Then:

```powershell
git add src/features/novel-creation/novelNavigation.tsx src/features/novel-creation/novelExport.ts src/features/novel-creation/novelPrompts.ts src/features/novel-creation/NovelStats.tsx src/features/novel-creation/NovelCreation.tsx src/features/novel-creation/novelStructure.ts
git commit -m "feat: route order consumers through orderedChapters"
```

### Task 4: 卷管理与分组导航 UI（对齐 tasks.md 组 4）

**Files:**
- Create: `src/features/novel-creation/VolumeOutline.tsx`
- Modify: `src/features/novel-creation/NovelCreation.tsx`（“章节大纲”页 ~1017、“章节内容”页列表 ~1056）
- Modify: `src/features/novel-creation/ChapterWorkbench.tsx`（左栏章节导航 ~1136）
- Modify: 样式文件（项目现有 novel 相关 css，加入卷区/放置目标/空态/响应式）

**Interfaces:**
- Consumes: Task 2 的 `groupChaptersByVolume`、`createVolume`、`renameVolume`、`reorderVolumes`、`deleteVolume`、`countChaptersInVolume`、`moveChapterInStructure`。
- Produces: `VolumeOutline` 组件 props：`{ novel: Novel; activeChapterId: string | null; onSelectChapter: (id: string) => void; onUpdateNovel: (update: (novel: Novel) => Novel) => void }`。
- 中文文案放 `VolumeOutline.tsx` 内或同目录 `volumeLabels.ts`；`NovelCreation.tsx` 只做状态接线与回调传递，不写卷逻辑。

- [x] **Step 1: 实现 VolumeOutline 卷管理头部 + 分组列表 + 键盘路径**

创建 `src/features/novel-creation/VolumeOutline.tsx`。核心结构：顶部“新建卷”按钮（点击 `window.prompt` 或内联输入取 trim 后非空标题，调 `createVolume`）；对 `groupChaptersByVolume(novel)` 渲染每个卷区（正式卷显示卷头：可就地重命名的标题、上移、下移、删除按钮；未分卷 `volume === null` 区无 CRUD 但可作放置目标）。每个卷头按钮带明确 aria-label，分组边界按钮禁用：

```tsx
import type { Novel } from '../../types/novel';
import { groupChaptersByVolume, createVolume, renameVolume, reorderVolumes, deleteVolume, countChaptersInVolume, moveChapterInStructure } from './novelStructure';

export function VolumeOutline({ novel, activeChapterId, onSelectChapter, onUpdateNovel }: {
  novel: Novel;
  activeChapterId: string | null;
  onSelectChapter: (id: string) => void;
  onUpdateNovel: (update: (novel: Novel) => Novel) => void;
}) {
  const groups = groupChaptersByVolume(novel);
  const formalCount = novel.volumes.length;

  function handleCreate() {
    const title = window.prompt('新卷标题')?.trim();
    if (!title) return;
    onUpdateNovel((current) => createVolume(current, title));
  }

  function handleRename(volumeId: string, current: string) {
    const title = window.prompt('重命名卷', current)?.trim();
    if (!title) return;
    onUpdateNovel((novelState) => renameVolume(novelState, volumeId, title));
  }

  function handleReorder(volumeId: string, direction: 'up' | 'down') {
    onUpdateNovel((novelState) => reorderVolumes(novelState, volumeId, direction));
  }

  function handleDelete(volumeId: string, title: string) {
    const affected = countChaptersInVolume(novel, volumeId);
    const ok = window.confirm(`确认删除卷「${title}」？其中 ${affected} 章将移入「未分卷」，正文不会删除。`);
    if (!ok) return;
    onUpdateNovel((novelState) => deleteVolume(novelState, volumeId));
  }
  // 归属选择控件（键盘路径）：<select aria-label="移动到卷"> 选项 = 各正式卷 + 未分卷
  // onChange 调 onUpdateNovel((n) => moveChapterInStructure(n, chapterId, { volumeId: value || null, toIndex: <目标组末尾> }))
  // ...渲染省略：见 Step 2/3 拖拽与分组渲染
}
```

- [x] **Step 2: 实现原生拖拽卷内换位与跨卷放置**

在 VolumeOutline 的章节行加 `draggable`、`onDragStart`（记录被拖 chapterId 到 `dataTransfer`）；卷区/未分卷区容器加 `onDragOver`（`event.preventDefault()` + 设置放置态视觉）与 `onDrop`（读取 chapterId，计算目标 volumeId 与落点 index，调 `moveChapterInStructure`）。三种入口（拖拽 / 上下移按钮 / 归属 select）都收敛到 `moveChapterInStructure` / `reorderVolumes`，不得出现第二套 order 语义。每个卷区在 `dragOver` 时给明确放置目标反馈（如高亮边框），`dragLeave`/`drop` 后清除。

章节卷内上下移用 `moveChapterInStructure(novel, chapterId, { volumeId: currentGroupVolumeId, toIndex: currentIndex ± 1 })`，组边界（首/末）禁用对应按钮。

- [x] **Step 3: “章节大纲”页接入 VolumeOutline，工作台与“章节内容”页只读分组**

在 `NovelCreation.tsx`：
- 导入 `import { VolumeOutline } from './VolumeOutline';`。
- “章节大纲”页原 `chapters.map(...)` 平铺列表（~1017）替换为 `<VolumeOutline novel={currentNovel} activeChapterId={activeChapterId} onSelectChapter={setActiveChapterId} onUpdateNovel={updateNovel} />`。
- “章节内容”页列表（~1056）改为按 `groupChaptersByVolume(currentNovel)` 渲染只读卷分组标题 + 章节项（不含卷 CRUD），点击项仍 `setActiveChapterId`。

在 `ChapterWorkbench.tsx` 左栏章节导航（~1136 `chapters.map`）改为：接收/派生 `groupChaptersByVolume` 结果，渲染只读卷标题分组 + 章节，维持 active chapter 高亮、搜索定位、生成中 busy gate 与正文编辑流程；不改 `activeChapterId` 语义、不引入卷 CRUD。工作台需要的分组数据可从传入的 `novel` 现算，或由父级传 `groups`。

- [x] **Step 4: 卷区/放置目标/空态/响应式样式 + a11y**

在 novel 相关 css 加入：卷区卡片样式、`dragOver` 放置目标高亮类、空卷占位文案样式（“本卷暂无章节”）、未分卷区样式、窄屏响应式（按钮换行不重叠）。确认上移/下移/删除/归属 select 均有 `aria-label`；分组边界按钮 `disabled`；键盘用户无需拖拽即可用“上移/下移 + 归属 select”完成全部结构操作。

- [x] **Step 5: 构建并提交卷管理 UI**

```powershell
npm.cmd run build
```

Expected: exit code 0。Then:

```powershell
git add src/features/novel-creation/VolumeOutline.tsx src/features/novel-creation/NovelCreation.tsx src/features/novel-creation/ChapterWorkbench.tsx src/index.css
git commit -m "feat: add volume management and grouped navigation UI"
```

（css 文件以项目实际 novel 样式文件路径为准；`git add` 时替换。）

### Task 5: 持久化与回归边界确认（对齐 tasks.md 组 5）

**Files:**
- Verify only: `src/features/novel-creation/NovelCreation.tsx`（`updateNovel` / 自动保存链）
- Verify only: `electron/main/index.ts`（`saveNovel` 原子替换）、`src/services/rendererBridge.ts`（Web fallback）

**Interfaces:**
- Consumes: Task 1-4 的全部实现。
- Produces: 无新代码；确认无卷专用 IPC、无新依赖。

- [ ] **Step 1: 确认所有卷/结构变更走现有保存链，无新 IPC**

Run:

```powershell
Get-ChildItem src, electron -Recurse -File | Select-String -Pattern "createVolume|moveChapterToVolume|deleteVolume" | Select-String -Pattern "ipcRenderer|ipcMain|invoke\("
```

Expected: 零命中——卷 CRUD/排序/归卷/重排全部经 `novelStructure.ts` 纯函数生成新 Novel → `updateNovel` → 600ms 自动保存 → `saveNovel(novel)`，未新增任何卷专用 IPC。确认 `VolumeOutline` 的 `onUpdateNovel` 最终连到 `NovelCreation` 的 `updateNovel`。

- [ ] **Step 2: 边界回归自检（运行时或临时脚本，不提交脚本）**

用临时 Node 脚本 import `novelStructure.ts` 与主进程 `sanitizeNovel` 的等价逻辑，覆盖：

```text
损坏/缺失 volumes（非数组/undefined）=> volumes 归一为 []，小说仍可加载
孤儿 volumeId（引用已删卷）=> 章节归未分卷
空卷（无章节）=> 允许存在，orderedChapters 不产出该卷章节
删除当前激活章节所在卷 => 章节移入未分卷，chapterId 不变
跨卷移动激活章节 => 仅 volumeId/order 变，chapterId、content、versions 不变
卷/章节 order 相同 => 原数组位置稳定兜底，结果确定
```

Expected: 全部通过，`chapterId`、正文、`versions`、伏笔/情感/图谱引用数据零丢失。

- [ ] **Step 3: 提交边界确认（若无源码改动则跳过提交）**

若 Step 1/2 暴露缺陷需修复，修复后：

```powershell
npm.cmd run build
git add src/features/novel-creation/novelStructure.ts
git commit -m "fix: harden volume structure persistence boundaries"
```

若无需改动，本 Task 不产生新提交，仅作为验证门。

### Task 6: 交付验证与收口（对齐 tasks.md 组 6）

**Files:**
- Modify: `openspec/changes/add-novel-volume-structure/tasks.md`（逐项勾选）
- Verify only: all changed source files

**Interfaces:**
- Consumes: Task 1-5 全部实现。
- Produces: 可交给 Comet verify 阶段的新鲜证据。

- [ ] **Step 1: 双端构建**

```powershell
npm.cmd run build
```

Expected: renderer tsc + Vite 与 Electron tsc 全部 exit 0。

- [ ] **Step 2: 文本完整性扫描**

```powershell
python "C:\Users\x1176\.codex\skills\endless-creation-guardrails\scripts\scan_text_integrity.py" "F:\AIProject\Endless Creation\src"
```

Expected: 输出 `TEXT INTEGRITY OK`，无 U+FFFD / 乱码。

- [ ] **Step 3: diff 空白检查与 OpenSpec 校验**

```powershell
git diff --check
npx.cmd openspec validate add-novel-volume-structure --strict
```

Expected: 两条命令均 exit 0。

- [ ] **Step 4: GUI 真机验收清单（进入 verify 阶段执行）**

覆盖 spec 场景：
1. 卷 CRUD：新建卷（空标题被拒）、就地重命名、删除卷弹 `window.confirm` 且文案含受影响章节数、章节移入未分卷、正文不删。
2. 卷排序：上移/下移按钮，分组边界按钮禁用。
3. 归卷 / 移出 / 跨卷：归属 select（键盘路径）与拖拽（增强路径）两条都生效，落点归一。
4. 未分卷恒在末尾显示，可作放置目标。
5. 重启持久化：卷、`volumeId`、组内 order 全部保留。
6. 顺序一致性：跨章搜索章号、导出（HTML/md/离线包）章节顺序与章号、前一章 Prompt 上下文、统计“第 N 章”、情感曲线/人物图谱输入，均与卷序展开一致。
7. 结构调整不中断编辑会话（Spec Patch 两场景）：归卷/跨卷移动保持编辑会话；删激活章所在卷后仍可继续编辑同一章（`activeChapterId` 不变、撤销/重做栈不清）。

- [ ] **Step 5: 逐项勾选 OpenSpec tasks.md**

仅在对应实现与命令已有证据后，把 `openspec/changes/add-novel-volume-structure/tasks.md` 的全部 6 组条目改为 `[x]`。

- [ ] **Step 6: 单个 coherent feature commit 收口**

仅提交本 change 的源文件与 artifacts；平台/工具未跟踪目录（`.agent/`、`.agents/`、`.claude/`、`.codegraph/`、`.codex/`、`skills-lock.json` 等）不入库。

```powershell
git add openspec/changes/add-novel-volume-structure/tasks.md
git commit -m "chore: complete novel volume structure tasks"
```

## Self-Review

**1. Spec coverage（对齐 design D1-D8 与 tasks.md 六组）:**
- D1 扁平章节 + 卷元数据 + v6→7 → Task 1。
- D2 `Chapter.order` 组内顺序 + 未分卷虚拟末尾 → Task 2（`groupChaptersByVolume`）+ Task 1（`normalizeChapterGroupOrder`）。
- D3 单一展开入口 → Task 2（`orderedChapters`）+ Task 3（消费者接入）。
- D4 renderer 内整本 Novel 更新、无新 IPC → Task 2 纯函数 + Task 5 确认。
- D5 Electron + Web fallback 同义迁移消毒 → Task 1 Step 3/4。
- D6 卷管理集中“章节大纲”页、其他只读分组 → Task 4。
- D7 搜索章号与顺序语义统一 → Task 3 Step 1/2/3/4。
- D8 纯函数自检 + 双端构建 + 扫描 → Task 2 Step 3、Task 6。
- Spec Patch「纯结构调整不中断编辑会话」→ Task 4（结构变更不改 activeChapterId）+ Task 6 Step 4 场景 7。

**2. Placeholder scan:** Task 3 Step 2 的 md 章号写法给了两种语义并收敛到“`orderedChapters` 展开数组 index + 1、filter 不改 index”；Task 3 Step 5 与 Task 4 的 `deleteChapterInStructure` / css 路径为实现期定位项，已在步骤内注明具体收敛方式，非 TBD。

**3. Type consistency:** `orderedChapters(novel): Chapter[]`、`groupChaptersByVolume(novel): { volume: Volume | null; chapters: Chapter[] }[]`、`moveChapterInStructure(novel, chapterId, { volumeId, toIndex })`、`reorderVolumes(novel, volumeId, direction)`、`deleteVolume(novel, volumeId)`、`createVolume(novel, title)`、`renameVolume(novel, volumeId, title)`、`countChaptersInVolume(novel, volumeId)` 在 Task 2 定义，Task 3/4 消费签名一致。`VolumeOutline` props 在 Task 4 定义并在 NovelCreation 接线一致。

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-14-add-novel-volume-structure.md`. Two execution options:

1. **Subagent-Driven (recommended)** - dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** - execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
