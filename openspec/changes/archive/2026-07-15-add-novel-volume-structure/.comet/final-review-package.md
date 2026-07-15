# Final whole-branch review package — add-novel-volume-structure

Base (merge-base main): 6dc6c496a824fcacf9071cc2eaa54b296afb6cd9
HEAD: 5b3258aeaa13ea562375b6a3cae029500600eab9
NOTE: diff below is merge-base -> WORKING TREE, so it includes the uncommitted NovelCreation.css polish (part of this change, not yet committed).

## Commits on branch
5b3258a chore: record volume structure verification
266146d fix: preserve volume order when opening novels
2b13d96 chore: complete volume management UI task
757d7e9 feat: add volume management and grouped navigation UI
ae10b76 chore: complete volume order consumer task
f7c1026 fix: route character graph story context through orderedChapters
088448a fix: route dropChapter and emotion arc through orderedChapters
6080b04 feat: route order consumers through orderedChapters
8284b23 test: 补齐卷结构自检的跨卷移动源侧与删卷归一断言
9d03ffa feat: add volume-aware chapter structure functions
faa3e09 chore: check off Task 1 (schema v7) after review
a693ab4 fix: align web novel migration order normalization with electron
5b6ac00 feat: add novel volume schema v7 with compatible migration
bb7c13e chore: add subagent progress checkpoint
dd9995a chore: add novel volume structure implementation plan

## Diffstat (merge-base -> working tree, source only)
 electron/main/index.ts                           |  68 ++++++-
 electron/preload/bridgeTypes.ts                  |  12 +-
 src/features/novel-creation/ChapterWorkbench.css |  18 ++
 src/features/novel-creation/ChapterWorkbench.tsx |  32 ++--
 src/features/novel-creation/EmotionArcPanel.tsx  |   3 +-
 src/features/novel-creation/NovelCreation.css    | 165 +++++++++++++++++
 src/features/novel-creation/NovelCreation.tsx    | 101 +++--------
 src/features/novel-creation/NovelStats.tsx       |   3 +-
 src/features/novel-creation/VolumeOutline.tsx    | 179 ++++++++++++++++++
 src/features/novel-creation/characterGraph.ts    |   4 +-
 src/features/novel-creation/novelExport.ts       |  19 +-
 src/features/novel-creation/novelNavigation.tsx  |   9 +-
 src/features/novel-creation/novelPrompts.ts      |  12 +-
 src/features/novel-creation/novelStructure.ts    | 222 +++++++++++++++++++++++
 src/services/rendererBridge.ts                   |  61 ++++++-
 src/types/novel.ts                               |  12 +-
 16 files changed, 805 insertions(+), 115 deletions(-)

## Full diff (merge-base -> working tree, source only, -U10)
diff --git a/electron/main/index.ts b/electron/main/index.ts
index de6f08a..4dc90e6 100644
--- a/electron/main/index.ts
+++ b/electron/main/index.ts
@@ -113,29 +113,38 @@ interface AiUsageRecord {
 }
 
 interface ChapterVersion {
   id: string;
   content: string;
   createdAt: string;
 }
 
 type ChapterStatus = 'draft' | 'inProgress' | 'done';
 
+interface Volume {
+  id: string;
+  title: string;
+  order: number;
+  createdAt: string;
+  updatedAt: string;
+}
+
 interface Chapter {
   id: string;
   title: string;
   content: string;
   outline?: string;
   versions?: ChapterVersion[];
   selectedVersionId?: string;
   status?: ChapterStatus;
   wordTarget?: number;
+  volumeId?: string;
   order: number;
   createdAt: string;
   updatedAt: string;
 }
 
 interface Foreshadowing {
   id: string;
   title: string;
   plantedChapterId: string;
   status: 'planted' | 'paidOff';
@@ -187,28 +196,29 @@ interface CharacterGraph {
 
 interface Novel {
   id: string;
   title: string;
   summary: string;
   note: string;
   idea?: string;
   blueprint?: string;
   wordTarget?: number;
   projectId?: string;
+  volumes: Volume[];
   chapters: Chapter[];
   foreshadowings: Foreshadowing[];
   settings?: SettingEntry[];
   pinnedSettingIds?: string[];
   pinnedForeshadowingIds?: string[];
   emotionArc?: EmotionArc;
   characterGraph?: CharacterGraph;
-  version: 6;
+  version: 7;
   createdAt: string;
   updatedAt: string;
 }
 
 type NovelSummary = Pick<Novel, 'id' | 'title' | 'summary' | 'projectId' | 'createdAt' | 'updatedAt'> & {
   chapterCount: number;
   wordCount: number;
   filledChapterCount: number;
 };
 
@@ -708,61 +718,108 @@ function sanitizeCharacterGraph(value: unknown): CharacterGraph | undefined {
     && typeof item.name === 'string'
     && typeof item.role === 'string'
     && typeof item.description === 'string')) return undefined;
   if (!graph.relationships.every((item) => item
     && typeof item.from === 'string'
     && typeof item.to === 'string'
     && typeof item.label === 'string')) return undefined;
   return { characters: graph.characters, relationships: graph.relationships };
 }
 
+function sanitizeVolumes(value: unknown, now: string): Volume[] {
+  if (!Array.isArray(value)) return [];
+  return value
+    .map((entry): Volume | null => {
+      if (!entry || typeof entry !== 'object') return null;
+      const item = entry as Partial<Volume>;
+      if (typeof item.title !== 'string') return null;
+      return {
+        id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : randomUUID(),
+        title: item.title,
+        order: Number.isFinite(item.order) ? Number(item.order) : 0,
+        createdAt: typeof item.createdAt === 'string' ? item.createdAt : now,
+        updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : now,
+      };
+    })
+    .filter((volume): volume is Volume => volume !== null)
+    .sort((a, b) => a.order - b.order)
+    .map((volume, order) => ({ ...volume, order }));
+}
+
+function normalizeChapterGroupOrder(chapters: Chapter[], volumes: Volume[]): Chapter[] {
+  const volumeOrder = new Map(volumes.map((volume) => [volume.id, volume.order]));
+  const withPos = chapters.map((chapter, position) => ({ chapter, position }));
+  const groups = new Map<string, { chapter: Chapter; position: number }[]>();
+  for (const item of withPos) {
+    const key = item.chapter.volumeId && volumeOrder.has(item.chapter.volumeId) ? item.chapter.volumeId : '__unassigned__';
+    const bucket = groups.get(key) ?? [];
+    bucket.push(item);
+    groups.set(key, bucket);
+  }
+  const result: Chapter[] = [];
+  for (const bucket of groups.values()) {
+    bucket
+      .sort((a, b) => (a.chapter.order - b.chapter.order) || (a.position - b.position))
+      .forEach((item, order) => result.push({ ...item.chapter, order }));
+  }
+  return result;
+}
+
 function sanitizeNovel(value: unknown, fallbackId?: string): Novel | null {
   if (!value || typeof value !== 'object') return null;
   const candidate = value as Partial<Novel>;
   const id = safeNovelId(candidate.id) ?? fallbackId;
   if (!id) return null;
   const now = new Date().toISOString();
-  const chapters = Array.isArray(candidate.chapters) ? candidate.chapters.map((chapter, index): Chapter | null => {
+  const volumes = sanitizeVolumes(candidate.volumes, now);
+  const volumeIds = new Set(volumes.map((volume) => volume.id));
+  const rawChapters = Array.isArray(candidate.chapters) ? candidate.chapters.map((chapter, index): Chapter | null => {
     if (!chapter || typeof chapter !== 'object') return null;
     const item = chapter as Partial<Chapter>;
+    const volumeId = typeof item.volumeId === 'string' && item.volumeId.trim() && volumeIds.has(item.volumeId.trim())
+      ? item.volumeId.trim()
+      : undefined;
     return {
       id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : randomUUID(),
       title: typeof item.title === 'string' ? item.title : '',
       content: typeof item.content === 'string' ? item.content : '',
       outline: typeof item.outline === 'string' ? item.outline : undefined,
       versions: sanitizeChapterVersions(item.versions, now),
       selectedVersionId: typeof item.selectedVersionId === 'string' ? item.selectedVersionId : undefined,
       status: item.status === 'draft' || item.status === 'inProgress' || item.status === 'done' ? item.status : undefined,
       wordTarget: typeof item.wordTarget === 'number' && Number.isFinite(item.wordTarget) && item.wordTarget > 0 ? item.wordTarget : undefined,
+      volumeId,
       order: Number.isFinite(item.order) ? Number(item.order) : index,
       createdAt: typeof item.createdAt === 'string' ? item.createdAt : now,
       updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : now,
     };
-  }).filter((chapter): chapter is Chapter => chapter !== null).sort((a, b) => a.order - b.order) : [];
+  }).filter((chapter): chapter is Chapter => chapter !== null) : [];
+  const chapters = normalizeChapterGroupOrder(rawChapters, volumes);
 
   return {
     id,
     projectId: safeProjectId(candidate.projectId),
     title: typeof candidate.title === 'string' && candidate.title.trim() ? candidate.title : '\u672a\u547d\u540d\u5c0f\u8bf4',
     summary: typeof candidate.summary === 'string' ? candidate.summary : '',
     note: typeof candidate.note === 'string' ? candidate.note : '',
     idea: typeof candidate.idea === 'string' ? candidate.idea : undefined,
     blueprint: typeof candidate.blueprint === 'string' ? candidate.blueprint : undefined,
     wordTarget: typeof candidate.wordTarget === 'number' && Number.isFinite(candidate.wordTarget) && candidate.wordTarget > 0 ? candidate.wordTarget : undefined,
+    volumes,
     chapters,
     foreshadowings: sanitizeForeshadowings(candidate.foreshadowings, now),
     settings: sanitizeSettings(candidate.settings, now),
     pinnedSettingIds: sanitizeStringIds(candidate.pinnedSettingIds),
     pinnedForeshadowingIds: sanitizeStringIds(candidate.pinnedForeshadowingIds),
     emotionArc: sanitizeEmotionArc(candidate.emotionArc),
     characterGraph: sanitizeCharacterGraph(candidate.characterGraph),
-    version: 6,
+    version: 7,
     createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : now,
     updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : now,
   };
 }
 
 function sanitizeStringIds(value: unknown): string[] {
   if (!Array.isArray(value)) return [];
   return [...new Set(value.filter((id): id is string => typeof id === 'string' && id.trim() !== '').map((id) => id.trim()))];
 }
 
