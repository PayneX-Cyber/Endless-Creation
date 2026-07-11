# 情感曲线闭环 实现计划

**状态**：2026-07-11 已实施并完成构建与文本完整性验证。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按章节 AI 分析情绪 → 候选 → 用户确认 → 按 novelId 持久化(localStorage) → SVG 曲线渲染 → 单章重分析，完整闭环，解除路线图 Phase 4 情感曲线勾选门槛。

**Architecture:** 复用人物图谱的「AI推演+SVG+localStorage」外壳 + 伏笔候选的「先候选再确认」内核。数据层拆纯函数 `mergeEmotionPoints`(无 IO、可自检)+ IO 层 `upsertEmotionPoints`(读整根 Record→合并→spread 写回)。UI 是详情页第 8 tab 的 EmotionArcPanel(曲线/分析中/候选三态)。不动 Novel schema/IPC/导出协议。

**Tech Stack:** React 19 + TypeScript 6 + Vite 8 + Electron 42。无测试框架——验证靠 `npm run build`(renderer tsc+vite / electron tsc)+ `assertEmotionArcSelfCheck` 运行时自检 + Grep 核对 + GUI 真机。

## Global Constraints

- **单个增量 commit**：spec + 代码 + 路线图一起进唯一的 `feat: 增加小说情感曲线分析`。实现全程**不提交**，最后一个 Task 才 commit。
- **不改** Novel schema、version、IPC 通道、导出协议。（不动 `src/types/novel.ts`、`electron/preload/bridgeTypes.ts`、`electron/main/index.ts`、`src/services/rendererBridge.ts`）
- 落库走独立 localStorage key `endless-creation.novel-emotion-arcs`，结构 `Record<novelId, EmotionArc>`。
- **防 AI 污染三方向 score 规则**：AI 解析 = 非有限数 invalid / 有限数 round+clamp 进候选；落库合并 = 非有限丢弃 / 越界 clamp 保留；本地读取 = 越界或非有限一律过滤(不 clamp)。
- **IO 写回必须 spread 保留其他小说**：`setItem(KEY, JSON.stringify({ ...allArcs, [novel.id]: nextArc }))`，绝不整根覆盖。
- 大 tsx（NovelCreation.tsx）编辑铁律：只信 Grep 工具 + tsc + git diff，不信 Read/bash 转储；中文文案塞独立文件(EmotionArcPanel.tsx)，NovelCreation 接入点锚 ASCII-only 行；不用 sed 多行插入。
- 验证命令：`npm run build`，期望 exit 0、无 TS 报错。

---

## 文件结构

| 文件 | 责任 | 动作 |
|---|---|---|
| `src/features/novel-creation/emotionArc.ts` | 类型 + mergeEmotionPoints(纯) + read/upsert(IO) + buildPrompt/parse + assertEmotionArcSelfCheck | 新增 |
| `src/features/novel-creation/EmotionArcPanel.tsx` | 三态面板(曲线/分析中/候选)+ SVG 曲线 + 确认 + 单章重分析；独占中文文案 | 新增 |
| `src/features/novel-creation/EmotionArcPanel.css` | SVG/清单/响应式/焦点态/深色态样式 | 新增 |
| `src/features/novel-creation/NovelCreation.tsx` | 恢复 emotion tab(8项)+ ChartIcon import + 挂载 EmotionArcPanel | 修改 |
| `src/app/icons.tsx` | 从 8c016cc 恢复 ChartIcon | 修改 |
| `docs/plans/2026-07-06-v1-roadmap-adjusted.md` | Phase 4 情感曲线项打勾 | 修改 |
| `docs/plans/2026-07-10-novel-emotion-arc-spec.md` | 本 spec(随最终 commit 入库) | 已存在 |

**执行顺序理由**：Task 1(数据层纯函数+自检)零 UI 依赖、可独立自检验证，先做。Task 2(prompt/parse)也在 emotionArc.ts、纯逻辑。Task 3(ChartIcon+tab 骨架)让入口可挂。Task 4(EmotionArcPanel 曲线+空态)先渲染已确认数据。Task 5(分析链路+候选态)接 AI。Task 6(单章重分析+确认落库)闭合。Task 7 收口 commit。每个 Task 后 build 绿。

---

### Task 1: emotionArc.ts 数据层（纯函数 + IO + 自检）

**Files:**
- Create: `src/features/novel-creation/emotionArc.ts`

**Interfaces:**
- Consumes: `Novel`、`Chapter`（`src/types/novel.ts`）。
- Produces:
  - `EmotionPointCandidate = { chapterId: string; score: number; reason: string }`
  - `EmotionPoint = { chapterId: string; score: number; reason: string; updatedAt: string }`
  - `EmotionArc = { points: EmotionPoint[]; updatedAt: string }`
  - `mergeEmotionPoints(current: EmotionArc | null, novel: Novel, points: EmotionPointCandidate[], now: string): EmotionArc`
  - `readEmotionArc(novelId: string): EmotionArc | null`
  - `upsertEmotionPoints(novel: Novel, points: EmotionPointCandidate[]): { ok: boolean; arc?: EmotionArc; message?: string }`
  - `assertEmotionArcSelfCheck(): void`

- [x] **Step 1: 写类型 + 常量 + clamp/round 工具**

新建 `src/features/novel-creation/emotionArc.ts`：

```typescript
import type { Chapter, Novel } from '../../types/novel';

const EMOTION_ARC_STORAGE_KEY = 'endless-creation.novel-emotion-arcs';

export interface EmotionPointCandidate {
  chapterId: string;
  score: number;
  reason: string;
}

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

// 有限数 → round + clamp(-100,100)；非有限数 → null（调用方据此丢弃）
function normalizeScore(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(-100, Math.min(100, Math.round(value)));
}
```

- [x] **Step 2: 纯函数 mergeEmotionPoints（全部落库护栏在此）**

追加：

```typescript
// 纯函数：无 IO。合并候选进 current，全部护栏（chapterId 校验、score 丢弃/clamp、reason、updatedAt 注入、按 chapterId upsert）在此。
export function mergeEmotionPoints(
  current: EmotionArc | null,
  novel: Novel,
  points: EmotionPointCandidate[],
  now: string,
): EmotionArc {
  const validIds = new Set(novel.chapters.map((chapter) => chapter.id));
  const byChapter = new Map<string, EmotionPoint>();
  // 先放旧点（仅保留合法 chapterId 的旧点，孤儿点在渲染层过滤，这里合并层保留以免误删可恢复数据）
  for (const point of current?.points ?? []) {
    byChapter.set(point.chapterId, point);
  }
  // 再 upsert 新候选：非法 chapterId 丢弃、非有限 score 丢弃、越界 clamp
  for (const candidate of points) {
    if (!validIds.has(candidate.chapterId)) continue;
    const score = normalizeScore(candidate.score);
    if (score === null) continue;
    const reason = typeof candidate.reason === 'string' ? candidate.reason : '';
    byChapter.set(candidate.chapterId, { chapterId: candidate.chapterId, score, reason, updatedAt: now });
  }
  return { points: Array.from(byChapter.values()), updatedAt: now };
}
```

- [x] **Step 3: read（严格读取护栏，越界过滤不 clamp）**

追加：

```typescript
// 读取护栏更严：越界/非有限 score 一律过滤（视为损坏，不 clamp 改写历史）
function isValidStoredPoint(value: unknown): value is EmotionPoint {
  if (!value || typeof value !== 'object') return false;
  const point = value as Record<string, unknown>;
  if (typeof point.chapterId !== 'string' || !point.chapterId) return false;
  if (typeof point.score !== 'number' || !Number.isFinite(point.score)) return false;
  if (point.score < -100 || point.score > 100) return false;
  return true;
}

export function readEmotionArc(novelId: string): EmotionArc | null {
  try {
    const raw = globalThis.localStorage?.getItem(EMOTION_ARC_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const arc = (parsed as Record<string, unknown>)[novelId];
    if (!arc || typeof arc !== 'object' || !Array.isArray((arc as Record<string, unknown>).points)) return null;
    const points = ((arc as Record<string, unknown>).points as unknown[])
      .filter(isValidStoredPoint)
      .map((point) => ({
        chapterId: point.chapterId,
        score: point.score,
        reason: typeof point.reason === 'string' ? point.reason : '',
        updatedAt: typeof point.updatedAt === 'string' ? point.updatedAt : new Date().toISOString(),
      }));
    return { points, updatedAt: typeof (arc as Record<string, unknown>).updatedAt === 'string' ? (arc as Record<string, string>).updatedAt : new Date().toISOString() };
  } catch {
    return null;
  }
}
```

- [x] **Step 4: upsert（IO 层，spread 保留其他小说）**

追加：

```typescript
// IO 层：读整根 Record → merge 本书 → spread 写回保留其他小说 → 捕获 setItem 抛错
export function upsertEmotionPoints(
  novel: Novel,
  points: EmotionPointCandidate[],
): { ok: boolean; arc?: EmotionArc; message?: string } {
  try {
    const raw = globalThis.localStorage?.getItem(EMOTION_ARC_STORAGE_KEY);
    const allArcs: Record<string, EmotionArc> = raw ? (JSON.parse(raw) as Record<string, EmotionArc>) : {};
    const current = readEmotionArc(novel.id);
    const nextArc = mergeEmotionPoints(current, novel, points, new Date().toISOString());
    globalThis.localStorage?.setItem(EMOTION_ARC_STORAGE_KEY, JSON.stringify({ ...allArcs, [novel.id]: nextArc }));
    return { ok: true, arc: nextArc };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : '保存失败，请重试' };
  }
}
```

- [x] **Step 5: 自检函数（测纯函数，内存不碰 localStorage）**

追加（照 `storeZip.ts` assertStoreZipSelfCheck 模式）：