@@ -864,26 +921,27 @@ async function readNovelFile(id: string): Promise<Novel> {
 
 async function createNovel(input: unknown): Promise<{ ok: boolean; message: string; novel?: Novel }> {
   const candidate = input && typeof input === 'object' ? input as { title?: unknown; summary?: unknown; note?: unknown; projectId?: unknown } : {};
   const now = new Date().toISOString();
   const novel: Novel = {
     id: `novel-${randomUUID()}`,
     projectId: safeProjectId(candidate.projectId),
     title: typeof candidate.title === 'string' && candidate.title.trim() ? candidate.title.trim() : '\u672a\u547d\u540d\u5c0f\u8bf4',
     summary: typeof candidate.summary === 'string' ? candidate.summary : '',
     note: typeof candidate.note === 'string' ? candidate.note : '',
+    volumes: [],
     chapters: [],
     foreshadowings: [],
     settings: [],
     pinnedSettingIds: [],
     pinnedForeshadowingIds: [],
-    version: 6,
+    version: 7,
     createdAt: now,
     updatedAt: now,
   };
   return saveNovel(novel);
 }
 
 async function loadNovel(id: unknown): Promise<{ ok: boolean; message: string; novel?: Novel }> {
   const novelId = safeNovelId(id);
   if (!novelId) return { ok: false, message: '\u5c0f\u8bf4 ID \u65e0\u6548\u3002' };
   try {
diff --git a/electron/preload/bridgeTypes.ts b/electron/preload/bridgeTypes.ts
index 0cd1292..25782c8 100644
--- a/electron/preload/bridgeTypes.ts
+++ b/electron/preload/bridgeTypes.ts
@@ -105,29 +105,38 @@ export interface AiUsageListResult {
 }
 
 export interface ChapterVersion {
   id: string;
   content: string;
   createdAt: string;
 }
 
 export type ChapterStatus = 'draft' | 'inProgress' | 'done';
 
+export interface Volume {
+  id: string;
+  title: string;
+  order: number;
+  createdAt: string;
+  updatedAt: string;
+}
+
 export interface Chapter {
   id: string;
   title: string;
   content: string;
   outline?: string;
   versions?: ChapterVersion[];
   selectedVersionId?: string;
   status?: ChapterStatus;
   wordTarget?: number;
+  volumeId?: string;
   order: number;
   createdAt: string;
   updatedAt: string;
 }
 
 export interface Foreshadowing {
   id: string;
   title: string;
   plantedChapterId: string;
   status: 'planted' | 'paidOff';
@@ -178,28 +187,29 @@ export interface CharacterGraph {
 }
 
 export interface Novel {
   id: string;
   title: string;
   summary: string;
   note: string;
   idea?: string;
   blueprint?: string;
   wordTarget?: number;
+  volumes: Volume[];
   chapters: Chapter[];
   foreshadowings: Foreshadowing[];
   settings?: SettingEntry[];
   pinnedSettingIds?: string[];
   pinnedForeshadowingIds?: string[];
   emotionArc?: EmotionArc;
   characterGraph?: CharacterGraph;
-  version: 6;
+  version: 7;
   createdAt: string;
   updatedAt: string;
 }
 
 export type NovelSummary = Pick<Novel, 'id' | 'title' | 'summary' | 'createdAt' | 'updatedAt'> & {
   chapterCount: number;
   wordCount: number;
 };
 
 export interface EndlessCreationBridge {
diff --git a/src/features/novel-creation/ChapterWorkbench.css b/src/features/novel-creation/ChapterWorkbench.css
index 4cb5631..8e76f48 100644
--- a/src/features/novel-creation/ChapterWorkbench.css
+++ b/src/features/novel-creation/ChapterWorkbench.css
@@ -120,20 +120,38 @@
 .novel-workbench__list-head h3 {
   margin: 0;
   font-size: 15px;
 }
 
 .novel-workbench__chapters {
   display: grid;
   gap: 10px;
 }
 
+.novel-workbench__volume {
+  display: grid;
+  gap: 6px;
+}
+
+.novel-workbench__volume h4 {
+  display: flex;
+  justify-content: space-between;
+  margin: 6px 4px 2px;
+  color: var(--muted);
+  font-size: 12px;
+  font-weight: 700;
+}
+
+.novel-workbench__volume h4 span {
+  font-weight: 400;
+}
+
 .novel-workbench__chapter {
   display: grid;
   width: 100%;
   gap: 6px;
   border: 0;
   border-radius: 18px;
   padding: 13px 14px;
   text-align: left;
   background: #f8fafc;
 }
diff --git a/src/features/novel-creation/ChapterWorkbench.tsx b/src/features/novel-creation/ChapterWorkbench.tsx
index 60a27c3..a4c914f 100644
--- a/src/features/novel-creation/ChapterWorkbench.tsx
+++ b/src/features/novel-creation/ChapterWorkbench.tsx
@@ -3,20 +3,21 @@ import { rendererBridge } from '../../services/rendererBridge';
 import { novelService } from '../../services/novelService';
 import type { Chapter, ChapterVersion, Foreshadowing, Novel } from '../../types/novel';
 import { buildChapterFromOutlinePrompt, buildMissingOutlinePrompt, parseOutlineText, buildChapterReviewPrompt, buildOptimizeSelectionPrompt, buildChapterConsistencyPrompt, buildChapterRhythmPrompt, buildForeshadowingCandidatesPrompt, parseForeshadowingCandidates, buildForeshadowingPayoffCandidatesPrompt, parseForeshadowingPayoffCandidates, PINNED_CONTEXT_LIMIT, type OptimizeType, type TextMessage } from './novelPrompts';
 import { countWords, createId, formatTime, saveStatusLabel, type SaveStatus } from './novelShared';
 import { CHAPTER_STATUS_LABEL, CHAPTER_STATUS_ORDER, PROGRESS_LABELS, SOFT_GATE_HINTS, resolveChapterStatus } from './novelProgress';
 import { SETTING_LABELS, groupSettingsByType } from './novelSettings';
 import type { ChapterStatus as NovelChapterStatus } from '../../types/novel';
 import { ForeshadowingPanel, type ForeshadowingDraft, type ForeshadowingAiCandidate, type ForeshadowingPayoffAiCandidate } from './ForeshadowingPanel';
 import type { ChapterLocateRequest } from './novelNavigation';
 import { ChapterFindReplace, pushEditorHistory, redoEditorHistory, resetEditorHistory, undoEditorHistory, type EditorHistory, type EditorSnapshot, type TextMatch } from './novelEditorTools';
+import { groupChaptersByVolume } from './novelStructure';
 import './ChapterWorkbench.css';
 
 export type ReadyTextModel = { channelId: string; channelLabel?: string; baseUrl: string; apiKey: string; model: string };
 
 type ChapterStatus = 'done' | 'generating' | 'pending';
 type VersionPreviewState = { chapterId: string; activeVersionId: string; contentSnapshot: string };
 type OutlinePreviewEntry = { chapterId: string; label: string; title: string; outline: string };
 type SelectionState = { chapterId: string; start: number; end: number; text: string };
 type OptimizeJob = SelectionState & {
   status: 'loading' | 'success';
@@ -170,20 +171,21 @@ export function ChapterWorkbench({ novel, projectId, chapters, activeChapterId,
     consistency.setError('');
     rhythm.setError('');
     setForeshadowCandidates([]);
     setForeshadowPayoffCandidates([]);
     setForeshadowAiRawText('');
     setForeshadowAiError('');
   }, [activeChapterId]);
 
   const activeIndex = chapters.findIndex((chapter) => chapter.id === activeChapterId);
   const activeChapter = activeIndex >= 0 ? chapters[activeIndex] : null;
+  const chapterGroups = groupChaptersByVolume(novel);
 
   useEffect(() => {
     flushManualHistory();
     window.clearTimeout(manualHistoryTimerRef.current);
     pendingManualSnapshotRef.current = null;
     const content = activeChapter?.content ?? '';
     historyRef.current = resetEditorHistory({ content, selectionStart: content.length, selectionEnd: content.length });
   }, [activeChapterId]);
 
   useEffect(() => () => {
@@ -1126,32 +1128,38 @@ export function ChapterWorkbench({ novel, projectId, chapters, activeChapterId,
             <div><strong>{chapters.length}</strong><span>总章节</span></div>
             <div><strong>{doneCount}</strong><span>已完成</span></div>
             <div><strong>{pendingCount}</strong><span>未开始</span></div>
           </div>
           <div className="novel-workbench__list-head">
             <h3>章节大纲</h3>
             {firstPendingIndex >= 0 && <button className="novel-flow__ghost" disabled={busy} onClick={locateFirstPending} type="button">定位未完成</button>}
           </div>
           {chapters.length ? (
             <div className="novel-workbench__chapters">
-              {chapters.map((chapter, index) => {
-                const status = chapterStatus(chapter);
-                return (
-                  <button className={chapter.id === activeChapterId ? 'novel-workbench__chapter novel-workbench__chapter--active' : 'novel-workbench__chapter'} disabled={busy && generatingChapterId === null} id={`workbench-chapter-${chapter.id}`} key={chapter.id} onClick={() => selectChapter(chapter.id)} type="button">
-                    <span className="novel-workbench__chapter-row">
-                      <strong>第 {index + 1} 章 · {chapter.title || '未命名章节'}</strong>
-                      <span className={`novel-workbench__pill novel-workbench__pill--${status}`}>{statusLabel(status)}</span>
-                    </span>
-                    <span className="novel-workbench__chapter-outline">{brief(chapter.outline ?? '', 44) || '暂无大纲'}</span>
-                  </button>
-                );
-              })}
+              {chapterGroups.map((group) => group.chapters.length > 0 && (
+                <section className="novel-workbench__volume" key={group.volume?.id ?? 'unassigned'}>
+                  <h4>{group.volume?.title ?? '未分卷'}<span>{group.chapters.length} 章</span></h4>
+                  {group.chapters.map((chapter) => {
+                    const index = chapters.findIndex((item) => item.id === chapter.id);
+                    const status = chapterStatus(chapter);
+                    return (
+                      <button className={chapter.id === activeChapterId ? 'novel-workbench__chapter novel-workbench__chapter--active' : 'novel-workbench__chapter'} disabled={busy && generatingChapterId === null} id={`workbench-chapter-${chapter.id}`} key={chapter.id} onClick={() => selectChapter(chapter.id)} type="button">
+                        <span className="novel-workbench__chapter-row">
+                          <strong>第 {index + 1} 章 · {chapter.title || '未命名章节'}</strong>
+                          <span className={`novel-workbench__pill novel-workbench__pill--${status}`}>{statusLabel(status)}</span>
+                        </span>
+                        <span className="novel-workbench__chapter-outline">{brief(chapter.outline ?? '', 44) || '暂无大纲'}</span>
+                      </button>
+                    );
+                  })}
+                </section>
+              ))}
             </div>
           ) : (
             <div className="novel-workbench__side-empty">
               <strong>暂无章节</strong>
               <span>到项目详情的章节大纲页新增章节，或通过灵感模式生成大纲。</span>
             </div>
           )}
           {chapters.length > 0 && (
             <div className="novel-workbench__side-foot">
               <button className="novel-flow__primary novel-flow__primary--compact" disabled={busy || missingOutlineCount === 0} onClick={() => void generateMissingOutlines()} type="button">{outlineBusy ? '生成后续大纲中…' : '生成后续大纲'}</button>
diff --git a/src/features/novel-creation/EmotionArcPanel.tsx b/src/features/novel-creation/EmotionArcPanel.tsx
index 0e7590f..8fc34dc 100644
--- a/src/features/novel-creation/EmotionArcPanel.tsx
+++ b/src/features/novel-creation/EmotionArcPanel.tsx
@@ -1,14 +1,15 @@
 import { useEffect, useMemo, useRef, useState } from 'react';
 import { rendererBridge } from '../../services/rendererBridge';
 import type { Chapter, Novel } from '../../types/novel';
 import { createId } from './novelShared';
+import { orderedChapters } from './novelStructure';
 import {
   buildEmotionPrompt,
   mergeEmotionPoints,
   parseEmotionResult,
   type EmotionPointCandidate,
 } from './emotionArc';
 import './EmotionArcPanel.css';
 
 type ResultStatus = 'success' | 'failed' | 'canceled' | 'unanalyzed';
 interface AnalysisResult {
@@ -47,21 +48,21 @@ function lineSegments(points: Array<{ x: number; y: number } | null>): string[]
     else if (current.length) {
       segments.push(current.join(' '));
       current = [];
     }
   }
   if (current.length) segments.push(current.join(' '));
   return segments;
 }
 
 export function EmotionArcPanel({ novel, resolveModel, onUpdateNovel }: Props) {
-  const chapters = useMemo(() => [...novel.chapters].sort((a, b) => a.order - b.order), [novel.chapters]);
+  const chapters = useMemo(() => orderedChapters(novel), [novel]);
   const arc = novel.emotionArc ?? null;
   const [results, setResults] = useState<AnalysisResult[] | null>(null);
   const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
   const [busy, setBusy] = useState(false);
   const [progress, setProgress] = useState('');
   const [error, setError] = useState('');
   const [detailId, setDetailId] = useState<string | null>(null);
   const runRef = useRef(0);
   const requestIdRef = useRef<string | null>(null);
   const activeChapterIdRef = useRef<string | null>(null);
diff --git a/src/features/novel-creation/NovelCreation.css b/src/features/novel-creation/NovelCreation.css
index 112e24a..eb129c4 100644
--- a/src/features/novel-creation/NovelCreation.css
+++ b/src/features/novel-creation/NovelCreation.css
@@ -873,20 +873,21 @@
   color: #475569;
   font-size: 13px;
   font-weight: 800;
 }
 
 .novel-outline-card__head {
   display: flex;
   align-items: center;
   justify-content: space-between;
   gap: 8px;
+  flex-wrap: wrap;
 }
 
 .novel-outline-card__progress {
   display: flex;
   flex-wrap: wrap;
   gap: 10px;
 }
 
 .novel-outline-card__progress label {
   display: flex;
@@ -2219,20 +2220,34 @@
 
 .novel-outline-entry:focus-visible .novel-outline-card,
 .novel-outline-entry--drop-target .novel-outline-card {
   border-color: #6366f1;
   box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
 }
 
 .novel-outline-card__actions {
   display: flex;
   gap: 6px;
+  flex-wrap: wrap;
+  justify-content: flex-end;
+  margin-left: auto;
+}
+
+.novel-outline-card__actions .novel-flow__ghost {
+  flex: none;
+  padding-inline: 10px;
+  white-space: nowrap;
+}
+
+.novel-outline-card__actions select {
+  flex: 0 0 180px;
+  width: 180px;
 }
 
 .novel-outline-entry__marker {
   z-index: 1;
   display: grid;
   width: 32px;
   height: 32px;
   place-items: center;
   border-radius: 50%;
   color: #fff;
@@ -2261,20 +2276,170 @@
 
 .novel-outline-card > input:focus {
   box-shadow: none;
 }
 
 .novel-outline-card textarea {
   min-height: 74px;
   border-radius: 10px;
 }
 
+.novel-volume-outline {
+  display: grid;
+  gap: 16px;
+}
+
+.novel-volume-outline__toolbar {
+  display: flex;
+  align-items: end;
+  gap: 10px;
+  flex-wrap: wrap;
+}
+
+.novel-volume-outline__toolbar label {
+  display: grid;
+  gap: 6px;
+  min-width: min(280px, 100%);
+  color: var(--muted);
+  font-size: 12px;
+}
+
+.novel-volume-outline__toolbar input,
+.novel-volume__title input {
+  border: 1px solid var(--border);
+  background: var(--surface);
+  color: var(--ink);
+  border-radius: 8px;
+  padding: 9px 11px;
+}
+
+.novel-volume {
+  border: 1px solid var(--border);
+  border-radius: 10px;
+  background: color-mix(in srgb, var(--surface) 92%, var(--accent) 8%);
+  overflow: hidden;
+}
+
+.novel-volume--drop-target {
+  border-color: var(--accent);
+  box-shadow: inset 0 0 0 1px var(--accent);
+}
+
+.novel-volume__head {
+  display: flex;
+  align-items: flex-start;
+  justify-content: space-between;
+  gap: 12px;
+  flex-wrap: wrap;
+  padding: 12px 14px;
+  border-bottom: 1px solid var(--border);
+}
+
+.novel-volume__title,
+.novel-volume__actions {
+  display: flex;
+  align-items: center;
+  gap: 8px;
+  flex-wrap: wrap;
+}
+
+.novel-volume__title {
+  flex: 1 1 280px;
+  min-width: 0;
+}
+
+.novel-volume__actions {
+  flex: none;
+  flex-wrap: nowrap;
+  justify-content: flex-end;
+  margin-left: auto;
+}
+
+.novel-volume__actions .novel-flow__ghost {
+  padding-inline: 10px;
+  white-space: nowrap;
+}
+
+.novel-volume__title > span,
+.novel-volume__title small {
+  color: var(--muted);
+  font-size: 12px;
+}
+
+.novel-volume__title input {
+  min-width: 180px;
+  font-weight: 700;
+}
+
+.novel-volume__chapters {
+  display: grid;
+  gap: 10px;
+  padding: 12px;
+}
+
+.novel-outline-card--drop-target {
+  border-color: var(--accent);
+  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 24%, transparent);
+}
+
+.novel-volume__drop-end {
+  min-height: 6px;
+  border-radius: 4px;
+}
+
+.novel-volume__drop-end--active {
+  background: var(--accent);
+}
+
+.novel-volume__empty {
+  margin: 12px;
+  padding: 20px;
+  border: 1px dashed var(--border);
+  border-radius: 8px;
+  text-align: center;
+  color: var(--muted);
+  font-size: 13px;
+}
+
+.novel-content-groups {
+  display: grid;
+  gap: 18px;
+}
+
+.novel-content-group > header {
+  display: flex;
+  justify-content: space-between;
+  align-items: center;
+  margin-bottom: 8px;
+  color: var(--muted);
+}
+
+.novel-content-group > header strong {
+  color: var(--ink);
+}
+
+@media (max-width: 720px) {
+  .novel-volume__head {
+    align-items: flex-start;
+    flex-direction: column;
+  }
+
+  .novel-volume__title input {
+    min-width: 0;
+    width: 100%;
+  }
+
+  .novel-outline-card__actions select {
+    max-width: 140px;
+  }
+}
+
 .novel-content-list {
   grid-template-columns: repeat(2, minmax(0, 1fr));
 }
 
 .novel-content-card {
   display: grid;
   grid-template-columns: 34px minmax(0, 1fr);
   min-width: 0;
   gap: 14px;
   padding: 18px;
diff --git a/src/features/novel-creation/NovelCreation.tsx b/src/features/novel-creation/NovelCreation.tsx
index 31f4dd9..2b1f370 100644
--- a/src/features/novel-creation/NovelCreation.tsx
+++ b/src/features/novel-creation/NovelCreation.tsx
@@ -7,24 +7,25 @@ import { buildBlueprintFromConversationPrompt, buildInspirationChatPrompt, build
 import { buildCharacterGraphPrompt, parseCharacterGraph } from './characterGraph';
 import { NovelCharacterGraphPanel } from './NovelCharacterGraph';
 import { NovelErrorBanner, NovelListSkeleton } from './NovelSkeletons';
 import { ChapterWorkbench } from './ChapterWorkbench';
 import { ForeshadowingPanel, type ForeshadowingDraft } from './ForeshadowingPanel';
 import { NovelStats } from './NovelStats';
 import { EmotionArcPanel } from './EmotionArcPanel';
 import { SettingPanel } from './SettingPanel';
 import type { SettingDraft } from './novelSettings';
 import { countWords, createId, formatTime, type SaveStatus } from './novelShared';
-import { CHAPTER_STATUS_LABEL, CHAPTER_STATUS_ORDER, PROGRESS_LABELS, resolveChapterStatus } from './novelProgress';
-import type { ChapterStatus as NovelChapterStatus } from '../../types/novel';
+import { CHAPTER_STATUS_LABEL, PROGRESS_LABELS, resolveChapterStatus } from './novelProgress';
 import { copyWholeBookMarkdown, exportOfflinePackage, exportStoryboardDocFile, exportWholeBookMarkdownFile } from './novelExport';
-import { ChapterSearchPanel, reorderChapters, type ChapterLocateRequest, type ChapterSearchResult } from './novelNavigation';
+import { ChapterSearchPanel, type ChapterLocateRequest, type ChapterSearchResult } from './novelNavigation';
+import { deleteChapterInStructure, groupChaptersByVolume, orderedChapters } from './novelStructure';
+import { VolumeOutline } from './VolumeOutline';
 import { migrateLegacyNovelAnalysis } from './novelAnalysisPersistence';
 import './NovelCreation.css';
 
 type NovelView = 'creationCenter' | 'projectList' | 'projectView' | 'inspirationIntro' | 'inspirationPreparing' | 'inspirationChat' | 'inspirationBlueprint' | 'inspirationOutline' | 'workbench';
 type ProjectViewTab = 'overview' | 'world' | 'characters' | 'graph' | 'outline' | 'chapters' | 'emotion' | 'foreshadowing';
 type InspirationBusy = 'idle' | 'chat' | 'blueprint' | 'outline';
 type ChatBubble = InspirationChatMessage & { id: string };
 type NovelForm = { title: string; summary: string; note: string };
 interface ModelPreferences { textModel?: string; textModels?: string[]; }
 interface ApiProviderChannel { id: string; name?: string; baseUrl?: string; apiKey?: string; apiFormat?: string; enabled?: boolean; models?: string[]; }
@@ -45,22 +46,20 @@ const PROJECT_VIEW_TABS = [
   { id: 'outline', label: '章节大纲', description: '故事结构规划', Icon: ListIcon },
   { id: 'chapters', label: '章节内容', description: '生成状态与摘要', Icon: BookIcon },
   { id: 'foreshadowing', label: '伏笔管理', description: '故事线索与回收', Icon: BoltIcon },
   { id: 'emotion', label: '情感曲线', description: '全书情绪起伏与基调', Icon: ChartIcon },
 ] as const satisfies readonly { id: ProjectViewTab; label: string; description: string; Icon: typeof ProjectIcon }[];
 
 export function NovelCreation({ projectId }: { projectId: string }) {
   const [summaries, setSummaries] = useState<NovelSummary[]>([]);
   const [currentNovel, setCurrentNovel] = useState<Novel | null>(null);
   const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
-  const [draggedChapterId, setDraggedChapterId] = useState<string | null>(null);
-  const [dragOverChapterId, setDragOverChapterId] = useState<string | null>(null);
   const [pendingLocate, setPendingLocate] = useState<ChapterLocateRequest | null>(null);
   const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
   const [feedback, setFeedback] = useState('');
   const [isLoading, setLoading] = useState(true);
   const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
   const [form, setForm] = useState<NovelForm>(emptyForm);
   const [modelPreferences, setModelPreferences] = useState<ModelPreferences>(() => readLocalStorage(MODEL_PREFERENCES_STORAGE_KEY, {}));
   const [apiProviderStore, setApiProviderStore] = useState<ApiProviderStore>(() => readLocalStorage(API_PROVIDER_STORAGE_KEY, {}));
   const [view, setView] = useState<NovelView>('creationCenter');
   const [projectViewTab, setProjectViewTab] = useState<ProjectViewTab>('overview');
@@ -85,21 +84,21 @@ export function NovelCreation({ projectId }: { projectId: string }) {
   const chatEndRef = useRef<HTMLDivElement | null>(null);
   const chatInputRef = useRef<HTMLTextAreaElement | null>(null);
   const projectPanelRef = useRef<HTMLElement | null>(null);
   const lastProjectIdRef = useRef(projectId);
   const lastValidChapterRef = useRef(new Map<string, string>());
   const [graphBusy, setGraphBusy] = useState(false);
   const [graphError, setGraphError] = useState('');
   const graphRequestIdRef = useRef<string | null>(null);
   const graphRunRef = useRef(0);
 
-  const chapters = useMemo(() => [...(currentNovel?.chapters ?? [])].sort((a, b) => a.order - b.order), [currentNovel]);
+  const chapters = useMemo(() => (currentNovel ? orderedChapters(currentNovel) : []), [currentNovel]);
   const graphData = currentNovel?.characterGraph ?? null;
   const selectedTextModel = useMemo(() => resolveTextModel(modelPreferences, apiProviderStore), [apiProviderStore, modelPreferences]);
   const chatUserTurns = chatMessages.filter((message) => message.role === 'user').length;
   const chatStage = Math.min(chatUserTurns, INSPIRATION_STAGES.length - 1);
 
   useEffect(() => {
     if (view === 'inspirationChat') chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
   }, [chatMessages, inspirationBusy, view]);
 
   useEffect(() => {
@@ -214,21 +213,21 @@ export function NovelCreation({ projectId }: { projectId: string }) {
     if (currentNovel && saveStatus !== 'saved') await novelService.saveNovel(currentNovel);
     const result = await novelService.loadNovel(id);
     if (!result.ok || !result.novel) {
       setFeedback(result.message || '小说文件损坏。');
       setCurrentNovel(null);
       setActiveChapterId(null);
       return false;
     }
     const novel = await migrateLegacyNovelAnalysis(result.novel, window.localStorage, (next) => novelService.saveNovel(next));
     setCurrentNovel(novel);
-    setActiveChapterId(novel.chapters[0]?.id ?? null);
+    setActiveChapterId(orderedChapters(novel)[0]?.id ?? null);
     setSaveStatus('saved');
     setFeedback('');
     return true;
   }
 
   async function openProjectView(id: string) {
     if (!await openNovel(id)) return;
     setInitialForeshadowPanel(false);
     setWorkbenchReturnTab(null);
     setExportMenuOpen(false);
@@ -356,47 +355,24 @@ export function NovelCreation({ projectId }: { projectId: string }) {
       if (result.novel) setCurrentNovel((current) => current && current.id === result.novel?.id ? { ...current, updatedAt: result.novel.updatedAt } : current);
       void loadSummaries();
     });
   }
 
   function deleteChapterById(chapterId: string) {
     const index = chapters.findIndex((chapter) => chapter.id === chapterId);
     if (index < 0) return;
     const chapter = chapters[index];
     if (!window.confirm(`确定删除「第 ${index + 1} 章 · ${chapter.title || '未命名章节'}」吗？本章大纲与正文将一并删除，不可恢复。`)) return;
-    const now = new Date().toISOString();
-    updateNovel((novel) => ({
-      ...novel,
-      updatedAt: now,
-      chapters: novel.chapters.filter((item) => item.id !== chapterId).sort((a, b) => a.order - b.order).map((item, order) => ({ ...item, order })),
-    }));
+    updateNovel((novel) => deleteChapterInStructure(novel, chapterId));
     setActiveChapterId((current) => current === chapterId ? null : current);
   }
 
-  function moveChapter(chapterId: string, offset: number) {
-    const fromIndex = chapters.findIndex((chapter) => chapter.id === chapterId);
-    const toIndex = fromIndex + offset;
-    if (fromIndex < 0 || toIndex < 0 || toIndex >= chapters.length) return;
-    const now = new Date().toISOString();
-    updateNovel((novel) => ({ ...novel, chapters: reorderChapters(novel.chapters, fromIndex, toIndex), updatedAt: now }));
-  }
-
-  function dropChapter(targetChapterId: string) {
-    const fromIndex = chapters.findIndex((chapter) => chapter.id === draggedChapterId);
-    const toIndex = chapters.findIndex((chapter) => chapter.id === targetChapterId);
-    setDraggedChapterId(null);
-    setDragOverChapterId(null);
-    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;
-    const now = new Date().toISOString();
-    updateNovel((novel) => ({ ...novel, chapters: reorderChapters(novel.chapters, fromIndex, toIndex), updatedAt: now }));
-  }
-
   async function openSearchResult(result: ChapterSearchResult) {
     setPendingLocate(result.field === 'content' ? {
       chapterId: result.chapterId,
       offset: result.matchOffset,
       text: result.matchedText,
       requestId: Date.now(),
     } : null);
     await openProjectWorkbench(currentNovel?.id ?? '', result.chapterId);
   }
 
@@ -1004,72 +980,49 @@ export function NovelCreation({ projectId }: { projectId: string }) {
                     pinLimitReached={(currentNovel.pinnedSettingIds?.length ?? 0) + (currentNovel.pinnedForeshadowingIds?.length ?? 0) >= PINNED_CONTEXT_LIMIT}
                     onTogglePin={togglePinnedSetting}
                   />
                 )}
                 {projectViewTab === 'graph' && (
                   <NovelCharacterGraphPanel graph={graphData} busy={graphBusy} error={graphError} onDeduce={() => void deduceCharacterGraph()} />
                 )}
                 {projectViewTab === 'outline' && (
                   <>
                     <div className="novel-project-panel__head">
-                      <div className="novel-project-panel__heading"><h2>章节大纲</h2><p>按章节梳理故事结构与创作进度</p></div>
-                      <button className="novel-flow__primary novel-flow__primary--compact" onClick={addChapter} type="button">新增章节</button>
+                      <div className="novel-project-panel__heading"><h2>章节大纲</h2><p>按卷组织章节，梳理故事结构与创作进度</p></div>
                     </div>
-                    {chapters.length ? <div className="novel-outline-list">{chapters.map((chapter, index) => (
-                      <div
-                        aria-label={`第 ${index + 1} 章，可拖拽调整顺序`}
-                        className={dragOverChapterId === chapter.id && draggedChapterId !== chapter.id ? 'novel-outline-entry novel-outline-entry--drop-target' : 'novel-outline-entry'}
-                        draggable
-                        key={chapter.id}
-                        onDragEnd={() => { setDraggedChapterId(null); setDragOverChapterId(null); }}
-                        onDragOver={(event) => { event.preventDefault(); setDragOverChapterId(chapter.id); }}
-                        onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; setDraggedChapterId(chapter.id); }}
-                        onDrop={(event) => { event.preventDefault(); dropChapter(chapter.id); }}
-                        tabIndex={0}
-                      >
-                        <span className="novel-outline-entry__marker" aria-hidden="true">{index + 1}</span>
-                        <article className="novel-outline-card">
-                          <div className="novel-outline-card__head">
-                            <span>第 {index + 1} 章</span>
-                            <div className="novel-outline-card__actions">
-                              <button aria-label={`上移第 ${index + 1} 章`} className="novel-flow__ghost" disabled={index === 0} onClick={() => moveChapter(chapter.id, -1)} type="button">上移</button>
-                              <button aria-label={`下移第 ${index + 1} 章`} className="novel-flow__ghost" disabled={index === chapters.length - 1} onClick={() => moveChapter(chapter.id, 1)} type="button">下移</button>
-                              <button className="novel-flow__ghost" onClick={() => deleteChapterById(chapter.id)} type="button">删除</button>
-                            </div>
-                          </div>
-                          <input value={chapter.title} onChange={(event) => updateChapterById(chapter.id, { title: event.target.value })} placeholder="未命名章节" />
-                          <div className="novel-outline-card__progress">
-                            <label><span>{PROGRESS_LABELS.statusCompletion.slice(0, 2)}</span><select value={resolveChapterStatus(chapter)} onChange={(event) => updateChapterByIdAndSave(chapter.id, { status: event.target.value as NovelChapterStatus })}>{CHAPTER_STATUS_ORDER.map((status) => <option key={status} value={status}>{CHAPTER_STATUS_LABEL[status]}</option>)}</select></label>
-                            <label><span>{PROGRESS_LABELS.chapterTarget}</span><input type="number" min={0} step={100} value={chapter.wordTarget ?? ''} onChange={(event) => { const raw = Number(event.target.value); updateChapterByIdAndSave(chapter.id, { wordTarget: Number.isFinite(raw) && raw > 0 ? Math.round(raw) : undefined }); }} placeholder={PROGRESS_LABELS.targetPlaceholder} /></label>
-                          </div>
-                          <textarea value={chapter.outline ?? ''} onChange={(event) => updateChapterById(chapter.id, { outline: event.target.value })} placeholder="本章故事结构规划…" />
-                        </article>
-                      </div>
-                    ))}</div> : <EmptyState title="暂无章节大纲" text="新增章节后，可以在这里补充每章的故事规划。" />}
+                    <VolumeOutline novel={currentNovel} onAddChapter={addChapter} onDeleteChapter={deleteChapterById} onUpdateChapter={updateChapterById} onUpdateChapterAndSave={updateChapterByIdAndSave} onUpdateNovel={updateNovel} />
                   </>
                 )}
                 {projectViewTab === 'chapters' && (
                   <>
                     <div className="novel-project-panel__head">
                       <div className="novel-project-panel__heading"><h2>章节内容</h2><p>查看章节生成状态、摘要并进入现有工作台</p></div>
                       <button className="novel-flow__primary novel-flow__primary--compact" onClick={() => void openProjectWorkbench(currentNovel.id)} type="button">开始创作</button>
                     </div>
-                    {chapters.length ? <div className="novel-content-list">{chapters.map((chapter, index) => (
-                      <button className="novel-content-card" key={chapter.id} onClick={() => void openProjectWorkbench(currentNovel.id, chapter.id)} type="button">
-                        <span className="novel-content-card__index">{index + 1}</span>
-                        <span className="novel-content-card__copy">
-                          <strong>{chapter.title || '未命名章节'}</strong>
-                          <span>{countWords(chapter.content)} 字 · {CHAPTER_STATUS_LABEL[resolveChapterStatus(chapter)]}</span>
-                          <p>{chapter.outline?.trim() || '暂无章节大纲'}</p>
-                          <small>{chapter.content.trim() ? chapter.content.trim().slice(0, 120) : '暂无正文'}</small>
-                        </span>
-                      </button>
+                    {chapters.length ? <div className="novel-content-groups">{groupChaptersByVolume(currentNovel).map((group) => group.chapters.length > 0 && (
+                      <section className="novel-content-group" key={group.volume?.id ?? 'unassigned'}>
+                        <header><strong>{group.volume?.title ?? '未分卷'}</strong><span>{group.chapters.length} 章</span></header>
+                        <div className="novel-content-list">{group.chapters.map((chapter) => {
+                          const index = chapters.findIndex((item) => item.id === chapter.id);
+                          return (
+                            <button className="novel-content-card" key={chapter.id} onClick={() => void openProjectWorkbench(currentNovel.id, chapter.id)} type="button">
+                              <span className="novel-content-card__index">{index + 1}</span>
+                              <span className="novel-content-card__copy">
+                                <strong>{chapter.title || '未命名章节'}</strong>
+                                <span>{countWords(chapter.content)} 字 · {CHAPTER_STATUS_LABEL[resolveChapterStatus(chapter)]}</span>
+                                <p>{chapter.outline?.trim() || '暂无章节大纲'}</p>
+                                <small>{chapter.content.trim() ? chapter.content.trim().slice(0, 120) : '暂无正文'}</small>
+                              </span>
+                            </button>
+                          );
+                        })}</div>
+                      </section>
                     ))}</div> : <EmptyState title="暂无章节内容" text="新增章节后，可以进入编辑器开始写正文。" />}
                   </>
                 )}
                 {projectViewTab === 'emotion' && (
                   <EmotionArcPanel novel={currentNovel} resolveModel={ensureTextModelReady} onUpdateNovel={updateNovel} />
                 )}
                 {projectViewTab === 'foreshadowing' && (
                   <ForeshadowingPanel
                     variant="embedded"
                     title="伏笔管理"
diff --git a/src/features/novel-creation/NovelStats.tsx b/src/features/novel-creation/NovelStats.tsx
index 3855900..08fe41e 100644
--- a/src/features/novel-creation/NovelStats.tsx
+++ b/src/features/novel-creation/NovelStats.tsx
@@ -1,32 +1,33 @@
 import { useEffect, useState } from 'react';
 import { rendererBridge } from '../../services/rendererBridge';
 import type { AiUsageRecord } from '../../types/apiProvider';
 import type { Novel } from '../../types/novel';
+import { orderedChapters } from './novelStructure';
 import { countWords } from './novelShared';
 import { CHAPTER_STATUS_LABEL, CHAPTER_STATUS_ORDER, PROGRESS_LABELS, formatPercent, summarizeProgress } from './novelProgress';
 
 function briefTitle(title: string, max: number): string {
   const normalized = title.replace(/\s+/g, ' ').trim();
   if (!normalized) return '未命名章节';
   const chars = Array.from(normalized);
   return chars.length > max ? `${chars.slice(0, max).join('')}…` : normalized;
 }
 
 function formatNumber(value: number): string {
   return value.toLocaleString('zh-CN');
 }
 
 export function NovelStats({ novel }: { novel: Novel }) {
   const [usageRecords, setUsageRecords] = useState<AiUsageRecord[]>([]);
   const usageNovelId = novel.id;
-  const ordered = [...novel.chapters].sort((a, b) => a.order - b.order);
+  const ordered = orderedChapters(novel);
   const totalChapters = ordered.length;
   const doneChapters = ordered
     .map((chapter, displayIndex) => ({ chapter, displayIndex, words: countWords(chapter.content) }))
     .filter((entry) => entry.chapter.content.trim() !== '');
   const doneCount = doneChapters.length;
   const totalWords = ordered.reduce((sum, chapter) => sum + countWords(chapter.content), 0);
   const progress = totalChapters ? Math.round((doneCount / totalChapters) * 100) : 0;
   const avgDoneWords = doneCount ? Math.round(doneChapters.reduce((sum, entry) => sum + entry.words, 0) / doneCount) : null;
   let longest = doneCount ? doneChapters[0] : null;
   let shortest = doneCount ? doneChapters[0] : null;
diff --git a/src/features/novel-creation/VolumeOutline.tsx b/src/features/novel-creation/VolumeOutline.tsx
new file mode 100644
index 0000000..4b349d0
--- /dev/null
+++ b/src/features/novel-creation/VolumeOutline.tsx
@@ -0,0 +1,179 @@
+import { useState, type DragEvent } from 'react';
+import type { Chapter, Novel } from '../../types/novel';
+import { CHAPTER_STATUS_LABEL, CHAPTER_STATUS_ORDER, PROGRESS_LABELS, resolveChapterStatus } from './novelProgress';
+import type { ChapterStatus } from '../../types/novel';
+import {
+  countChaptersInVolume,
+  createVolume,
+  deleteVolume,
+  groupChaptersByVolume,
+  moveChapterInStructure,
+  renameVolume,
+  reorderVolumes,
+} from './novelStructure';
+
+interface VolumeOutlineProps {
+  novel: Novel;
+  onUpdateNovel: (update: (novel: Novel) => Novel) => void;
+  onAddChapter: () => void;
+  onDeleteChapter: (chapterId: string) => void;
+  onUpdateChapter: (chapterId: string, patch: Partial<Pick<Chapter, 'title' | 'outline'>>) => void;
+  onUpdateChapterAndSave: (chapterId: string, patch: Partial<Pick<Chapter, 'status' | 'wordTarget'>>) => void;
+}
+
+type DropTarget = { volumeId: string | null; index: number };
+
+export function VolumeOutline({
+  novel,
+  onUpdateNovel,
+  onAddChapter,
+  onDeleteChapter,
+  onUpdateChapter,
+  onUpdateChapterAndSave,
+}: VolumeOutlineProps) {
+  const [newVolumeTitle, setNewVolumeTitle] = useState('');
+  const [draggedChapterId, setDraggedChapterId] = useState<string | null>(null);
+  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
+  const groups = groupChaptersByVolume(novel);
+  const chapterNumber = new Map(groups.flatMap((group) => group.chapters).map((chapter, index) => [chapter.id, index + 1]));
+
+  function addVolume() {
+    const title = newVolumeTitle.trim();
+    if (!title) return;
+    onUpdateNovel((current) => createVolume(current, title));
+    setNewVolumeTitle('');
+  }
+
+  function updateVolumeTitle(volumeId: string, title: string) {
+    const nextTitle = title.trim();
+    const currentTitle = novel.volumes.find((volume) => volume.id === volumeId)?.title;
+    if (!nextTitle || nextTitle === currentTitle) return;
+    onUpdateNovel((current) => renameVolume(current, volumeId, nextTitle));
+  }
+
+  function removeVolume(volumeId: string, title: string) {
+    const count = countChaptersInVolume(novel, volumeId);
+    if (!window.confirm(`确定删除卷「${title}」吗？其中 ${count} 个章节将移至“未分卷”，章节正文不会删除。`)) return;
+    onUpdateNovel((current) => deleteVolume(current, volumeId));
+  }
+
+  function moveChapter(chapterId: string, volumeId: string | null, index: number) {
+    onUpdateNovel((current) => moveChapterInStructure(current, chapterId, { volumeId, toIndex: index }));
+  }
+
+  function finishDrop(target: DropTarget) {
+    if (draggedChapterId) moveChapter(draggedChapterId, target.volumeId, target.index);
+    setDraggedChapterId(null);
+    setDropTarget(null);
+  }
+
+  function allowDrop(event: DragEvent, target: DropTarget) {
+    event.preventDefault();
+    event.dataTransfer.dropEffect = 'move';
+    setDropTarget(target);
+  }
+
+  return (
+    <div className="novel-volume-outline">
+      <div className="novel-volume-outline__toolbar">
+        <label>
+          <span>新建卷</span>
+          <input
+            aria-label="新卷标题"
+            onChange={(event) => setNewVolumeTitle(event.target.value)}
+            onKeyDown={(event) => { if (event.key === 'Enter') addVolume(); }}
+            placeholder="输入卷名"
+            value={newVolumeTitle}
+          />
+        </label>
+        <button className="novel-flow__ghost" disabled={!newVolumeTitle.trim()} onClick={addVolume} type="button">添加卷</button>
+        <button className="novel-flow__primary novel-flow__primary--compact" onClick={onAddChapter} type="button">新增章节</button>
+      </div>
+
+      {groups.map((group, groupIndex) => {
+        const volumeId = group.volume?.id ?? null;
+        const isUnassigned = group.volume === null;
+        return (
+          <section
+            className={dropTarget?.volumeId === volumeId && group.chapters.length === 0 ? 'novel-volume novel-volume--drop-target' : 'novel-volume'}
+            key={volumeId ?? 'unassigned'}
+            onDragOver={(event) => { if (group.chapters.length === 0) allowDrop(event, { volumeId, index: 0 }); }}
+            onDrop={(event) => { if (group.chapters.length === 0) { event.preventDefault(); finishDrop({ volumeId, index: 0 }); } }}
+          >
+            <header className="novel-volume__head">
+              <div className="novel-volume__title">
+                <span>{isUnassigned ? '未分卷' : `第 ${groupIndex + 1} 卷`}</span>
+                {group.volume ? (
+                  <input
+                    aria-label={`重命名卷 ${group.volume.title}`}
+                    defaultValue={group.volume.title}
+                    key={`${group.volume.id}-${group.volume.title}`}
+                    onBlur={(event) => {
+                      if (!event.target.value.trim()) event.target.value = group.volume!.title;
+                      else updateVolumeTitle(group.volume!.id, event.target.value);
+                    }}
+                    onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
+                  />
+                ) : <strong>暂未归入正式卷</strong>}
+                <small>{group.chapters.length} 章</small>
+              </div>
+              {group.volume && (
+                <div className="novel-volume__actions">
+                  <button aria-label={`上移卷 ${group.volume.title}`} className="novel-flow__ghost" disabled={groupIndex === 0} onClick={() => onUpdateNovel((current) => reorderVolumes(current, group.volume!.id, 'up'))} type="button">上移</button>
+                  <button aria-label={`下移卷 ${group.volume.title}`} className="novel-flow__ghost" disabled={groupIndex === novel.volumes.length - 1} onClick={() => onUpdateNovel((current) => reorderVolumes(current, group.volume!.id, 'down'))} type="button">下移</button>
+                  <button aria-label={`删除卷 ${group.volume.title}`} className="novel-flow__ghost" onClick={() => removeVolume(group.volume!.id, group.volume!.title)} type="button">删除卷</button>
+                </div>
+              )}
+            </header>
+
+            {group.chapters.length ? (
+              <div className="novel-volume__chapters">
+                {group.chapters.map((chapter, index) => {
+                  const number = chapterNumber.get(chapter.id) ?? index + 1;
+                  const isDropTarget = dropTarget?.volumeId === volumeId && dropTarget.index === index && draggedChapterId !== chapter.id;
+                  return (
+                    <article
+                      aria-label={`第 ${number} 章，可拖拽调整顺序`}
+                      className={isDropTarget ? 'novel-outline-card novel-outline-card--drop-target' : 'novel-outline-card'}
+                      draggable
+                      key={chapter.id}
+                      onDragEnd={() => { setDraggedChapterId(null); setDropTarget(null); }}
+                      onDragOver={(event) => allowDrop(event, { volumeId, index })}
+                      onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; setDraggedChapterId(chapter.id); }}
+                      onDrop={(event) => { event.preventDefault(); finishDrop({ volumeId, index }); }}
+                    >
+                      <div className="novel-outline-card__head">
+                        <span>第 {number} 章</span>
+                        <div className="novel-outline-card__actions">
+                          <button aria-label={`上移第 ${number} 章`} className="novel-flow__ghost" disabled={index === 0} onClick={() => moveChapter(chapter.id, volumeId, index - 1)} type="button">上移</button>
+                          <button aria-label={`下移第 ${number} 章`} className="novel-flow__ghost" disabled={index === group.chapters.length - 1} onClick={() => moveChapter(chapter.id, volumeId, index + 1)} type="button">下移</button>
+                          <select aria-label={`调整第 ${number} 章所属卷`} onChange={(event) => moveChapter(chapter.id, event.target.value || null, Number.MAX_SAFE_INTEGER)} value={volumeId ?? ''}>
+                            {novel.volumes.map((volume) => <option key={volume.id} value={volume.id}>{volume.title}</option>)}
+                            <option value="">未分卷</option>
+                          </select>
+                          <button aria-label={`删除第 ${number} 章`} className="novel-flow__ghost" onClick={() => onDeleteChapter(chapter.id)} type="button">删除</button>
+                        </div>
+                      </div>
+                      <input aria-label={`第 ${number} 章标题`} onChange={(event) => onUpdateChapter(chapter.id, { title: event.target.value })} placeholder="未命名章节" value={chapter.title} />
+                      <div className="novel-outline-card__progress">
+                        <label><span>{PROGRESS_LABELS.statusCompletion.slice(0, 2)}</span><select value={resolveChapterStatus(chapter)} onChange={(event) => onUpdateChapterAndSave(chapter.id, { status: event.target.value as ChapterStatus })}>{CHAPTER_STATUS_ORDER.map((status) => <option key={status} value={status}>{CHAPTER_STATUS_LABEL[status]}</option>)}</select></label>
+                        <label><span>{PROGRESS_LABELS.chapterTarget}</span><input min={0} onChange={(event) => { const raw = Number(event.target.value); onUpdateChapterAndSave(chapter.id, { wordTarget: Number.isFinite(raw) && raw > 0 ? Math.round(raw) : undefined }); }} placeholder={PROGRESS_LABELS.targetPlaceholder} step={100} type="number" value={chapter.wordTarget ?? ''} /></label>
+                      </div>
+                      <textarea aria-label={`第 ${number} 章大纲`} onChange={(event) => onUpdateChapter(chapter.id, { outline: event.target.value })} placeholder="本章故事结构规划…" value={chapter.outline ?? ''} />
+                    </article>
+                  );
+                })}
+                <div
+                  aria-hidden="true"
+                  className={dropTarget?.volumeId === volumeId && dropTarget.index === group.chapters.length ? 'novel-volume__drop-end novel-volume__drop-end--active' : 'novel-volume__drop-end'}
+                  onDragOver={(event) => allowDrop(event, { volumeId, index: group.chapters.length })}
+                  onDrop={(event) => { event.preventDefault(); finishDrop({ volumeId, index: group.chapters.length }); }}
+                />
+              </div>
+            ) : <div className="novel-volume__empty">拖拽章节到这里，或通过章节的所属卷选择器进行移动。</div>}
+          </section>
+        );
+      })}
+    </div>
+  );
+}
diff --git a/src/features/novel-creation/characterGraph.ts b/src/features/novel-creation/characterGraph.ts
index 8ea93a9..0568016 100644
--- a/src/features/novel-creation/characterGraph.ts
+++ b/src/features/novel-creation/characterGraph.ts
@@ -1,11 +1,12 @@
 import type { CharacterGraph, GraphCharacter, GraphRelationship, Novel } from '../../types/novel';
+import { orderedChapters } from './novelStructure';
 export type { CharacterGraph, GraphCharacter, GraphRelationship } from '../../types/novel';
 
 export type TextMessage = { role: 'system' | 'user'; content: string };
 
 // 判别式联合：调用侧按 kind 三分支处理，绝不靠空对象猜语义。
 export type ParsedCharacterGraph =
   | { kind: 'ok'; graph: CharacterGraph }
   | { kind: 'empty' }
   | { kind: 'invalid' };
 
@@ -19,22 +20,21 @@ function stripCodeFence(text: string): string {
 
 function limitText(text: string, max: number): string {
   const chars = Array.from(text.trim());
   if (chars.length <= max) return chars.join('');
   const half = Math.floor(max / 2);
   return `${chars.slice(0, half).join('')}\n...\n${chars.slice(-half).join('')}`;
 }
 
 // 汇总用于推演的语料：蓝图 + 简介 + 创意 + 已完成章节正文（截断，控制 token）。
 function collectStoryContext(novel: Novel): string {
-  const doneChapters = [...novel.chapters]
-    .sort((a, b) => a.order - b.order)
+  const doneChapters = orderedChapters(novel)
     .filter((chapter) => chapter.content.trim());
   const chapterBlocks = doneChapters.map((chapter, index) => {
     const title = chapter.title.trim() || `第 ${index + 1} 章`;
     return `【${title}】\n${chapter.content.trim()}`;
   });
   const joined = chapterBlocks.join('\n\n');
   return limitText(joined, 6000);
 }
 
 function collectCharacterEvidence(novel: Novel): string {
diff --git a/src/features/novel-creation/novelExport.ts b/src/features/novel-creation/novelExport.ts
index e4d94d6..8fdc518 100644
--- a/src/features/novel-creation/novelExport.ts
+++ b/src/features/novel-creation/novelExport.ts
@@ -1,13 +1,14 @@
 import { rendererBridge } from '../../services/rendererBridge';
 import { assertStoreZipSelfCheck, createStoreZip, textToBytes, type StoreZipEntry } from '../../services/storeZip';
 import type { Novel } from '../../types/novel';
+import { orderedChapters } from './novelStructure';
 
 export async function copyWholeBookMarkdown(novel: Novel): Promise<void> {
   const markdown = buildWholeBookMarkdown(novel);
   if (!markdown) {
     window.alert('暂无可复制的正文');
     return;
   }
   try {
     await rendererBridge.copyText(markdown);
     window.alert('全书 Markdown 已复制');
@@ -93,36 +94,38 @@ function buildOfflinePackageFiles(novel: Novel): StoreZipEntry[] {
   return [
     { name: 'index.html', data: textToBytes(indexHtml) },
     { name: 'novel.md', data: textToBytes(markdown) },
     { name: 'novel.json', data: textToBytes(JSON.stringify(novel, null, 2)) },
     { name: 'README.txt', data: textToBytes(readme) },
   ];
 }
 
 function buildStoryboardDocHtml(novel: Novel): string | null {
   const title = novel.title.trim() || '未命名小说';
-  const chapters = novel.chapters.slice().sort((a, b) => a.order - b.order);
+  const chapters = orderedChapters(novel);
   const chapterTitleById = new Map(chapters.map((chapter) => [chapter.id, chapter.title.trim() || '未命名章节']));
-  const filledChapters = chapters.filter((chapter) => chapter.content.trim() || chapter.outline?.trim());
+  const filledChapters = chapters
+    .map((chapter, index) => ({ chapter, index }))
+    .filter(({ chapter }) => chapter.content.trim() || chapter.outline?.trim());
   const hasOverview = Boolean(novel.summary.trim() || novel.idea?.trim() || novel.blueprint?.trim());
   if (!filledChapters.length && !hasOverview && !novel.foreshadowings.length) return null;
 
   const sections: string[] = [`<h1>${escapeDocHtml(title)}</h1>`];
 
   const overview: string[] = [];
   if (novel.summary.trim()) overview.push(`<h3>概要</h3>${docParagraphs(novel.summary)}`);
   if (novel.idea?.trim()) overview.push(`<h3>创意</h3>${docParagraphs(novel.idea)}`);
   if (novel.blueprint?.trim()) overview.push(`<h3>蓝图</h3>${docParagraphs(novel.blueprint)}`);
   if (overview.length) sections.push(overview.join(''));
 
-  for (const chapter of filledChapters) {
-    sections.push(`<h2>第 ${chapter.order + 1} 章 · ${escapeDocHtml(chapter.title.trim() || '未命名章节')}</h2>`);
+  for (const { chapter, index } of filledChapters) {
+    sections.push(`<h2>第 ${index + 1} 章 · ${escapeDocHtml(chapter.title.trim() || '未命名章节')}</h2>`);
     if (chapter.outline?.trim()) sections.push(`<h4>大纲</h4>${docParagraphs(chapter.outline)}`);
     if (chapter.content.trim()) sections.push(docParagraphs(chapter.content));
   }
 
   if (novel.foreshadowings.length) {
     const rows = novel.foreshadowings
       .map((item) => {
         const statusText = item.status === 'paidOff' ? '已回收' : '埋设中';
         const planted = item.plantedChapterId ? (chapterTitleById.get(item.plantedChapterId) ?? '（未知章节）') : '（未指定）';
         const payoff = item.payoffChapterId ? (chapterTitleById.get(item.payoffChapterId) ?? '（未知章节）') : '—';
@@ -131,19 +134,21 @@ function buildStoryboardDocHtml(novel: Novel): string | null {
       .join('');
     sections.push(
       `<h2>伏笔清单</h2><table border="1" cellspacing="0" cellpadding="6"><thead><tr><th>简述</th><th>状态</th><th>埋设章节</th><th>回收章节</th><th>备注</th></tr></thead><tbody>${rows}</tbody></table>`,
     );
   }
 
   return `<!DOCTYPE html><html><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"><title>${escapeDocHtml(title)}</title></head><body>${sections.join('')}</body></html>`;
 }
 
 function buildWholeBookMarkdown(novel: Novel): string | null {
-  const chapters = novel.chapters.filter((chapter) => chapter.content.trim()).sort((a, b) => a.order - b.order);
+  const chapters = orderedChapters(novel)
+    .map((chapter, index) => ({ chapter, index }))
+    .filter(({ chapter }) => chapter.content.trim());
   if (!chapters.length) return null;
   const parts = [`# ${novel.title.trim() || '未命名小说'}`];
   if (novel.summary.trim()) parts.push(novel.summary.trim());
-  for (const chapter of chapters) {
-    parts.push(`## 第 ${chapter.order + 1} 章 · ${chapter.title.trim() || '未命名章节'}`, chapter.content.trim());
+  for (const { chapter, index } of chapters) {
+    parts.push(`## 第 ${index + 1} 章 · ${chapter.title.trim() || '未命名章节'}`, chapter.content.trim());
   }
   return parts.join('\n\n');
 }
diff --git a/src/features/novel-creation/novelNavigation.tsx b/src/features/novel-creation/novelNavigation.tsx
index ba6882a..763a23e 100644
--- a/src/features/novel-creation/novelNavigation.tsx
+++ b/src/features/novel-creation/novelNavigation.tsx
@@ -1,12 +1,13 @@
 import { useEffect, useState } from 'react';
 import type { Chapter, Novel } from '../../types/novel';
+import { orderedChapters } from './novelStructure';
 
 export type ChapterSearchField = 'content' | 'title' | 'outline';
 
 export interface ChapterSearchResult {
   chapterId: string;
   chapterNumber: number;
   chapterTitle: string;
   field: ChapterSearchField;
   matchOffset: number;
   matchedText: string;
@@ -21,32 +22,32 @@ export interface ChapterLocateRequest {
   requestId: number;
 }
 
 const FIELD_LABEL: Record<ChapterSearchField, string> = {
   content: '正文',
   title: '标题',
   outline: '大纲',
 };
 
 export function reorderChapters(chapters: Chapter[], fromIndex: number, toIndex: number): Chapter[] {
-  const ordered = [...chapters].sort((a, b) => a.order - b.order);
+  const ordered = [...chapters];
   if (fromIndex < 0 || fromIndex >= ordered.length || toIndex < 0 || toIndex >= ordered.length) return ordered;
   const [moved] = ordered.splice(fromIndex, 1);
   ordered.splice(toIndex, 0, moved);
   return ordered.map((chapter, order) => ({ ...chapter, order }));
 }
 
 export function searchChapters(novel: Novel, keyword: string): ChapterSearchResult[] {
   const query = keyword.trim();
   if (!query) return [];
   const normalizedQuery = query.toLocaleLowerCase();
-  return [...novel.chapters].sort((a, b) => a.order - b.order).flatMap((chapter, index) => {
+  return orderedChapters(novel).flatMap((chapter, index) => {
     const fields: [ChapterSearchField, string][] = [
       ['content', chapter.content],
       ['title', chapter.title],
       ['outline', chapter.outline ?? ''],
     ];
     return fields.flatMap(([field, value]) => {
       const matchOffset = value.toLocaleLowerCase().indexOf(normalizedQuery);
       if (matchOffset < 0) return [];
       const snippetStart = Math.max(0, matchOffset - 36);
       const snippetEnd = Math.min(value.length, matchOffset + query.length + 36);
@@ -101,19 +102,19 @@ export function ChapterSearchPanel({ novel, onSelect }: { novel: Novel; onSelect
     </section>
   );
 }
 
 function assertNovelNavigationSelfCheck(): void {
   const chapters = [
     { id: 'b', title: 'Beta', content: 'Second KEYWORD', outline: '', order: 1 },
     { id: 'a', title: 'Alpha', content: 'First', outline: 'keyword outline', order: 0 },
   ] as Chapter[];
   const reordered = reorderChapters(chapters, 1, 0);
-  const results = searchChapters({ chapters } as Novel, 'keyword');
-  if (reordered.map((chapter) => `${chapter.id}:${chapter.order}`).join(',') !== 'b:0,a:1'
+  const results = searchChapters({ chapters, volumes: [] } as unknown as Novel, 'keyword');
+  if (reordered.map((chapter) => `${chapter.id}:${chapter.order}`).join(',') !== 'a:0,b:1'
     || results.length !== 2
     || results.some((result) => !result.snippet.toLocaleLowerCase().includes('keyword'))) {
     throw new Error('Novel navigation self-check failed.');
   }
 }
 
 assertNovelNavigationSelfCheck();
diff --git a/src/features/novel-creation/novelPrompts.ts b/src/features/novel-creation/novelPrompts.ts
index 5daff30..1cb1fdf 100644
--- a/src/features/novel-creation/novelPrompts.ts
+++ b/src/features/novel-creation/novelPrompts.ts
@@ -1,11 +1,12 @@
 import type { Chapter, Foreshadowing, Novel } from '../../types/novel';
+import { orderedChapters } from './novelStructure';
 
 export type TextMessage = { role: 'system' | 'user'; content: string };
 export type OptimizeType = 'dialogue' | 'environment' | 'psychology' | 'action';
 export const PINNED_CONTEXT_LIMIT = 8;
 
 const SETTING_TYPE_LABEL = {
   character: '角色',
   location: '地点',
   organization: '组织',
   item: '物品',
@@ -438,21 +439,21 @@ export function buildForeshadowingCandidatesPrompt(novel: Novel, chapter: Chapte
         chapter.outline ? `本章大纲：\n${chapter.outline}` : '',
         '本章正文：',
         limitText(chapter.content, 5000),
         '请从本章正文里识别最多 3 条新埋伏笔候选，按上述 JSON 数组格式输出。',
       ].filter(Boolean).join('\n'),
     },
   ];
 }
 
 export function buildForeshadowingPayoffCandidatesPrompt(novel: Novel, chapter: Chapter, plantedForeshadowings: Foreshadowing[]): TextMessage[] {
-  const chapterLabels = new Map(novel.chapters.map((item, index) => [item.id, `第 ${index + 1} 章 · ${item.title || '未命名章节'}`]));
+  const chapterLabels = new Map(orderedChapters(novel).map((item, index) => [item.id, `第 ${index + 1} 章 · ${item.title || '未命名章节'}`]));
   const plantedList = plantedForeshadowings.map((item) => [
     `id: ${item.id}`,
     `标题: ${item.title}`,
     `埋设章节: ${chapterLabels.get(item.plantedChapterId) ?? '未指定章节'}`,
     item.note ? `备注: ${limitText(item.note, 240)}` : '',
   ].filter(Boolean).join('\n')).join('\n\n');
   return [
     {
       role: 'system',
       content: '你是小说伏笔回收识别助手。职责是判断当前章正文是否回收了已记录的未回收伏笔。你只能从用户给出的未回收伏笔 id 中选择，不要创造新 id，不要提出新埋伏笔。严格输出 JSON 数组，最多 3 条，每条格式为 {"foreshadowingId": string, "note": string}：foreshadowingId 必须来自未回收伏笔列表，note 简短说明当前章哪里像是在回收它。只输出 JSON，不要加解释、不要加代码围栏、不要加标题。若找不到明显回收线索，输出 []。',
@@ -527,25 +528,30 @@ export function parseForeshadowingPayoffCandidates(text: string, validIds: reado
     if (!validIdSet.has(foreshadowingId) || seen.has(foreshadowingId)) continue;
     seen.add(foreshadowingId);
     const note = typeof record.note === 'string' ? record.note.trim() : '';
     candidates.push({ foreshadowingId, note });
   }
   if (!candidates.length) return { kind: 'empty' };
   return { kind: 'ok', candidates: candidates.slice(0, 3) };
 }
 
 function buildPreviousChapterContext(novel: Novel, currentChapter: Chapter): string {
+  const ordered = orderedChapters(novel);
+  const currentIndex = ordered.findIndex((item) => item.id === currentChapter.id);
+  if (currentIndex < 0) return '无已完成前文。';
   const blocks: string[] = [];
   let total = 0;
-  for (const chapter of novel.chapters.filter((item) => item.order < currentChapter.order && item.content.trim()).sort((a, b) => b.order - a.order)) {
+  const previous = ordered.slice(0, currentIndex).map((chapter, index) => ({ chapter, index }));
+  for (const { chapter, index } of previous.reverse()) {
+    if (!chapter.content.trim()) continue;
     const block = [
-      `第 ${chapter.order + 1} 章 · ${chapter.title || '未命名章节'}`,
+      `第 ${index + 1} 章 · ${chapter.title || '未命名章节'}`,
       chapter.outline ? `大纲：${limitText(chapter.outline, 160)}` : '',
       `正文尾部：\n${tailText(chapter.content, 400)}`,
     ].filter(Boolean).join('\n');
     if (total + block.length > 4000 && blocks.length) continue;
     blocks.push(block);
     total += block.length;
     if (total >= 4000) break;
   }
   return blocks.reverse().join('\n\n') || '无已完成前文。';
 }
diff --git a/src/features/novel-creation/novelStructure.ts b/src/features/novel-creation/novelStructure.ts
new file mode 100644
index 0000000..b47adfd
--- /dev/null
+++ b/src/features/novel-creation/novelStructure.ts
@@ -0,0 +1,222 @@
+import type { Chapter, Novel, Volume } from '../../types/novel';
+
+// 按 order 升序返回卷（order 相同则保留原始位置），不改原数组。
+function sortedVolumes(novel: Novel): Volume[] {
+  return novel.volumes
+    .map((volume, position) => ({ volume, position }))
+    .sort((a, b) => (a.volume.order - b.volume.order) || (a.position - b.position))
+    .map((item) => item.volume);
+}
+
+// 按 order 升序返回分组内章节（order 相同则保留原始位置）。
+function sortGroup(chapters: { chapter: Chapter; position: number }[]): Chapter[] {
+  return chapters
+    .sort((a, b) => (a.chapter.order - b.chapter.order) || (a.position - b.position))
+    .map((item) => item.chapter);
+}
+
+// 按卷分组章节：正式卷按 order 升序，未分卷（volume: null）恒定末位。
+export function groupChaptersByVolume(novel: Novel): { volume: Volume | null; chapters: Chapter[] }[] {
+  const volumeIds = new Set(novel.volumes.map((volume) => volume.id));
+  const buckets = new Map<string, { chapter: Chapter; position: number }[]>();
+  const unassigned: { chapter: Chapter; position: number }[] = [];
+  novel.chapters.forEach((chapter, position) => {
+    if (chapter.volumeId && volumeIds.has(chapter.volumeId)) {
+      const bucket = buckets.get(chapter.volumeId) ?? [];
+      bucket.push({ chapter, position });
+      buckets.set(chapter.volumeId, bucket);
+    } else {
+      unassigned.push({ chapter, position });
+    }
+  });
+  const groups = sortedVolumes(novel).map((volume) => ({
+    volume: volume as Volume | null,
+    chapters: sortGroup(buckets.get(volume.id) ?? []),
+  }));
+  groups.push({ volume: null, chapters: sortGroup(unassigned) });
+  return groups;
+}
+
+// 按卷序展开为线性章节数组，不改原对象。
+export function orderedChapters(novel: Novel): Chapter[] {
+  return groupChaptersByVolume(novel).flatMap((group) => group.chapters);
+}
+
+// 归一卷 order 为连续下标，仅在 order 变化时复制对象。
+function reindexVolumes(volumes: Volume[]): Volume[] {
+  return volumes.map((volume, order) => (volume.order === order ? volume : { ...volume, order }));
+}
+
+// 按分组归一各章节 order，仅在 order 变化时复制对象，其余保持引用。
+function reindexGroups(novel: Novel): Chapter[] {
+  const groups = groupChaptersByVolume(novel);
+  const byId = new Map<string, Chapter>();
+  for (const group of groups) {
+    group.chapters.forEach((chapter, order) => {
+      byId.set(chapter.id, chapter.order === order ? chapter : { ...chapter, order });
+    });
+  }
+  return novel.chapters.map((chapter) => byId.get(chapter.id) ?? chapter);
+}
+
+// 追加新卷到正式卷末尾（标题 trim 后非空由调用方保证），返回新 Novel。
+export function createVolume(novel: Novel, title: string): Novel {
+  const now = new Date().toISOString();
+  const volume: Volume = {
+    id: `volume-${crypto.randomUUID()}`,
+    title,
+    order: novel.volumes.length,
+    createdAt: now,
+    updatedAt: now,
+  };
+  return { ...novel, volumes: reindexVolumes([...novel.volumes, volume]), updatedAt: now };
+}
+
+// 重命名指定卷，返回新 Novel。
+export function renameVolume(novel: Novel, volumeId: string, title: string): Novel {
+  const now = new Date().toISOString();
+  return {
+    ...novel,
+    volumes: novel.volumes.map((volume) => (volume.id === volumeId ? { ...volume, title, updatedAt: now } : volume)),
+    updatedAt: now,
+  };
+}
+
+// 上移/下移指定卷并归一 order，越界返回原对象。
+export function reorderVolumes(novel: Novel, volumeId: string, direction: 'up' | 'down'): Novel {
+  const ordered = sortedVolumes(novel);
+  const index = ordered.findIndex((volume) => volume.id === volumeId);
+  const target = direction === 'up' ? index - 1 : index + 1;
+  if (index < 0 || target < 0 || target >= ordered.length) return novel;
+  const [moved] = ordered.splice(index, 1);
+  ordered.splice(target, 0, moved);
+  const now = new Date().toISOString();
+  return { ...novel, volumes: reindexVolumes(ordered).map((volume) => ({ ...volume, updatedAt: now })), updatedAt: now };
+}
+
+// 删除卷但不删章：清空相关章节 volumeId，归一未分卷 order，返回新 Novel。
+export function deleteVolume(novel: Novel, volumeId: string): Novel {
+  if (!novel.volumes.some((volume) => volume.id === volumeId)) return novel;
+  const now = new Date().toISOString();
+  const detached: Novel = {
+    ...novel,
+    volumes: reindexVolumes(novel.volumes.filter((volume) => volume.id !== volumeId)),
+    chapters: novel.chapters.map((chapter) => (chapter.volumeId === volumeId ? { ...chapter, volumeId: undefined, updatedAt: now } : chapter)),
+    updatedAt: now,
+  };
+  return { ...detached, chapters: reindexGroups(detached) };
+}
+
+// 删除指定章节后按分组归一各组 order（组内 order 单一事实源），返回新 Novel。
+export function deleteChapterInStructure(novel: Novel, chapterId: string): Novel {
+  if (!novel.chapters.some((chapter) => chapter.id === chapterId)) return novel;
+  const filtered: Novel = {
+    ...novel,
+    chapters: novel.chapters.filter((chapter) => chapter.id !== chapterId),
+    updatedAt: new Date().toISOString(),
+  };
+  return { ...filtered, chapters: reindexGroups(filtered) };
+}
+
+// 统计某卷下的章节数（删除确认文案用）。
+export function countChaptersInVolume(novel: Novel, volumeId: string): number {
+  return novel.chapters.filter((chapter) => chapter.volumeId === volumeId).length;
+}
+
+// 跨卷移动 + 卷内重排 + 归属更新 + 源/目标分组 order 归一，返回新 Novel。
+export function moveChapterInStructure(
+  novel: Novel,
+  chapterId: string,
+  target: { volumeId: string | null; toIndex: number },
+): Novel {
+  const chapter = novel.chapters.find((item) => item.id === chapterId);
+  if (!chapter) return novel;
+  const now = new Date().toISOString();
+  const nextVolumeId = target.volumeId && novel.volumes.some((volume) => volume.id === target.volumeId)
+    ? target.volumeId
+    : undefined;
+  const detached: Novel = {
+    ...novel,
+    chapters: novel.chapters.map((item) => (item.id === chapterId ? { ...item, volumeId: nextVolumeId, updatedAt: now } : item)),
+    updatedAt: now,
+  };
+  const groups = groupChaptersByVolume(detached);
+  const groupKey = nextVolumeId ?? null;
+  const targetGroup = groups.find((group) => (group.volume?.id ?? null) === groupKey);
+  const targetChapters = (targetGroup?.chapters ?? []).filter((item) => item.id !== chapterId);
+  const movedChapter = detached.chapters.find((item) => item.id === chapterId)!;
+  const clampedIndex = Math.max(0, Math.min(target.toIndex, targetChapters.length));
+  targetChapters.splice(clampedIndex, 0, movedChapter);
+  const orderInGroup = new Map(targetChapters.map((item, order) => [item.id, order]));
+  const withTargetOrder: Novel = {
+    ...detached,
+    chapters: detached.chapters.map((item) => (orderInGroup.has(item.id) ? { ...item, order: orderInGroup.get(item.id)! } : item)),
+  };
+  return { ...withTargetOrder, chapters: reindexGroups(withTargetOrder) };
+}
+
+// 模块自检：沿用项目 emotionArc.ts 的 assertXxxSelfCheck() 模式，文件尾直接调用。
+export function assertNovelStructureSelfCheck(): void {
+  const now = '2026-01-01T00:00:00.000Z';
+  const base = (over: Partial<Novel>): Novel => ({
+    id: 'n', title: '', summary: '', note: '', chapters: [], foreshadowings: [], volumes: [],
+    version: 7, createdAt: now, updatedAt: now, ...over,
+  }) as Novel;
+  const ch = (id: string, order: number, volumeId?: string): Chapter =>
+    ({ id, title: id, content: '', order, volumeId, createdAt: now, updatedAt: now }) as Chapter;
+  const vol = (id: string, order: number): Volume => ({ id, title: id, order, createdAt: now, updatedAt: now });
+
+  // v6 未分卷保持相对顺序
+  const v6 = base({ chapters: [ch('a', 0), ch('b', 1), ch('c', 2)] });
+  if (orderedChapters(v6).map((c) => c.id).join(',') !== 'a,b,c') throw new Error('structure self-check: v6 order');
+
+  // 正式卷顺序 + 未分卷末尾
+  const mixed = base({
+    volumes: [vol('v2', 1), vol('v1', 0)],
+    chapters: [ch('u', 0), ch('x', 0, 'v1'), ch('y', 0, 'v2')],
+  });
+  if (orderedChapters(mixed).map((c) => c.id).join(',') !== 'x,y,u') throw new Error('structure self-check: volume order + unassigned tail');
+
+  // 无效 volumeId 降级为未分卷
+  const orphan = base({ volumes: [vol('v1', 0)], chapters: [ch('o', 0, 'ghost'), ch('p', 0, 'v1')] });
+  if (orderedChapters(orphan).map((c) => c.id).join(',') !== 'p,o') throw new Error('structure self-check: orphan volumeId');
+
+  // 跨卷移动：双侧分组 order 归一
+  const moved = moveChapterInStructure(mixed, 'u', { volumeId: 'v1', toIndex: 0 });
+  const v1Group = groupChaptersByVolume(moved).find((g) => g.volume?.id === 'v1');
+  if (v1Group?.chapters.map((c) => `${c.id}:${c.order}`).join(',') !== 'u:0,x:1') throw new Error('structure self-check: cross-volume move');
+
+  // 跨卷移动源侧归一：从含 3 章的卷移出首章，剩余两章 order 从 0 重排
+  const sourceHeavy = base({
+    volumes: [vol('v1', 0)],
+    chapters: [ch('a', 0, 'v1'), ch('b', 1, 'v1'), ch('c', 2, 'v1')],
+  });
+  const afterSourceMove = moveChapterInStructure(sourceHeavy, 'a', { volumeId: null, toIndex: 0 });
+  const sourceGroup = groupChaptersByVolume(afterSourceMove).find((g) => g.volume?.id === 'v1');
+  if (sourceGroup?.chapters.map((c) => `${c.id}:${c.order}`).join(',') !== 'b:0,c:1') {
+    throw new Error('structure self-check: source-side move reindex');
+  }
+
+  // 删除卷不删章，章节移入未分卷
+  const afterDelete = deleteVolume(mixed, 'v1');
+  if (afterDelete.chapters.length !== 3 || afterDelete.chapters.find((c) => c.id === 'x')?.volumeId !== undefined) {
+    throw new Error('structure self-check: delete volume keeps chapters');
+  }
+  if (afterDelete.volumes.length !== 1 || afterDelete.volumes[0].order !== 0) throw new Error('structure self-check: delete volume reindex');
+
+  // 删除卷后受影响分组 order 归一：脱卷章节在未分卷组内从 0 起连续
+  const deleteOrderGroup = groupChaptersByVolume(afterDelete).find((g) => g.volume === null);
+  if ((deleteOrderGroup?.chapters ?? []).some((c, order) => c.order !== order)) {
+    throw new Error('structure self-check: delete volume chapter reindex');
+  }
+
+  // 删除章节后组内 order 归一：从含 3 章的卷删中间章，剩余两章 order 从 0 重排
+  const afterChapterDelete = deleteChapterInStructure(sourceHeavy, 'b');
+  const remainGroup = groupChaptersByVolume(afterChapterDelete).find((g) => g.volume?.id === 'v1');
+  if (afterChapterDelete.chapters.length !== 2
+    || remainGroup?.chapters.map((c) => `${c.id}:${c.order}`).join(',') !== 'a:0,c:1') {
+    throw new Error('structure self-check: delete chapter reindex');
+  }
+}
+
+assertNovelStructureSelfCheck();
diff --git a/src/services/rendererBridge.ts b/src/services/rendererBridge.ts
index 9533000..9b13188 100644
--- a/src/services/rendererBridge.ts
+++ b/src/services/rendererBridge.ts
@@ -4,21 +4,21 @@ import type {
   AiUsageRecord,
   ApiImageGenerationCancelResult,
   ApiImageGenerationRequest,
   ApiImageGenerationResult,
   ApiProviderConfig,
   ApiTextGenerationCancelResult,
   ApiTextGenerationRequest,
   ApiTextGenerationResult,
   TextStreamEvent,
 } from '../types/apiProvider';
-import type { CharacterGraph, EmotionArc, Novel, NovelListResult, NovelResult } from '../types/novel';
+import type { CharacterGraph, EmotionArc, Novel, NovelListResult, NovelResult, Volume } from '../types/novel';
 import type { ThemeMode } from '../types/workspace';
 
 const THEME_STORAGE_KEY = 'ec-theme';
 const WEB_NOVELS_STORAGE_KEY = 'endless-creation.novels';
 const WEB_AI_USAGE_STORAGE_KEY = 'endless-creation.ai-usage-records';
 
 /**
  * Renderer boundary for browser/Electron-renderer capabilities.
  * Prefer the Electron preload bridge when available, and keep Web fallbacks so
  * `npm run dev` remains a pure renderer workflow.
@@ -341,26 +341,27 @@ export const rendererBridge = {
   async createNovel(input: { title: string; summary?: string; note?: string; projectId?: string }): Promise<NovelResult> {
     const electronBridge = getElectronBridge();
     if (electronBridge) return electronBridge.novel.createNovel(input);
     const now = new Date().toISOString();
     const novel: Novel = {
       id: createWebNovelId(),
       title: input.title.trim() || '\u672a\u547d\u540d\u5c0f\u8bf4',
       summary: input.summary?.trim() ?? '',
       note: input.note?.trim() ?? '',
       projectId: input.projectId?.trim() || 'default',
+      volumes: [],
       chapters: [],
       foreshadowings: [],
       settings: [],
       pinnedSettingIds: [],
       pinnedForeshadowingIds: [],
-      version: 6,
+      version: 7,
       createdAt: now,
       updatedAt: now,
     };
     writeWebNovels([novel, ...readWebNovels()]);
     return { ok: true, message: 'web fallback', novel };
   },
 
   async loadNovel(id: string): Promise<NovelResult> {
     const electronBridge = getElectronBridge();
     if (electronBridge) return electronBridge.novel.loadNovel(id);
@@ -494,32 +495,84 @@ function normalizeCharacterGraph(value: unknown): CharacterGraph | undefined {
       && typeof item.role === 'string'
       && typeof item.description === 'string')
     && Array.isArray(graph.relationships)
     && graph.relationships.every((item) => typeof item?.from === 'string'
       && typeof item.to === 'string'
       && typeof item.label === 'string')
     ? graph
     : undefined;
 }
 
+function sanitizeWebVolumes(value: unknown[]): Volume[] {
+  const now = new Date().toISOString();
+  return value
+    .map((entry): Volume | null => {
+      if (!entry || typeof entry !== 'object') return null;
+      const item = entry as Partial<Volume>;
+      if (typeof item.title !== 'string') return null;
+      return {
+        id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : crypto.randomUUID(),
+        title: item.title,
+        order: Number.isFinite(item.order) ? Number(item.order) : 0,
+        createdAt: typeof item.createdAt === 'string' ? item.createdAt : now,
+        updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : now,
+      };
+    })
+    .filter((volume): volume is Volume => volume !== null)
+    .sort((a, b) => a.order - b.order)
+    .map((volume, order) => ({ ...volume, order }));
+}
+
+function normalizeWebChapterGroupOrder<T extends { volumeId?: string; order: number }>(
+  chapters: T[],
+  volumes: Volume[],
+): T[] {
+  const volumeOrder = new Map(volumes.map((volume) => [volume.id, volume.order]));
+  const withPos = chapters.map((chapter, position) => ({ chapter, position }));
+  const groups = new Map<string, { chapter: T; position: number }[]>();
+  for (const item of withPos) {
+    const key = item.chapter.volumeId && volumeOrder.has(item.chapter.volumeId) ? item.chapter.volumeId : '__unassigned__';
+    const bucket = groups.get(key) ?? [];
+    bucket.push(item);
+    groups.set(key, bucket);
+  }
+  const result: T[] = [];
+  for (const bucket of groups.values()) {
+    bucket
+      .sort((a, b) => (a.chapter.order - b.chapter.order) || (a.position - b.position))
+      .forEach((item, order) => result.push({ ...item.chapter, order }));
+  }
+  return result;
+}
+
 function normalizeWebNovel(value: unknown): Novel | null {
   if (!isNovel(value)) return null;
+  const volumes = Array.isArray(value.volumes) ? sanitizeWebVolumes(value.volumes) : [];
+  const volumeIds = new Set(volumes.map((volume) => volume.id));
+  const remappedChapters = (Array.isArray(value.chapters) ? value.chapters : []).map((chapter) => {
+    const volumeId = typeof chapter.volumeId === 'string' && chapter.volumeId.trim() && volumeIds.has(chapter.volumeId.trim())
+      ? chapter.volumeId.trim()
+      : undefined;
+    return { ...chapter, volumeId };
+  });
+  const chapters = normalizeWebChapterGroupOrder(remappedChapters, volumes);
   return {
     ...value,
-    chapters: Array.isArray(value.chapters) ? value.chapters : [],
+    volumes,
+    chapters,
     foreshadowings: Array.isArray(value.foreshadowings) ? value.foreshadowings : [],
     settings: Array.isArray(value.settings) ? value.settings : [],
     pinnedSettingIds: Array.isArray(value.pinnedSettingIds) ? value.pinnedSettingIds : [],
     pinnedForeshadowingIds: Array.isArray(value.pinnedForeshadowingIds) ? value.pinnedForeshadowingIds : [],
     emotionArc: normalizeEmotionArc(value.emotionArc),
     characterGraph: normalizeCharacterGraph(value.characterGraph),
-    version: 6,
+    version: 7,
   };
 }
 
 function toNovelSummary(novel: Novel) {
   return {
     id: novel.id,
     title: novel.title,
     summary: novel.summary,
     createdAt: novel.createdAt,
     updatedAt: novel.updatedAt,
diff --git a/src/types/novel.ts b/src/types/novel.ts
index 6e6bd1e..386b230 100644
--- a/src/types/novel.ts
+++ b/src/types/novel.ts
@@ -1,27 +1,36 @@
 export interface ChapterVersion {
   id: string;
   content: string;
   createdAt: string;
 }
 
 export type ChapterStatus = 'draft' | 'inProgress' | 'done';
 
+export interface Volume {
+  id: string;
+  title: string;
+  order: number;
+  createdAt: string;
+  updatedAt: string;
+}
+
 export interface Chapter {
   id: string;
   title: string;
   content: string;
   outline?: string;
   versions?: ChapterVersion[];
   selectedVersionId?: string;
   status?: ChapterStatus;
   wordTarget?: number;
+  volumeId?: string;
   order: number;
   createdAt: string;
   updatedAt: string;
 }
 
 export type SettingType = 'character' | 'location' | 'organization' | 'item' | 'term' | 'rule' | 'other';
 
 export interface SettingEntry {
   id: string;
   type: SettingType;
@@ -73,28 +82,29 @@ export interface CharacterGraph {
 
 export interface Novel {
   id: string;
   projectId?: string;
   title: string;
   summary: string;
   note: string;
   idea?: string;
   blueprint?: string;
   wordTarget?: number;
+  volumes: Volume[];
   chapters: Chapter[];
   foreshadowings: Foreshadowing[];
   settings?: SettingEntry[];
   pinnedSettingIds?: string[];
   pinnedForeshadowingIds?: string[];
   emotionArc?: EmotionArc;
   characterGraph?: CharacterGraph;
-  version: 6;
+  version: 7;
   createdAt: string;
   updatedAt: string;
 }
 
 export type NovelSummary = Pick<Novel, 'id' | 'projectId' | 'title' | 'summary' | 'createdAt' | 'updatedAt'> & {
   chapterCount: number;
   wordCount: number;
   filledChapterCount: number;
 };
 