```typescript
// 运行时自检：app 启动跑一次，断言失败抛错。只测纯函数 mergeEmotionPoints，用内存数据。
export function assertEmotionArcSelfCheck(): void {
  const now = '2026-01-01T00:00:00.000Z';
  const novel = { id: 'n1', chapters: [{ id: 'A' }, { id: 'B' }, { id: 'C' }] } as unknown as Novel;

  // 1. 部分 upsert 不删旧点
  const base = mergeEmotionPoints(null, novel, [
    { chapterId: 'A', score: 50, reason: 'a' },
    { chapterId: 'B', score: -30, reason: 'b' },
  ], now);
  const afterB = mergeEmotionPoints(base, novel, [{ chapterId: 'B', score: 80, reason: 'b2' }], now);
  const a = afterB.points.find((point) => point.chapterId === 'A');
  const b = afterB.points.find((point) => point.chapterId === 'B');
  if (!a || a.score !== 50) throw new Error('selfcheck: partial upsert dropped old point A');
  if (!b || b.score !== 80) throw new Error('selfcheck: partial upsert did not update B');

  // 2. 无效数据丢弃：越界 chapterId + NaN score
  const invalid = mergeEmotionPoints(null, novel, [
    { chapterId: 'ZZZ', score: 10, reason: 'x' },
    { chapterId: 'A', score: Number.NaN, reason: 'x' },
    { chapterId: 'C', score: 20, reason: 'ok' },
  ], now);
  if (invalid.points.length !== 1 || invalid.points[0].chapterId !== 'C') throw new Error('selfcheck: invalid filtering wrong');

  // 3. 越界 clamp 保留（不丢）
  const clamped = mergeEmotionPoints(null, novel, [
    { chapterId: 'A', score: 150, reason: 'x' },
    { chapterId: 'B', score: -300, reason: 'x' },
    { chapterId: 'C', score: 33.7, reason: 'x' },
  ], now);
  const cA = clamped.points.find((point) => point.chapterId === 'A');
  const cB = clamped.points.find((point) => point.chapterId === 'B');
  const cC = clamped.points.find((point) => point.chapterId === 'C');
  if (cA?.score !== 100) throw new Error('selfcheck: 150 should clamp to 100');
  if (cB?.score !== -100) throw new Error('selfcheck: -300 should clamp to -100');
  if (cC?.score !== 34) throw new Error('selfcheck: 33.7 should round to 34');
}
```

- [x] **Step 6: 在 app 初始化处调用自检**

Grep 定位 app 启动入口（如 `src/main.tsx` 或 App 顶层）现有的 `assertStoreZipSelfCheck` 调用点：
Run: `git -C "F:/AIProject/Endless Creation" grep -n "assertStoreZipSelfCheck"`
在同一处旁调用 `assertEmotionArcSelfCheck()`（import 后）。若找不到现有自检调用点，则在 `src/main.tsx` 顶层模块作用域加一次调用。

- [x] **Step 7: build 验证**

Run: `cd "F:/AIProject/Endless Creation" && npm run build`
Expected: exit 0。app 启动时自检跑通（若自检抛错，build 不受影响但运行时会崩——故此步只验编译，运行时自检在 Task 7 GUI 验）。

- [x] **Step 8: 暂存不 commit**

Run: `git -C "F:/AIProject/Endless Creation" add -A`

---

### Task 2: emotionArc.ts 的 prompt 构建 + 解析

**Files:**
- Modify: `src/features/novel-creation/emotionArc.ts`

**Interfaces:**
- Consumes: `Novel`、`Chapter`；Task 1 的 `EmotionPointCandidate`。
- Produces:
  - `TextMessage = { role: 'system' | 'user'; content: string }`
  - `buildEmotionPrompt(novel: Novel, chapter: Chapter, index: number, total: number): TextMessage[]`
  - `ParsedEmotionPoint = { kind: 'ok'; point: EmotionPointCandidate } | { kind: 'invalid' }`
  - `parseEmotionResult(text: string, chapter: Chapter): ParsedEmotionPoint`

- [x] **Step 1: limitText 工具 + TextMessage 类型**

在 emotionArc.ts 追加（照 characterGraph.ts limitText 头尾各半策略）：

```typescript
export type TextMessage = { role: 'system' | 'user'; content: string };

function limitText(text: string, max: number): string {
  const chars = Array.from(text);
  if (chars.length <= max) return chars.join('');
  const half = Math.floor(max / 2);
  return `${chars.slice(0, half).join('')}\n...\n${chars.slice(-half).join('')}`;
}
```

- [x] **Step 2: buildEmotionPrompt（固定标尺 + 仅当前章正文）**

追加。上下文严格限定标题/简介/蓝图/创意/位置/当前章正文(限长)，不塞其他章：

```typescript
export function buildEmotionPrompt(novel: Novel, chapter: Chapter, index: number, total: number): TextMessage[] {
  return [
    {
      role: 'system',
      content: '你是小说章节情绪分析助手。任务是给出当前章节的情绪基调分值。使用固定标尺：-100 表示极度低落/压抑，0 表示中性/平稳，+100 表示极度高昂/积极；绝对值代表情绪强度。严格输出 JSON 对象，格式为 {"score": number, "reason": string}。score 是 -100 到 100 的整数，reason 是不超过 40 字的一句依据。只输出 JSON，不要加解释、不要加代码围栏、不要加标题。',
    },
    {
      role: 'user',
      content: [
        `小说标题：${novel.title}`,
        novel.summary ? `小说简介：${novel.summary}` : '',
        novel.blueprint ? `作品蓝图：\n${novel.blueprint}` : '',
        novel.idea ? `创意：${novel.idea}` : '',
        `章节位置：第 ${index + 1} 章 / 共 ${total} 章`,
        `本章标题：${chapter.title || '未命名章节'}`,
        `本章正文：\n${limitText(chapter.content, 6000)}`,
        '请按固定标尺给出本章情绪分值，按上述 JSON 对象格式输出。',
      ].filter(Boolean).join('\n'),
    },
  ];
}
```

- [x] **Step 3: parseEmotionResult（chapterId 注入、非有限 invalid、有限 round+clamp）**

追加（复用 Task 1 的 normalizeScore；剥围栏照 characterGraph.stripCodeFence）：

```typescript
const CODE_FENCE_PATTERN = /^```(?:json)?\s*([\s\S]*?)\s*```$/;
function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(CODE_FENCE_PATTERN);
  return match ? match[1].trim() : trimmed;
}

export type ParsedEmotionPoint =
  | { kind: 'ok'; point: EmotionPointCandidate }
  | { kind: 'invalid' };

// chapterId 由传入 chapter 注入，不信任 AI；score 非有限 → invalid，有限 → round+clamp 进候选
export function parseEmotionResult(text: string, chapter: Chapter): ParsedEmotionPoint {
  const stripped = stripCodeFence(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    return { kind: 'invalid' };
  }
  if (!parsed || typeof parsed !== 'object') return { kind: 'invalid' };
  const record = parsed as Record<string, unknown>;
  const score = normalizeScore(record.score);
  if (score === null) return { kind: 'invalid' };
  const reason = typeof record.reason === 'string' ? record.reason.trim() : '';
  return { kind: 'ok', point: { chapterId: chapter.id, score, reason } };
}
```

- [x] **Step 4: build 验证**

Run: `cd "F:/AIProject/Endless Creation" && npm run build`
Expected: exit 0。

- [x] **Step 5: 暂存不 commit**

Run: `git -C "F:/AIProject/Endless Creation" add -A`

---

### Task 3: 恢复 ChartIcon + emotion tab 骨架

**Files:**
- Modify: `src/app/icons.tsx`（恢复 ChartIcon）
- Modify: `src/features/novel-creation/NovelCreation.tsx`（ProjectViewTab 加 emotion、PROJECT_VIEW_TABS 加项、import ChartIcon、挂载占位）

**Interfaces:**
- Consumes: Task 4 的 `EmotionArcPanel`（本 Task 先挂占位，Task 4 替换）。
- Produces: emotion tab 可点击、8 tab 导航。

- [x] **Step 1: 从 8c016cc 恢复 ChartIcon**

取原始字节：
Run: `git -C "F:/AIProject/Endless Creation" show 8c016cc:src/app/icons.tsx | sed -n '206,214p'`
把这段 `export function ChartIcon(props: IconProps) { ... }` 用 Edit 加回 `src/app/icons.tsx`（放在其他图标导出旁，如 BoltIcon 附近）。

- [x] **Step 2: ProjectViewTab 类型加 emotion**

Grep 定位 `type ProjectViewTab`（`NovelCreation.tsx:20` 一带）：
Run: `git -C "F:/AIProject/Endless Creation" grep -n "type ProjectViewTab" -- src/features/novel-creation/NovelCreation.tsx`
Edit 在 `'chapters' |` 后加 `'emotion' |`（放回原位置，chapters 与 foreshadowing 之间）：
```typescript
type ProjectViewTab = 'overview' | 'world' | 'characters' | 'graph' | 'outline' | 'chapters' | 'emotion' | 'foreshadowing';
```

- [x] **Step 3: PROJECT_VIEW_TABS 加情感曲线项 + import ChartIcon**

Grep 定位 import 行（`NovelCreation.tsx:2`）与 `PROJECT_VIEW_TABS`（38）。Edit：
- import 加 `ChartIcon`：从 `'../../app/icons'` 的解构里加回 `ChartIcon`。
- 数组在 chapters 项后、foreshadowing 前插入：
```typescript
  { id: 'emotion', label: '情感曲线', description: '章节情绪起伏', Icon: ChartIcon },
```

- [x] **Step 4: 挂载占位（Task 4 替换为真面板）**

Grep 定位 `{projectViewTab === 'graph' && ...}`（947）。Edit 在其后加 emotion 分支临时占位：
```tsx
                {projectViewTab === 'emotion' && (
                  <div className="novel-emotion-arc-placeholder">情感曲线（构建中）</div>
                )}
```

- [x] **Step 5: build 验证**

Run: `cd "F:/AIProject/Endless Creation" && npm run build`
Expected: exit 0。8 tab 应可编译；ChartIcon 有定义有引用。

- [x] **Step 6: 暂存不 commit**

Run: `git -C "F:/AIProject/Endless Creation" add -A`

---

### Task 4: EmotionArcPanel 曲线渲染 + 空态（读已确认数据）

**Files:**
- Create: `src/features/novel-creation/EmotionArcPanel.tsx`
- Create: `src/features/novel-creation/EmotionArcPanel.css`
- Modify: `src/features/novel-creation/NovelCreation.tsx`（占位替换为 EmotionArcPanel）

**Interfaces:**
- Consumes: Task 1 `readEmotionArc`、`EmotionArc`、`EmotionPoint`；`Novel`、`Chapter`。
- Produces: `EmotionArcPanel({ novel }: { novel: Novel })` — 默认曲线态：渲染已确认曲线 + 空态。

**关键**：本 Task 只做「渲染已确认数据 + 空态」，分析/候选/单章重分析在 Task 5/6。中文文案独占本文件（规避 NovelCreation 幻影字节坑）。

- [x] **Step 1: 曲线坐标计算 + SVG 渲染（实心点 + 空心缺口标记 + 实线）**

新建 `EmotionArcPanel.tsx`（照 NovelCharacterGraph 常量+viewBox 范式）：

```tsx
import { useMemo, useState } from 'react';
import type { Chapter, Novel } from '../../types/novel';
import { readEmotionArc, type EmotionArc } from './emotionArc';
import './EmotionArcPanel.css';

const WIDTH = 720;
const HEIGHT = 360;
const PAD_X = 48;
const PAD_Y = 40;

interface ChapterMark {
  chapterId: string;
  title: string;
  order: number;
  x: number;
  score: number | null;   // null = 无分值（空心缺口标记）
  reason: string;
  y: number | null;
}

// X 按章序等分，Y 按 score(-100..100) 映射；零线居中
function layoutMarks(novel: Novel, arc: EmotionArc | null): ChapterMark[] {
  const chapters = novel.chapters.slice().sort((a, b) => a.order - b.order);
  const scoreById = new Map((arc?.points ?? []).map((point) => [point.chapterId, point]));
  const span = chapters.length > 1 ? (WIDTH - PAD_X * 2) / (chapters.length - 1) : 0;
  return chapters.map((chapter, index) => {
    const point = scoreById.get(chapter.id);
    const x = chapters.length > 1 ? PAD_X + span * index : WIDTH / 2;
    const score = point ? point.score : null;
    const y = score === null ? null : PAD_Y + ((100 - score) / 200) * (HEIGHT - PAD_Y * 2);
    return { chapterId: chapter.id, title: chapter.title || '未命名章节', order: chapter.order, x, score, reason: point?.reason ?? '', y };
  });
}

// 相邻实心点连线，跨缺口断开：拆成多段 polyline
function solidSegments(marks: ChapterMark[]): ChapterMark[][] {
  const segments: ChapterMark[][] = [];
  let current: ChapterMark[] = [];
  for (const mark of marks) {
    if (mark.y === null) {
      if (current.length) segments.push(current);
      current = [];
    } else {
      current.push(mark);
    }
  }
  if (current.length) segments.push(current);
  return segments.filter((segment) => segment.length >= 2);
}
```

- [x] **Step 2: 面板主体 + 空态 + X 轴标签抽稀**

追加组件本体：

```tsx
export function EmotionArcPanel({ novel }: { novel: Novel }) {
  const [arc, setArc] = useState<EmotionArc | null>(() => readEmotionArc(novel.id));
  const marks = useMemo(() => layoutMarks(novel, arc), [novel, arc]);
  const segments = useMemo(() => solidSegments(marks), [marks]);
  const hasContentChapters = novel.chapters.some((chapter) => chapter.content.trim());
  const hasAnyScore = marks.some((mark) => mark.y !== null);
  const zeroY = PAD_Y + 0.5 * (HEIGHT - PAD_Y * 2);
  const labelStride = marks.length > 12 ? Math.ceil(marks.length / 12) : 1;

  if (!novel.chapters.length || !hasAnyScore) {
    return (
      <div className="novel-emotion">
        <div className="novel-project-panel__head">
          <div className="novel-project-panel__heading"><h2>情感曲线</h2><p>按章节分析情绪起伏，确认后保存</p></div>
        </div>
        <div className="novel-emotion__empty">
          <strong>还没有情绪分析</strong>
          <span>{hasContentChapters ? '点「分析情绪」，让 AI 逐章评估情绪基调。' : '先完成章节正文，才能分析情绪。'}</span>
          <button className="novel-flow__primary novel-flow__primary--compact" disabled={!hasContentChapters} type="button">分析情绪</button>
        </div>
      </div>
    );
  }

  return (
    <div className="novel-emotion">
      <div className="novel-project-panel__head">
        <div className="novel-project-panel__heading"><h2>情感曲线</h2><p>按章节分析情绪起伏，确认后保存</p></div>
        <button className="novel-flow__primary novel-flow__primary--compact" type="button">分析情绪</button>
      </div>
      <div className="novel-emotion__canvas" role="img" aria-label="情感曲线">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="novel-emotion__svg" preserveAspectRatio="xMidYMid meet">
          <line x1={PAD_X} y1={zeroY} x2={WIDTH - PAD_X} y2={zeroY} className="novel-emotion__zero" />
          {segments.map((segment, index) => (
            <polyline key={index} points={segment.map((mark) => `${mark.x},${mark.y}`).join(' ')} className="novel-emotion__solid" />
          ))}
          {marks.map((mark, index) => (
            mark.y === null ? (
              <circle key={mark.chapterId} cx={mark.x} cy={zeroY} r={5} tabIndex={0} className="novel-emotion__gap" aria-label={`${mark.title}，暂无分值`} />
            ) : (
              <circle key={mark.chapterId} cx={mark.x} cy={mark.y} r={6} tabIndex={0} className="novel-emotion__point" aria-label={`${mark.title}，情绪 ${mark.score}，${mark.reason || '无依据'}`} />
            )
          ))}
        </svg>
      </div>
    </div>
  );
}
```

- [x] **Step 3: EmotionArcPanel.css（曲线/点/缺口/空态/焦点态/深色态）**

新建 `EmotionArcPanel.css`（照 novel-graph 样式命名）：

```css
.novel-emotion { display: flex; flex-direction: column; gap: 16px; }
.novel-emotion__canvas { width: 100%; background: var(--surface-2, #f7f7fa); border-radius: 12px; padding: 12px; }
.novel-emotion__svg { width: 100%; height: auto; }
.novel-emotion__zero { stroke: var(--border, #d0d0d8); stroke-width: 1; stroke-dasharray: 4 4; }
.novel-emotion__solid { fill: none; stroke: var(--accent, #6366f1); stroke-width: 2; }
.novel-emotion__point { fill: var(--accent, #6366f1); cursor: pointer; transition: r 0.12s; }
.novel-emotion__point:hover, .novel-emotion__point:focus { r: 8; outline: none; }
.novel-emotion__gap { fill: none; stroke: var(--border, #b0b0b8); stroke-width: 1.5; stroke-dasharray: 2 2; cursor: pointer; }
.novel-emotion__gap:hover, .novel-emotion__gap:focus { stroke: var(--accent, #6366f1); outline: none; }
.novel-emotion__empty { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 48px 16px; text-align: center; }
@media (prefers-color-scheme: dark) {
  .novel-emotion__canvas { background: var(--surface-2, #1c1c22); }
}
```

- [x] **Step 4: NovelCreation 占位替换为 EmotionArcPanel**

Grep 定位 Task 3 Step 4 的占位 `novel-emotion-arc-placeholder`。Edit 替换为真面板（先 import）：
```typescript
import { EmotionArcPanel } from './EmotionArcPanel';
```
```tsx
                {projectViewTab === 'emotion' && (
                  <EmotionArcPanel novel={currentNovel} />
                )}
```

- [x] **Step 5: build 验证**

Run: `cd "F:/AIProject/Endless Creation" && npm run build`
Expected: exit 0。

- [x] **Step 6: 暂存不 commit**

Run: `git -C "F:/AIProject/Endless Creation" add -A`

---

### Task 5: 分析链路 + 候选态（逐章顺序 + 失败继续 + 取消 + runId 防迟到）

**Files:**
- Modify: `src/features/novel-creation/EmotionArcPanel.tsx`

**Interfaces:**
- Consumes: Task 2 `buildEmotionPrompt`/`parseEmotionResult`；`rendererBridge.generateText`/`cancelTextGeneration`；Task 1 `EmotionPointCandidate`。
- Produces: 面板三态（曲线/分析中/候选）；分析结果进组件 state（零落库）。

**参照现有 generateText 调用**（`ChapterWorkbench.tsx:73` 一带）：`await rendererBridge.generateText({ messages, ...model, projectId: novel.id, requestType: 'novel.emotionArc' })`。需先 Grep 确认 generateText 的完整参数形状（model 字段如何取）与 requestId 如何拿以便 cancel。

- [x] **Step 1: Grep 确认 generateText 参数与 cancel 用法**

Run: `git -C "F:/AIProject/Endless Creation" grep -n "generateText({" -- src/features/novel-creation/ChapterWorkbench.tsx`
Run: `git -C "F:/AIProject/Endless Creation" grep -n "cancelTextGeneration\|ensureTextModel\|requestId" -- src/features/novel-creation/ChapterWorkbench.tsx`
读取这些调用点的完整字节，确认：① generateText 的 model 参数怎么来（ensureTextModel 返回什么）；② requestId 从哪拿（generateText 入参还是返回值）；③ cancelTextGeneration 签名。按实际字节接线，不臆造。

- [x] **Step 2: 分析状态机 + runId**

在 EmotionArcPanel 加 state（analyzing 态、候选集合、逐章状态、runId ref）：

```tsx
  const runIdRef = useRef(0);
  const [phase, setPhase] = useState<'curve' | 'analyzing' | 'candidates'>('curve');
  const [progress, setProgress] = useState<{ done: number; total: number; current: string }>({ done: 0, total: 0, current: '' });
  const [chapterStates, setChapterStates] = useState<Map<string, 'success' | 'failed' | 'canceled' | 'unanalyzed'>>(new Map());
  const [candidates, setCandidates] = useState<Map<string, EmotionPointCandidate>>(new Map());
  const requestIdRef = useRef<string | null>(null);
```

- [x] **Step 3: 逐章分析循环（顺序、失败继续、runId 守门）**

加 `runAnalysis(targets: Chapter[])`。**Task 5 Step 1 确认真实签名后**按实际接线；结构如下（伪接线待 Step1 校准）：

```tsx
  async function runAnalysis(targets: Chapter[]) {
    const sorted = targets.slice().sort((a, b) => a.order - b.order);
    const myRun = ++runIdRef.current;
    setPhase('analyzing');
    setCandidates(new Map());
    setChapterStates(new Map());
    const total = sorted.length;
    for (let index = 0; index < total; index++) {
      if (runIdRef.current !== myRun) return; // 迟到/取消守门
      const chapter = sorted[index];
      setProgress({ done: index, total, current: chapter.title || '未命名章节' });
      try {
        const model = await ensureTextModel(); // 按 Step1 真实 API 校准
        const requestId = createRequestId();   // 按 Step1 真实取法校准
        requestIdRef.current = requestId;
        const result = await rendererBridge.generateText({
          messages: buildEmotionPrompt(novel, chapter, index, total),
          ...model,
          projectId: novel.id,
          requestType: 'novel.emotionArc',
          requestId,
        });
        if (runIdRef.current !== myRun) return; // 响应回来再次守门，丢弃迟到
        const parsed = parseEmotionResult(result.text ?? '', chapter);
        if (parsed.kind === 'ok') {
          setCandidates((prev) => new Map(prev).set(chapter.id, parsed.point));
          setChapterStates((prev) => new Map(prev).set(chapter.id, 'success'));
        } else {
          setChapterStates((prev) => new Map(prev).set(chapter.id, 'failed'));
        }
      } catch {
        if (runIdRef.current !== myRun) return;
        setChapterStates((prev) => new Map(prev).set(chapter.id, 'failed'));
      }
    }
    if (runIdRef.current === myRun) setPhase('candidates');
  }
```

- [x] **Step 4: 停止分析 + 卸载/切换终止**

加停止函数 + useEffect 清理（novel.id 变化 & 卸载时终止）：

```tsx
  function stopAnalysis() {
    runIdRef.current++; // 作废当前循环
    if (requestIdRef.current) void rendererBridge.cancelTextGeneration(requestIdRef.current);
    // 当前章 canceled、未开始 unanalyzed 由循环 return 后的状态推导；已完成候选保留
    setPhase('candidates');
  }

  useEffect(() => {
    return () => {
      runIdRef.current++;
      if (requestIdRef.current) void rendererBridge.cancelTextGeneration(requestIdRef.current);
    };
  }, [novel.id]);
```

- [x] **Step 5: 分析中态 UI（进度 + 停止分析按钮）**

在 render 加 analyzing 态分支（phase === 'analyzing'）：进度文本「分析中 {done}/{total} · {current}」+「停止分析」按钮（onClick=stopAnalysis）。「分析情绪」按钮在 analyzing 态禁用。空态/曲线态的「分析情绪」按钮 onClick 改为 `runAnalysis(有正文章集合)`。

- [x] **Step 6: build 验证**

Run: `cd "F:/AIProject/Endless Creation" && npm run build`
Expected: exit 0。

- [x] **Step 7: 暂存不 commit**

Run: `git -C "F:/AIProject/Endless Creation" add -A`

---

### Task 6: 候选确认 UI + 单章重分析（闭合闭环）

**Files:**
- Modify: `src/features/novel-creation/EmotionArcPanel.tsx`

**Interfaces:**
- Consumes: Task 1 `upsertEmotionPoints`、`readEmotionArc`；Task 5 candidates/chapterStates state。
- Produces: 候选态确认落库、单章重分析入口，完成闭环。

- [x] **Step 1: 候选态 UI（预览虚线 + 复选清单 + 确认/取消）**

在 candidates 态渲染：
- 曲线区叠加候选虚线（只画当前**勾选**的候选点；已确认实线仍在）。
- 清单区：成功候选每行复选框（默认勾选）+ 标题 + 分值 + 依据；全选/清空按钮；失败/取消/未分析章显示状态标签不可勾选。
- 底部：「确认落库」（零勾选禁用）+「取消」。

加勾选 state：
```tsx
  const [checked, setChecked] = useState<Set<string>>(new Set());
```
进入候选态时初始化 checked = 所有 success 候选的 chapterId（默认全选）。虚线 points 由 `marks` 中 chapterId ∈ checked 且有候选的点构成，实时随 checked 更新。

- [x] **Step 2: 确认落库（upsert 勾选项 + 检查 ok + 保留候选于失败）**

```tsx
  function confirmCandidates() {
    const selected = Array.from(checked)
      .map((chapterId) => candidates.get(chapterId))
      .filter((point): point is EmotionPointCandidate => Boolean(point));
    if (!selected.length) return;
    const result = upsertEmotionPoints(novel, selected);
    if (result.ok && result.arc) {
      setArc(result.arc);          // 刷新曲线
      setCandidates(new Map());
      setChecked(new Set());
      setPhase('curve');
    } else {
      window.alert(result.message || '保存失败，请重试'); // 失败保留候选、不清空
    }
  }
```
「取消」→ `setCandidates(new Map()); setChecked(new Set()); setPhase('curve');`（零落库）。

- [x] **Step 3: 单章重分析入口（SVG 标记详情弹层）**

曲线态点击/聚焦某章标记（实心点或空心缺口）→ 弹详情层（标题 + 分值或「暂无分值」+ 依据）+「重新分析本章」按钮。加 state：
```tsx
  const [detailChapterId, setDetailChapterId] = useState<string | null>(null);
```
点标记 → setDetailChapterId(chapterId)。详情层「重新分析本章」→ 找到该 chapter → `runAnalysis([chapter])`（复用 Task 5 循环，单章集合）。无正文章禁用该按钮 + 提示「本章暂无正文」。

- [x] **Step 4: build 验证**

Run: `cd "F:/AIProject/Endless Creation" && npm run build`
Expected: exit 0。

- [x] **Step 5: 暂存不 commit**

Run: `git -C "F:/AIProject/Endless Creation" add -A`

---

### Task 7: 路线图打勾 + 全量验收 + 唯一 commit

**Files:**
- Modify: `docs/plans/2026-07-06-v1-roadmap-adjusted.md`
- 无新代码。

**Interfaces:**
- Consumes: Task 1-6 全部改动（已暂存未提交）。
- Produces: 唯一 commit `feat: 增加小说情感曲线分析`。

- [x] **Step 1: 路线图 Phase 4 情感曲线项打勾**

Read `docs/plans/2026-07-06-v1-roadmap-adjusted.md` 第 116 行。Edit：
```
- [x] 情感曲线闭环：按章节 AI 分析情绪、按 novelId 持久化、支持重新分析并展示真实曲线；完成前不得进入 Phase 4。（2026-07-10 已实现）
```

- [x] **Step 2: 双端 build 终检**

Run: `cd "F:/AIProject/Endless Creation" && npm run build`
Expected: exit 0（renderer tsc+vite + electron tsc）。

- [x] **Step 3: 无 schema/IPC 改动审计**

Run: `git -C "F:/AIProject/Endless Creation" diff --cached --stat -- src/types/novel.ts electron/preload/bridgeTypes.ts electron/main/index.ts src/services/rendererBridge.ts`
Expected: 无输出（四禁改文件零改动）。

- [x] **Step 4: git diff --check + 文本完整性**

Run: `git -C "F:/AIProject/Endless Creation" diff --cached --check`
Expected: 无空白错误/冲突标记。
Run: `python "C:\Users\x1176\.codex\skills\endless-creation-guardrails\scripts\scan_text_integrity.py" "F:\AIProject\Endless Creation\src"`
Expected: TEXT INTEGRITY OK。

- [x] **Step 5: GUI 全量验收（真机开 Electron）**

> 2026-07-11：Electron 真机验收由用户确认完成。

`npm run dev:electron`，按 spec §6 验收清单逐条（36 项）跑关键路径：
- **自检**：app 启动无自检抛错（A9：assertEmotionArcSelfCheck 跑通）。
- **分析闭环**：详情页 emotion tab → 分析情绪 → 逐章进度 → 候选态 → 勾选 → 确认落库 → 曲线出实线（B/C 组）。
- **持久化**：刷新 + 重启，曲线保留（A1）。
- **两本小说互不覆盖**（A2）：A、B 各分析确认，互不删。
- **单章重分析**：点某章标记 → 重新分析本章 → 确认覆盖（B12）。
- **停止/切换终止**：分析中点停止 / 切 tab → 无后续调用、成本不增（B15/B17）。
- **空心缺口**：失败章显示空心标记、可点重分析（D28）。

- [x] **Step 6: 清理 + 唯一 commit**

Run:
```bash
git -C "F:/AIProject/Endless Creation" add -A
git -C "F:/AIProject/Endless Creation" commit -m "feat: 增加小说情感曲线分析"
```
Expected: 提交成功。含：emotionArc.ts、EmotionArcPanel.tsx、EmotionArcPanel.css、NovelCreation.tsx、icons.tsx、roadmap.md、spec.md。

- [x] **Step 7: 提交后核对**

Run: `git -C "F:/AIProject/Endless Creation" show --stat HEAD | head -20`
Expected: 单 commit、文件清单符合、工作区干净。**是否 push 由 PO 决定，本计划不自动 push。**

---

## Self-Review

**Spec 覆盖对照**（spec §1-§6 → task）：
- §1 数据模型/mergeEmotionPoints/read/upsert/IO spread/自检 → Task 1 ✓
- §2 AI 链路/buildPrompt/parse/固定标尺/上下文限定/runId/取消/归账 → Task 2（prompt/parse）+ Task 5（链路/runId/取消/归账）✓
- §3 三态/候选预览/虚线实时/复选/单章入口/空心缺口 → Task 4（曲线/空态）+ Task 5（三态）+ Task 6（候选/单章）✓
- §4 SVG 渲染/实心点+空心缺口/键盘可达/密集抽稀/8 tab/ChartIcon → Task 3（tab/图标）+ Task 4（渲染）✓
- §5 影响文件 → Task 1-7 全覆盖 ✓
- §6 验收 A-E → Task 7 全量对账 + 各 Task build ✓

**Placeholder 扫描**：无 TBD/TODO。Task 5 的 generateText 接线标注「按 Step1 真实字节校准」——给了 Grep 命令 + 结构骨架，非臆造符号（generateText/cancelTextGeneration/requestType 已在现有代码确认存在，仅 model/requestId 取法需实测）。

**类型一致性**：`EmotionPointCandidate`/`EmotionPoint`/`EmotionArc`/`mergeEmotionPoints(current,novel,points,now)`/`readEmotionArc(novelId)`/`upsertEmotionPoints(novel,points):{ok,arc?,message?}`/`parseEmotionResult(text,chapter):ParsedEmotionPoint`/`buildEmotionPrompt(novel,chapter,index,total)` 在 Task 1/2/4/5/6 引用一致。ProjectViewTab 加 emotion（Task 3）。phase 三态 'curve'|'analyzing'|'candidates'（Task 5/6 一致）。

**实现期依赖真实字节的点**（已标 Grep 命令，非 placeholder）：generateText 的 model 参数取法 + requestId 取法 + cancelTextGeneration 签名（Task 5 Step 1）、app 自检调用点（Task 1 Step 6）、ChartIcon 8c016cc 字节（Task 3 Step 1）、ProjectViewTab/PROJECT_VIEW_TABS/graph 挂载点行号（Task 3）。
