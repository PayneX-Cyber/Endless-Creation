import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { rendererBridge } from '../../services/rendererBridge';
import { novelService } from '../../services/novelService';
import type { Chapter, ChapterVersion, Foreshadowing, Novel, Scene } from '../../types/novel';
import { buildChapterFromOutlinePrompt, buildContinueChapterPrompt, buildMissingOutlinePrompt, parseOutlineText, buildChapterReviewPrompt, buildOptimizeSelectionPrompt, buildChapterConsistencyPrompt, buildChapterRhythmPrompt, buildForeshadowingCandidatesPrompt, parseForeshadowingCandidates, buildForeshadowingPayoffCandidatesPrompt, parseForeshadowingPayoffCandidates, PINNED_CONTEXT_LIMIT, type OptimizeType, type TextMessage } from './novelPrompts';
import { countWords, createId, formatTime, saveStatusLabel, type SaveStatus } from './novelShared';
import { CHAPTER_STATUS_LABEL, CHAPTER_STATUS_ORDER, PROGRESS_LABELS, SOFT_GATE_HINTS, resolveChapterStatus } from './novelProgress';
import { SETTING_LABELS, groupSettingsByType } from './novelSettings';
import type { ChapterStatus as NovelChapterStatus } from '../../types/novel';
import { ForeshadowingPanel, type ForeshadowingDraft, type ForeshadowingAiCandidate, type ForeshadowingPayoffAiCandidate } from './ForeshadowingPanel';
import type { ChapterLocateRequest } from './novelNavigation';
import { ChapterFindReplace, pushEditorHistory, redoEditorHistory, resetEditorHistory, undoEditorHistory, type EditorHistory, type EditorSnapshot, type TextMatch } from './novelEditorTools';
import { groupChaptersByVolume } from './novelStructure';
import { adjacentSceneId, canRemoveScene, chapterText, createScene, orderedScenes, removeScene, renameScene, reorderScenes } from './sceneStructure';
import './ChapterWorkbench.css';

export type ReadyTextModel = { channelId: string; channelLabel?: string; baseUrl: string; apiKey: string; model: string };

type ChapterStatus = 'done' | 'generating' | 'pending';
type VersionPreviewState = { chapterId: string; sceneId: string; activeVersionId: string; contentSnapshot: string };
type OutlinePreviewEntry = { chapterId: string; label: string; title: string; outline: string };
type SelectionState = { chapterId: string; sceneId: string; start: number; end: number; text: string };
type OptimizeJob = SelectionState & {
  status: 'loading' | 'success';
  chapterId: string;
  contentSnapshot: string;
  selectedText: string;
  type: OptimizeType;
  optimizedText?: string;
};
type ForeshadowCandidateState = { id: string; title: string; note: string; sourceChapterId: string };
type ForeshadowPayoffCandidateState = { id: string; foreshadowingId: string; note: string; sourceChapterId: string };
type ContentWriteSource = 'manual' | 'replace' | 'ai' | 'history';

const MAX_CHAPTER_VERSIONS = 5;

interface ChapterWorkbenchProps {
  novel: Novel;
  projectId: string;
  chapters: Chapter[];
  activeChapterId: string | null;
  locateRequest?: ChapterLocateRequest | null;
  saveStatus: SaveStatus;
  onSelectChapter: (chapterId: string) => void;
  onLocateConsumed?: (requestId: number) => void;
  onUpdateChapter: (chapterId: string, patch: Partial<Pick<Chapter, 'title' | 'scenes' | 'outline' | 'status' | 'wordTarget'>>) => void;
  onUpdateChapterAndSave: (chapterId: string, patch: Partial<Pick<Chapter, 'title' | 'scenes' | 'outline' | 'status' | 'wordTarget'>>) => void;
  onUpdateNovel: (update: (novel: Novel) => Novel) => void;
  onRetrySave: () => void;
  onBackToProjects: () => void;
  onOpenProjectView: () => void;
  initialForeshadowPanel?: boolean;
  onConsumeInitialPanel?: () => void;
  onValidChapter?: (chapterId: string) => void;
  ensureTextModel: (onIssue: (message: string) => void) => ReadyTextModel | null;
}

// ChapterWorkbench 专用只读 AI 检查 hook——单章只读 AI 检查（评审/一致性/节奏同构）。
// 依赖组件级共享 runRef/requestIdRef 与 cancelGeneration 跨作废语义，勿外导、勿通用化、勿预埋写回。
function useAiCheck(config: {
  buildMessages: (novel: Novel, chapter: Chapter) => TextMessage[];
  maxTokens: number;
  failMessage: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ chapterId: string; content: string } | null>(null);

  async function run(
    chapter: Chapter,
    ctx: { novel: Novel; ready: ReadyTextModel; runRef: { current: number }; requestIdRef: { current: string | null } },
  ) {
    const requestId = createId('text-request');
    const runId = ctx.runRef.current + 1;
    ctx.runRef.current = runId;
    ctx.requestIdRef.current = requestId;
    setBusy(true);
    setError('');
    setResult(null);
    const result = await rendererBridge.generateText({
      requestId,
      channelId: ctx.ready.channelId,
      channelLabel: ctx.ready.channelLabel,
      projectId: ctx.novel.id,
      requestType: 'novel.aiCheck',
      baseUrl: ctx.ready.baseUrl,
      apiKey: ctx.ready.apiKey,
      model: ctx.ready.model,
      messages: config.buildMessages(ctx.novel, chapter),
      temperature: 0.7,
      maxTokens: config.maxTokens,
    });
    if (ctx.runRef.current !== runId) return;
    ctx.requestIdRef.current = null;
    setBusy(false);
    if (!result.ok || !result.text) {
      setError(result.message || config.failMessage);
      return;
    }
    setResult({ chapterId: chapter.id, content: result.text.trim() });
  }

  function cancel(ctx: { runRef: { current: number }; requestIdRef: { current: string | null } }) {
    const requestId = ctx.requestIdRef.current;
    ctx.runRef.current += 1;
    ctx.requestIdRef.current = null;
    setBusy(false);
    if (requestId) void rendererBridge.cancelTextGeneration(requestId);
  }

  return { busy, error, result, setError, setResult, setBusy, run, cancel };
}

export function ChapterWorkbench({ novel, projectId, chapters, activeChapterId, locateRequest, saveStatus, onSelectChapter, onLocateConsumed, onUpdateChapter, onUpdateChapterAndSave, onUpdateNovel, onRetrySave, onBackToProjects, onOpenProjectView, initialForeshadowPanel = false, onConsumeInitialPanel, onValidChapter, ensureTextModel }: ChapterWorkbenchProps) {
  const [generatingChapterId, setGeneratingChapterId] = useState<string | null>(null);
  const [generatingSceneId, setGeneratingSceneId] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState('');
  const [cancelledVersionId, setCancelledVersionId] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState<{ chapterId: string; message: string } | null>(null);
  const [preview, setPreview] = useState<VersionPreviewState | null>(null);
  const [activeSceneId, setActiveSceneId] = useState<string>();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [outlineBusy, setOutlineBusy] = useState(false);
  const [outlineError, setOutlineError] = useState('');
  const [outlinePreview, setOutlinePreview] = useState<OutlinePreviewEntry[] | null>(null);
  const review = useAiCheck({ buildMessages: buildChapterReviewPrompt, maxTokens: 800, failMessage: '评审失败，请稍后重试。' });
  const consistency = useAiCheck({ buildMessages: buildChapterConsistencyPrompt, maxTokens: 1200, failMessage: '一致性检查失败，请稍后重试。' });
  const rhythm = useAiCheck({ buildMessages: buildChapterRhythmPrompt, maxTokens: 1000, failMessage: '节奏检查失败，请稍后重试。' });
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [optimizeTypeOpen, setOptimizeTypeOpen] = useState(false);
  const [optimizeJob, setOptimizeJob] = useState<OptimizeJob | null>(null);
  const [optimizeError, setOptimizeError] = useState('');
  const [foreshadowOpen, setForeshadowOpen] = useState(false);
  const [foreshadowAiBusy, setForeshadowAiBusy] = useState(false);
  const [foreshadowAiError, setForeshadowAiError] = useState('');
  const [foreshadowAiRawText, setForeshadowAiRawText] = useState('');
  const [foreshadowCandidates, setForeshadowCandidates] = useState<ForeshadowCandidateState[]>([]);
  const [foreshadowPayoffCandidates, setForeshadowPayoffCandidates] = useState<ForeshadowPayoffCandidateState[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const requestIdRef = useRef<string | null>(null);
  const runRef = useRef(0);
  const confirmBusyRef = useRef(false);
  const streamTextRef = useRef('');
  const generationPrefixRef = useRef('');
  const historyRef = useRef<EditorHistory>(resetEditorHistory({ content: '', selectionStart: 0, selectionEnd: 0 }));
  const pendingManualSnapshotRef = useRef<EditorSnapshot | null>(null);
  const manualHistoryTimerRef = useRef(0);
  const contentWriteSourceRef = useRef<ContentWriteSource | null>(null);
  const isApplyingHistoryRef = useRef(false);

  useEffect(() => () => {
    const requestId = requestIdRef.current;
    runRef.current += 1;
    requestIdRef.current = null;
    if (requestId) void rendererBridge.cancelTextGeneration(requestId);
  }, []);

  // 订阅流式增量：只处理当前活跃流（requestId 匹配）的 delta，防止旧流/切章节串线。
  // 增量累积到 ref（权威值，供取消时保留半截），并镜像到 state 驱动打字机渲染。
  useEffect(() => {
    const unsubscribe = rendererBridge.onTextGenerationChunk((event) => {
      if (event.requestId !== requestIdRef.current) return;
      if (event.type === 'delta') {
        streamTextRef.current += event.delta;
        setStreamingText(streamTextRef.current);
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    setSelection(null);
    review.setError('');
    setOptimizeError('');
    consistency.setError('');
    rhythm.setError('');
    setForeshadowCandidates([]);
    setForeshadowPayoffCandidates([]);
    setForeshadowAiRawText('');
    setForeshadowAiError('');
  }, [activeChapterId]);

  const activeIndex = chapters.findIndex((chapter) => chapter.id === activeChapterId);
  const activeChapter = activeIndex >= 0 ? chapters[activeIndex] : null;
  const activeScenes = activeChapter ? orderedScenes(activeChapter) : [];
  const activeScene = activeScenes.find((scene) => scene.id === activeSceneId) ?? activeScenes[0];
  const chapterGroups = groupChaptersByVolume(novel);

  useEffect(() => {
    setActiveSceneId(activeChapter ? orderedScenes(activeChapter)[0]?.id : undefined);
  }, [activeChapterId]);

  useEffect(() => {
    flushManualHistory();
    window.clearTimeout(manualHistoryTimerRef.current);
    pendingManualSnapshotRef.current = null;
    setSelection(null);
    setHistoryOpen(false);
    const content = activeScene?.content ?? '';
    historyRef.current = resetEditorHistory({ content, selectionStart: content.length, selectionEnd: content.length });
  }, [activeSceneId]);

  useEffect(() => () => {
    window.clearTimeout(manualHistoryTimerRef.current);
  }, []);

  useEffect(() => {
    if (!locateRequest || locateRequest.chapterId !== activeChapter?.id) return;
    if (!activeChapter.scenes.some((scene) => scene.id === locateRequest.sceneId)) {
      onLocateConsumed?.(locateRequest.requestId);
      return;
    }
    if (activeScene?.id !== locateRequest.sceneId) {
      setActiveSceneId(locateRequest.sceneId);
      return;
    }
    if (locateRequest.offset === undefined || locateRequest.text === undefined) {
      onLocateConsumed?.(locateRequest.requestId);
      return;
    }
    const offset = locateRequest.offset;
    const text = locateRequest.text;
    let timeout = 0;
    let frame = 0;
    const locate = (attempt: number) => {
      const textarea = textareaRef.current;
      if (!textarea) {
        if (attempt < 3) timeout = window.setTimeout(() => locate(attempt + 1), 0);
        else onLocateConsumed?.(locateRequest.requestId);
        return;
      }
      const end = offset + text.length;
      const currentText = textarea.value.slice(offset, end);
      if (currentText.toLocaleLowerCase() === text.toLocaleLowerCase()) {
        textarea.focus({ preventScroll: true });
        textarea.setSelectionRange(offset, end);
        const maxScroll = Math.max(0, textarea.scrollHeight - textarea.clientHeight);
        textarea.scrollTop = maxScroll * (offset / Math.max(1, textarea.value.length));
        recordSelection(textarea);
      }
      onLocateConsumed?.(locateRequest.requestId);
    };
    frame = window.requestAnimationFrame(() => locate(0));
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [activeScene?.content, activeScene?.id, activeChapter, locateRequest, onLocateConsumed]);

  useEffect(() => {
    if (!initialForeshadowPanel) return;
    setForeshadowOpen(true);
    onConsumeInitialPanel?.();
  }, [initialForeshadowPanel, onConsumeInitialPanel]);

  useEffect(() => {
    if (activeChapter && chapterText(activeChapter).trim()) onValidChapter?.(activeChapter.id);
  }, [activeChapter, onValidChapter]);

  const doneCount = chapters.filter((chapter) => chapterText(chapter).trim() !== '').length;
  const pendingCount = chapters.length - doneCount;
  const progress = chapters.length ? Math.round((doneCount / chapters.length) * 100) : 0;
  const firstPendingIndex = chapters.findIndex((chapter) => chapterText(chapter).trim() === '');
  const missingOutlineCount = chapters.filter((chapter) => !chapter.outline?.trim()).length;
  const settingGroups = groupSettingsByType(novel.settings ?? []);
  const otherAiBusy = generatingChapterId !== null || outlineBusy || review.busy || consistency.busy || rhythm.busy || optimizeTypeOpen || optimizeJob !== null;
  const busy = otherAiBusy || foreshadowAiBusy;
  const plantedForeshadowings = novel.foreshadowings.filter((item) => item.status === 'planted');
  const foreshadowGenerateDisabledReason = (!activeChapter || !chapterText(activeChapter).trim()) ? '请先选择有正文的章节' : otherAiBusy ? 'AI 正在忙，请稍候' : '';
  const foreshadowPayoffGenerateDisabledReason = (!activeChapter || !chapterText(activeChapter).trim()) ? '请先选择有正文的章节' : otherAiBusy ? 'AI 正在忙，请稍候' : plantedForeshadowings.length === 0 ? '暂无待回收伏笔' : '';
  const summaryBrief = brief(novel.summary, 42);
  const blueprintBrief = brief(novel.blueprint?.trim() || novel.summary.trim() || novel.idea?.trim() || '', 130);

  function chapterStatus(chapter: Chapter): ChapterStatus {
    if (chapter.id === generatingChapterId) return 'generating';
    return chapterText(chapter).trim() ? 'done' : 'pending';
  }

  function locateFirstPending() {
    if (firstPendingIndex < 0) return;
    const chapter = chapters[firstPendingIndex];
    selectChapter(chapter.id);
    window.setTimeout(() => document.getElementById(`workbench-chapter-${chapter.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
  }

  function selectChapter(chapterId: string) {
    if (chapterId === activeChapterId) return;
    onSelectChapter(chapterId);
  }

  function updateScene(
    chapterId: string,
    sceneId: string,
    patch: Partial<Pick<Scene, 'title' | 'outline' | 'content' | 'versions' | 'selectedVersionId'>>,
    save = false,
  ) {
    const chapter = chapters.find((item) => item.id === chapterId);
    if (!chapter) return;
    const scenes = chapter.scenes.map((scene) => (scene.id === sceneId ? { ...scene, ...patch } : scene));
    (save ? onUpdateChapterAndSave : onUpdateChapter)(chapterId, { scenes });
  }

  function addScene() {
    if (!activeChapter || busy) return;
    const scene = createScene(activeChapter.scenes);
    onUpdateChapter(activeChapter.id, { scenes: [...activeChapter.scenes, scene] });
    setActiveSceneId(scene.id);
  }

  function handleRenameScene(sceneId: string, title: string) {
    if (!activeChapter || busy) return;
    onUpdateChapter(activeChapter.id, { scenes: renameScene(activeChapter.scenes, sceneId, title) });
  }

  function handleSceneOutline(sceneId: string, outline: string) {
    if (!activeChapter || busy) return;
    updateScene(activeChapter.id, sceneId, { outline });
  }

  function moveScene(sceneId: string, direction: 'up' | 'down') {
    if (!activeChapter || busy) return;
    onUpdateChapter(activeChapter.id, { scenes: reorderScenes(activeChapter.scenes, sceneId, direction) });
  }

  function deleteScene(sceneId: string, sceneNumber: number) {
    if (!activeChapter || busy || !canRemoveScene(activeChapter.scenes)) return;
    if (!window.confirm(`确定删除场景 ${sceneNumber} 吗？该场景正文与版本历史将无法恢复。`)) return;
    const nextActiveId = sceneId === activeSceneId ? adjacentSceneId(activeChapter.scenes, sceneId) : activeSceneId;
    onUpdateChapter(activeChapter.id, { scenes: removeScene(activeChapter.scenes, sceneId) });
    if (nextActiveId !== activeSceneId) setActiveSceneId(nextActiveId);
  }

  function recordSelection(target: HTMLTextAreaElement) {
    if (!activeChapter || !activeScene) return;
    const start = target.selectionStart;
    const end = target.selectionEnd;
    setSelection(start < end ? { chapterId: activeChapter.id, sceneId: activeScene.id, start, end, text: target.value.slice(start, end) } : null);
  }

  function flushManualHistory() {
    window.clearTimeout(manualHistoryTimerRef.current);
    const pending = pendingManualSnapshotRef.current;
    pendingManualSnapshotRef.current = null;
    if (pending) historyRef.current = pushEditorHistory(historyRef.current, pending);
  }

  function queueManualHistory(snapshot: EditorSnapshot) {
    pendingManualSnapshotRef.current = snapshot;
    window.clearTimeout(manualHistoryTimerRef.current);
    manualHistoryTimerRef.current = window.setTimeout(flushManualHistory, 350);
  }

  function restoreEditorSelection(start: number, end: number) {
    window.requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      const safeStart = Math.min(start, textarea.value.length);
      const safeEnd = Math.min(end, textarea.value.length);
      textarea.focus({ preventScroll: true });
      textarea.setSelectionRange(safeStart, safeEnd);
      const maxScroll = Math.max(0, textarea.scrollHeight - textarea.clientHeight);
      textarea.scrollTop = maxScroll * (safeStart / Math.max(1, textarea.value.length));
      recordSelection(textarea);
      isApplyingHistoryRef.current = false;
      contentWriteSourceRef.current = null;
    });
  }

  function writeSceneContent(
    chapterId: string,
    sceneId: string,
    content: string,
    source: ContentWriteSource,
    selectionStart: number,
    selectionEnd: number,
    selectedVersionId?: string,
  ) {
    flushManualHistory();
    contentWriteSourceRef.current = source;
    const writeSource = contentWriteSourceRef.current;
    if (writeSource === 'replace') {
      historyRef.current = pushEditorHistory(historyRef.current, { content, selectionStart, selectionEnd });
    } else if (writeSource === 'ai' && sceneId === activeSceneId) {
      historyRef.current = resetEditorHistory({ content, selectionStart, selectionEnd });
    } else if (writeSource === 'history') {
      isApplyingHistoryRef.current = true;
    }
    updateScene(chapterId, sceneId, { content, ...(selectedVersionId ? { selectedVersionId } : {}) });
    restoreEditorSelection(selectionStart, selectionEnd);
  }

  function handleManualContentChange(target: HTMLTextAreaElement) {
    if (!activeChapter || !activeScene || isApplyingHistoryRef.current) return;
    contentWriteSourceRef.current = 'manual';
    updateScene(activeChapter.id, activeScene.id, { content: target.value });
    queueManualHistory({ content: target.value, selectionStart: target.selectionStart, selectionEnd: target.selectionEnd });
    contentWriteSourceRef.current = null;
  }

  function applyHistory(direction: 'undo' | 'redo') {
    if (!activeChapter || !activeScene || busy) return;
    flushManualHistory();
    const result = direction === 'undo' ? undoEditorHistory(historyRef.current) : redoEditorHistory(historyRef.current);
    historyRef.current = result.history;
    if (result.snapshot) {
      writeSceneContent(activeChapter.id, activeScene.id, result.snapshot.content, 'history', result.snapshot.selectionStart, result.snapshot.selectionEnd);
    }
  }

  function handleEditorKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLocaleLowerCase();
    const direction = key === 'y' || (key === 'z' && event.shiftKey) ? 'redo' : key === 'z' ? 'undo' : null;
    if (!direction) return;
    event.preventDefault();
    applyHistory(direction);
  }

  function locateEditorMatch(match: TextMatch) {
    restoreEditorSelection(match.offset, match.offset + match.length);
  }

  function getValidSelection(): SelectionState | null {
    if (!activeChapter || !activeScene || !selection?.text.trim()
      || selection.chapterId !== activeChapter.id || selection.sceneId !== activeScene.id) return null;
    return activeScene.content.slice(selection.start, selection.end) === selection.text ? selection : null;
  }

  function openOptimizeType() {
    if (busy) return;
    if (!activeChapter || !activeScene || !selection?.text.trim()
      || selection.chapterId !== activeChapter.id || selection.sceneId !== activeScene.id) {
      window.alert('请先选择要优化的正文');
      return;
    }
    if (!getValidSelection()) {
      window.alert('原文范围已变化，请重新选择后生成。');
      return;
    }
    setOptimizeError('');
    setOptimizeTypeOpen(true);
  }

  async function startOptimize(type: OptimizeType) {
    const currentSelection = getValidSelection();
    if (!activeChapter || !activeScene || !currentSelection) {
      window.alert('原文范围已变化，请重新选择后生成。');
      return;
    }
    const ready = ensureTextModel(setOptimizeError);
    if (!ready) {
      setOptimizeTypeOpen(false);
      return;
    }
    const snapshot: OptimizeJob = {
      ...currentSelection,
      status: 'loading',
      chapterId: activeChapter.id,
      sceneId: activeScene.id,
      contentSnapshot: activeScene.content,
      selectedText: currentSelection.text,
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
      projectId: novel.id,
      requestType: 'novel.optimizeSelection',
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

  function cancelOptimize() {
    const requestId = requestIdRef.current;
    runRef.current += 1;
    requestIdRef.current = null;
    setOptimizeJob(null);
    if (requestId) void rendererBridge.cancelTextGeneration(requestId);
  }

  function confirmOptimizeWrite() {
    if (!activeChapter || !activeScene || optimizeJob?.status !== 'success' || optimizeJob.optimizedText === undefined) return;
    const { chapterId, sceneId, contentSnapshot, selectionStart, selectionEnd, selectedText, optimizedText } = {
      chapterId: optimizeJob.chapterId,
      sceneId: optimizeJob.sceneId,
      contentSnapshot: optimizeJob.contentSnapshot,
      selectionStart: optimizeJob.start,
      selectionEnd: optimizeJob.end,
      selectedText: optimizeJob.selectedText,
      optimizedText: optimizeJob.optimizedText,
    };
    const contentValid =
      activeChapter.id === chapterId &&
      activeScene.id === sceneId &&
      activeScene.content === contentSnapshot &&
      activeScene.content.slice(selectionStart, selectionEnd) === selectedText;
    if (!contentValid) {
      window.alert('原文范围已变化，请重新选择后生成。');
      setOptimizeJob(null);
      return;
    }
    const nextContent = activeScene.content.slice(0, selectionStart) + optimizedText + activeScene.content.slice(selectionEnd);
    const nextEnd = selectionStart + optimizedText.length;
    writeSceneContent(chapterId, sceneId, nextContent, 'ai', selectionStart, nextEnd);
    setOptimizeJob(null);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(selectionStart, nextEnd);
    });
  }

  async function generateChapterBody(mode: 'draft' | 'continue' = 'draft') {
    if (busy || (mode === 'draft' && firstPendingIndex < 0)) return;
    const chapter = mode === 'continue' ? activeChapter : chapters[firstPendingIndex];
    if (!chapter) return;
    const scene = chapter.id === activeChapter?.id ? activeScene : orderedScenes(chapter)[0];
    if (mode === 'draft' && !chapter.outline?.trim()) return;
    if (!scene || (scene.versions?.length ?? 0) >= MAX_CHAPTER_VERSIONS) return;
    const previousChapter = firstPendingIndex > 0 ? chapters[firstPendingIndex - 1] : undefined;
    const ready = ensureTextModel((message) => setGenerationError({ chapterId: chapter.id, message }));
    if (!ready) return;
    const requestId = createId('text-request');
    const runId = runRef.current + 1;
    runRef.current = runId;
    requestIdRef.current = requestId;
    setGeneratingChapterId(chapter.id);
    setGeneratingSceneId(scene.id);
    setGenerationError(null);
    streamTextRef.current = '';
    generationPrefixRef.current = mode === 'continue' && scene.content ? `${scene.content}\n\n` : '';
    setStreamingText('');
    const contentSnapshot = scene.content;
    const result = await rendererBridge.generateText({
      requestId,
      channelId: ready.channelId,
      channelLabel: ready.channelLabel,
      projectId: novel.id,
      requestType: mode === 'continue' ? 'novel.continueChapter' : 'novel.generateChapter',
      baseUrl: ready.baseUrl,
      apiKey: ready.apiKey,
      model: ready.model,
      messages: mode === 'continue'
        ? buildContinueChapterPrompt(novel, chapter, scene.id)
        : buildChapterFromOutlinePrompt(novel, chapter, previousChapter),
      temperature: 0.8,
      maxTokens: 1500,
      stream: true,
    });
    if (runRef.current !== runId) return;
    requestIdRef.current = null;
    setGeneratingChapterId(null);
    setGeneratingSceneId(null);
    if (!result.ok || !result.text) {
      streamTextRef.current = '';
      generationPrefixRef.current = '';
      setStreamingText('');
      setGenerationError({ chapterId: chapter.id, message: result.message || '生成章节正文失败，请稍后重试。' });
      return;
    }
    streamTextRef.current = '';
    setStreamingText('');
    setCancelledVersionId(null);
    const version: ChapterVersion = { id: createId('version'), content: generationPrefixRef.current + result.text, createdAt: new Date().toISOString() };
    generationPrefixRef.current = '';
    const updatedVersions = [...(scene.versions ?? []), version].slice(-MAX_CHAPTER_VERSIONS);
    updateScene(chapter.id, scene.id, { versions: updatedVersions }, true);
    setPreview({ chapterId: chapter.id, sceneId: scene.id, activeVersionId: version.id, contentSnapshot });
  }

  function cancelGeneration() {
    const requestId = requestIdRef.current;
    const cancelledChapterId = generatingChapterId;
    const cancelledSceneId = generatingSceneId;
    const streamedHalf = streamTextRef.current;
    const halfText = generationPrefixRef.current + streamedHalf;
    runRef.current += 1;
    requestIdRef.current = null;
    setGeneratingChapterId(null);
    setGeneratingSceneId(null);
    setOutlineBusy(false);
    review.setBusy(false);
    consistency.setBusy(false);
    rhythm.setBusy(false);
    setForeshadowAiBusy(false);
    setForeshadowCandidates([]);
    setForeshadowPayoffCandidates([]);
    setForeshadowAiRawText('');
    setForeshadowAiError('');
    if (requestId) void rendererBridge.cancelTextGeneration(requestId);
    // PO 拍板：取消后保留已流式生成的半截正文（不回滚），落为一个草稿版本并标记“已取消”，用户可继续编辑或手动清空。
    const cancelledChapter = cancelledChapterId ? chapters.find((chapter) => chapter.id === cancelledChapterId) : undefined;
    const cancelledScene = cancelledChapter?.scenes.find((scene) => scene.id === cancelledSceneId);
    if (cancelledChapter && cancelledScene && streamedHalf.trim()) {
      const version: ChapterVersion = { id: createId('version'), content: halfText, createdAt: new Date().toISOString() };
      const updatedVersions = [...(cancelledScene.versions ?? []), version].slice(-MAX_CHAPTER_VERSIONS);
      updateScene(cancelledChapter.id, cancelledScene.id, { versions: updatedVersions }, true);
      setCancelledVersionId(version.id);
      setPreview({ chapterId: cancelledChapter.id, sceneId: cancelledScene.id, activeVersionId: version.id, contentSnapshot: cancelledScene.content });
    }
    streamTextRef.current = '';
    generationPrefixRef.current = '';
    setStreamingText('');
  }

  async function confirmPreviewWrite() {
    if (!preview || confirmBusyRef.current) return;
    const target = chapters.find((chapter) => chapter.id === preview.chapterId);
    const targetScene = target?.scenes.find((scene) => scene.id === preview.sceneId);
    const version = targetScene?.versions?.find((item) => item.id === preview.activeVersionId);
    if (!target || !targetScene || !version) {
      setPreview(null);
      return;
    }
    confirmBusyRef.current = true;
    try {
      await writeVersionToScene(novel.id, target, targetScene, version, preview.contentSnapshot);
      setPreview(null);
      setGenerationError(null);
    } catch (error) {
      if (error instanceof Error && error.message.includes('取消')) return;
      throw error;
    } finally {
      confirmBusyRef.current = false;
    }
  }

  async function restoreVersion(chapter: Chapter, scene: Scene, version: ChapterVersion) {
    try {
      await writeVersionToScene(novel.id, chapter, scene, version, scene.content);
      setHistoryOpen(false);
    } catch (error) {
      if (error instanceof Error && error.message.includes('取消')) return;
      throw error;
    }
  }

  async function writeVersionToScene(novelId: string, chapter: Chapter, scene: Scene, version: ChapterVersion, contentSnapshot: string) {
    const stored = await novelService.loadNovel(novelId);
    if (!stored.ok || !stored.novel) {
      window.alert('无法确认最新正文状态，请重新加载后再试。');
      throw new Error('加载小说失败，写入已取消。');
    }
    const storedChapter = stored.novel.chapters.find((item) => item.id === chapter.id);
    if (!storedChapter) {
      window.alert('章节不存在，请重新加载后再试。');
      throw new Error('章节不存在，写入已取消。');
    }
    const storedScene = storedChapter.scenes.find((item) => item.id === scene.id);
    if (!storedScene) {
      window.alert('场景不存在，请重新加载后再试。');
      throw new Error('场景不存在，写入已取消。');
    }
    if (storedScene.content !== contentSnapshot && !window.confirm('正文已被修改，写入将覆盖当前内容。仍要写入吗？')) {
      throw new Error('用户取消写入。');
    }
    writeSceneContent(chapter.id, scene.id, version.content, 'ai', version.content.length, version.content.length, version.id);
  }

  async function generateMissingOutlines() {
    if (busy) return;
    const missing = chapters.map((chapter, index) => ({ chapter, index })).filter(({ chapter }) => !chapter.outline?.trim());
    if (!missing.length) return;
    const ready = ensureTextModel(setOutlineError);
    if (!ready) return;
    const requestId = createId('text-request');
    const runId = runRef.current + 1;
    runRef.current = runId;
    requestIdRef.current = requestId;
    setOutlineBusy(true);
    setOutlineError('');
    const result = await rendererBridge.generateText({
      requestId,
      channelId: ready.channelId,
      channelLabel: ready.channelLabel,
      projectId: novel.id,
      requestType: 'novel.generateOutlines',
      baseUrl: ready.baseUrl,
      apiKey: ready.apiKey,
      model: ready.model,
      messages: buildMissingOutlinePrompt(novel, chapters),
      temperature: 0.7,
      maxTokens: 2000,
    });
    if (runRef.current !== runId) return;
    requestIdRef.current = null;
    setOutlineBusy(false);
    if (!result.ok || !result.text) {
      setOutlineError(result.message || '生成后续大纲失败，请稍后重试。');
      return;
    }
    const parsed = parseOutlineText(result.text).filter((item) => item.outline.trim() !== '');
    if (!parsed.length) {
      setOutlineError('未能从生成结果解析出章节大纲，请重试。');
      return;
    }
    const unassigned = [...missing];
    const entries: OutlinePreviewEntry[] = [];
    for (const item of parsed) {
      if (!unassigned.length) break;
      const matchIndex = unassigned.findIndex(({ chapter }) => normalizeTitle(chapter.title) === normalizeTitle(item.title));
      const target = matchIndex >= 0 ? unassigned.splice(matchIndex, 1)[0] : unassigned.shift();
      if (!target) break;
      entries.push({ chapterId: target.chapter.id, label: `第 ${target.index + 1} 章`, title: target.chapter.title || '未命名章节', outline: item.outline.trim() });
    }
    if (!entries.length) {
      setOutlineError('未能从生成结果解析出章节大纲，请重试。');
      return;
    }
    setOutlinePreview(entries);
  }

  function confirmOutlinePreview() {
    if (!outlinePreview) return;
    for (const entry of outlinePreview) {
      const target = chapters.find((chapter) => chapter.id === entry.chapterId);
      if (!target || target.outline?.trim()) continue;
      onUpdateChapter(entry.chapterId, { outline: entry.outline });
    }
    setOutlinePreview(null);
  }

  async function generateChapterReview(chapter: Chapter) {
    if (busy || !chapterText(chapter).trim()) return;
    const ready = ensureTextModel((message) => review.setError(message));
    if (!ready) return;
    await review.run(chapter, { novel, ready, runRef, requestIdRef });
  }

  function cancelReview() {
    review.cancel({ runRef, requestIdRef });
  }

  async function generateChapterConsistency(chapter: Chapter) {
    if (busy || !chapterText(chapter).trim()) return;
    const ready = ensureTextModel(consistency.setError);
    if (!ready) return;
    await consistency.run(chapter, { novel, ready, runRef, requestIdRef });
  }

  function cancelConsistency() {
    consistency.cancel({ runRef, requestIdRef });
  }

  async function generateChapterRhythm(chapter: Chapter) {
    if (busy || !chapterText(chapter).trim()) return;
    const ready = ensureTextModel(rhythm.setError);
    if (!ready) return;
    await rhythm.run(chapter, { novel, ready, runRef, requestIdRef });
  }

  function cancelRhythm() {
    rhythm.cancel({ runRef, requestIdRef });
  }

  // 伏笔 AI 候选状态机：调 generateText + 解析 + 兜底，全部在此层（面板不碰 AI）。写入复用下方 addForeshadowing。
  async function generateForeshadowingCandidates() {
    if (!activeChapter || !chapterText(activeChapter).trim()) {
      setForeshadowAiError('请先选择有正文的章节');
      return;
    }
    if (busy) return;
    const ready = ensureTextModel(setForeshadowAiError);
    if (!ready) return;
    const sourceChapter = activeChapter;
    const requestId = createId('text-request');
    const runId = runRef.current + 1;
    runRef.current = runId;
    requestIdRef.current = requestId;
    setForeshadowAiBusy(true);
    setForeshadowAiError('');
    setForeshadowAiRawText('');
    setForeshadowCandidates([]);
    const result = await rendererBridge.generateText({
      requestId,
      channelId: ready.channelId,
      channelLabel: ready.channelLabel,
      projectId: novel.id,
      requestType: 'novel.foreshadowingCandidates',
      baseUrl: ready.baseUrl,
      apiKey: ready.apiKey,
      model: ready.model,
      messages: buildForeshadowingCandidatesPrompt(novel, sourceChapter),
      temperature: 0.7,
      maxTokens: 800,
    });
    if (runRef.current !== runId) return;
    requestIdRef.current = null;
    setForeshadowAiBusy(false);
    if (!result.ok || !result.text) {
      setForeshadowAiError(result.message || 'AI 生成失败，请稍后重试。');
      return;
    }
    const parsed = parseForeshadowingCandidates(result.text);
    if (parsed.kind === 'ok') {
      setForeshadowCandidates(parsed.candidates.map((candidate) => ({
        id: createId('foreshadow-cand'),
        title: candidate.title,
        note: candidate.note,
        sourceChapterId: sourceChapter.id,
      })));
      setForeshadowAiRawText('');
      setForeshadowAiError('');
    } else if (parsed.kind === 'empty') {
      setForeshadowAiError('AI 未从本章识别出明显伏笔。');
      setForeshadowAiRawText('');
    } else {
      setForeshadowAiRawText(result.text);
      setForeshadowAiError('未能识别为候选，可自行手动记录。');
    }
  }

  function acceptForeshadowingCandidate(candidateId: string) {
    const candidate = foreshadowCandidates.find((item) => item.id === candidateId);
    if (!candidate) return;
    addForeshadowing({
      title: candidate.title,
      plantedChapterId: candidate.sourceChapterId,
      payoffChapterId: '',
      note: candidate.note,
    });
    setForeshadowCandidates((current) => current.filter((item) => item.id !== candidateId));
  }

  function dismissForeshadowingCandidate(candidateId: string) {
    setForeshadowCandidates((current) => current.filter((item) => item.id !== candidateId));
  }

  // 回收候选只给出建议，真正写入仍走 5d.1 的 onUpdateNovel 链；候选绑定生成时章节，避免切章后误挂。
  async function generateForeshadowingPayoffCandidates() {
    if (!activeChapter || !chapterText(activeChapter).trim()) {
      setForeshadowAiError('请先选择有正文的章节');
      return;
    }
    if (busy) return;
    if (!plantedForeshadowings.length) {
      setForeshadowAiError('暂无待回收伏笔');
      return;
    }
    const ready = ensureTextModel(setForeshadowAiError);
    if (!ready) return;
    const sourceChapter = activeChapter;
    const sourcePlanted = plantedForeshadowings;
    const requestId = createId('text-request');
    const runId = runRef.current + 1;
    runRef.current = runId;
    requestIdRef.current = requestId;
    setForeshadowAiBusy(true);
    setForeshadowAiError('');
    setForeshadowAiRawText('');
    setForeshadowPayoffCandidates([]);
    const result = await rendererBridge.generateText({
      requestId,
      channelId: ready.channelId,
      channelLabel: ready.channelLabel,
      projectId: novel.id,
      requestType: 'novel.foreshadowingPayoffCandidates',
      baseUrl: ready.baseUrl,
      apiKey: ready.apiKey,
      model: ready.model,
      messages: buildForeshadowingPayoffCandidatesPrompt(novel, sourceChapter, sourcePlanted),
      temperature: 0.7,
      maxTokens: 700,
    });
    if (runRef.current !== runId) return;
    requestIdRef.current = null;
    setForeshadowAiBusy(false);
    if (!result.ok || !result.text) {
      setForeshadowAiError(result.message || 'AI 生成失败，请稍后重试。');
      return;
    }
    const parsed = parseForeshadowingPayoffCandidates(result.text, sourcePlanted.map((item) => item.id));
    if (parsed.kind === 'ok') {
      setForeshadowPayoffCandidates(parsed.candidates.map((candidate) => ({
        id: createId('foreshadow-payoff-cand'),
        foreshadowingId: candidate.foreshadowingId,
        note: candidate.note,
        sourceChapterId: sourceChapter.id,
      })));
      setForeshadowAiRawText('');
      setForeshadowAiError('');
    } else if (parsed.kind === 'empty') {
      setForeshadowPayoffCandidates([]);
      setForeshadowAiError('AI 未从本章识别出明显回收线索。');
      setForeshadowAiRawText('');
    } else {
      setForeshadowAiRawText(result.text);
      setForeshadowAiError('未能识别为回收候选，可手动标记回收。');
    }
  }

  function acceptForeshadowingPayoffCandidate(candidateId: string) {
    const candidate = foreshadowPayoffCandidates.find((item) => item.id === candidateId);
    if (!candidate) return;
    const now = new Date().toISOString();
    onUpdateNovel((current) => {
      let changed = false;
      const foreshadowings = current.foreshadowings.map((item) => {
        if (item.id !== candidate.foreshadowingId || item.status !== 'planted') return item;
        changed = true;
        return {
          ...item,
          status: 'paidOff' as const,
          payoffChapterId: candidate.sourceChapterId,
          updatedAt: now,
        };
      });
      return changed ? { ...current, updatedAt: now, foreshadowings } : current;
    });
    setForeshadowPayoffCandidates((current) => current.filter((item) => item.id !== candidateId));
  }

  function dismissForeshadowingPayoffCandidate(candidateId: string) {
    setForeshadowPayoffCandidates((current) => current.filter((item) => item.id !== candidateId));
  }

  function closeForeshadowPanel() {
    if (foreshadowAiBusy) cancelGeneration();
    setForeshadowOpen(false);
  }

  // 伏笔 CRUD：受控写入，全部走 onUpdateNovel（= NovelCreation 现有 updateNovel 链），零新 IPC、零 AI。
  function addForeshadowing(draft: ForeshadowingDraft) {
    const now = new Date().toISOString();
    const entry: Foreshadowing = {
      id: createId('foreshadow'),
      title: draft.title,
      plantedChapterId: draft.plantedChapterId,
      status: 'planted',
      payoffChapterId: draft.payoffChapterId || undefined,
      note: draft.note || undefined,
      createdAt: now,
      updatedAt: now,
    };
    onUpdateNovel((current) => ({ ...current, updatedAt: now, foreshadowings: [...current.foreshadowings, entry] }));
  }

  function editForeshadowing(id: string, draft: ForeshadowingDraft) {
    const now = new Date().toISOString();
    onUpdateNovel((current) => ({
      ...current,
      updatedAt: now,
      foreshadowings: current.foreshadowings.map((item) => item.id === id ? {
        ...item,
        title: draft.title,
        plantedChapterId: draft.plantedChapterId,
        payoffChapterId: draft.payoffChapterId || undefined,
        note: draft.note || undefined,
        updatedAt: now,
      } : item),
    }));
  }

  function toggleForeshadowingStatus(id: string) {
    const now = new Date().toISOString();
    onUpdateNovel((current) => ({
      ...current,
      updatedAt: now,
      foreshadowings: current.foreshadowings.map((item) => item.id === id ? {
        ...item,
        status: item.status === 'planted' ? 'paidOff' : 'planted',
        updatedAt: now,
      } : item),
    }));
  }

  function deleteForeshadowing(id: string) {
    const now = new Date().toISOString();
    onUpdateNovel((current) => ({
      ...current,
      updatedAt: now,
      foreshadowings: current.foreshadowings.filter((item) => item.id !== id),
    }));
  }

  function togglePinnedForeshadowing(id: string) {
    const now = new Date().toISOString();
    onUpdateNovel((current) => {
      const ids = current.pinnedForeshadowingIds ?? [];
      if (!ids.includes(id) && ids.length + (current.pinnedSettingIds?.length ?? 0) >= PINNED_CONTEXT_LIMIT) return current;
      return { ...current, pinnedForeshadowingIds: ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id], updatedAt: now };
    });
  }

  function renderMain() {
    if (!chapters.length) {
      return (
        <div className="novel-workbench__state">
          <strong>还没有章节</strong>
          <span>到「项目详情」的章节大纲页新增章节，或通过灵感模式生成章节大纲后，再回到工作台开始创作。</span>
        </div>
      );
    }
    if (!activeChapter) {
      return (
        <div className="novel-workbench__state">
          <strong>选择章节开始创作</strong>
          <span>从左侧章节列表中选择一个章节，开始你的创作之旅。</span>
        </div>
      );
    }
    if (!activeScene) {
      return (
        <div className="novel-workbench__state">
          <strong>场景数据不可用</strong>
          <span>请重新打开小说以修复场景结构。</span>
        </div>
      );
    }
    const status = chapterStatus(activeChapter);
    const isFirstPending = activeIndex === firstPendingIndex;
    const hasOutline = Boolean(activeChapter.outline?.trim());
    const chapterError = generationError && generationError.chapterId === activeChapter.id ? generationError.message : '';
    const versions = activeScene.versions ?? [];
    const chapterPreview = preview && preview.chapterId === activeChapter.id && preview.sceneId === activeScene.id ? preview : null;
    const activeVersion = chapterPreview ? versions.find((item) => item.id === chapterPreview.activeVersionId) ?? null : null;
    const atVersionCap = versions.length >= MAX_CHAPTER_VERSIONS;
    return (
      <>
        <header className="novel-workbench__chapter-head">
          <div className="novel-workbench__chapter-title">
            <h2>第 {activeIndex + 1} 章 · {activeChapter.title || '未命名章节'}</h2>
            <span className={`novel-workbench__pill novel-workbench__pill--${status}`}>{statusLabel(status)}</span>
          </div>
          <p className={activeChapter.outline?.trim() ? 'novel-workbench__outline' : 'novel-workbench__outline novel-workbench__outline--empty'}>{activeChapter.outline?.trim() || '本章暂无大纲'}</p>
        </header>
        <section className="novel-workbench__scenes" aria-label="章内场景">
          <div className="novel-workbench__scenes-head">
            <strong>场景</strong>
            <button aria-label="新建场景" className="novel-flow__ghost" disabled={busy} onClick={addScene} type="button">新建场景</button>
          </div>
          <div className="novel-workbench__scene-list">
            {activeScenes.map((scene, index) => {
              const label = scene.title.trim() || `场景 ${index + 1}`;
              const isActive = scene.id === activeScene.id;
              return (
                <div className={isActive ? 'novel-workbench__scene novel-workbench__scene--active' : 'novel-workbench__scene'} key={scene.id}>
                  <button
                    aria-label={`切换到${label}`}
                    aria-pressed={isActive}
                    className="novel-workbench__scene-select"
                    disabled={busy}
                    onClick={() => setActiveSceneId(scene.id)}
                    type="button"
                  >
                    <strong>{label}</strong>
                    <span>{countWords(scene.content)} 字</span>
                  </button>
                  <input
                    aria-label={`重命名场景 ${index + 1}`}
                    className="novel-workbench__scene-title"
                    disabled={busy}
                    onBlur={(event) => handleRenameScene(scene.id, event.target.value.trim())}
                    onChange={(event) => handleRenameScene(scene.id, event.target.value)}
                    onFocus={() => setActiveSceneId(scene.id)}
                    placeholder={`场景 ${index + 1}`}
                    value={scene.title}
                  />
                  <input
                    aria-label={`场景 ${index + 1} 大纲`}
                    className="novel-workbench__scene-outline"
                    disabled={busy}
                    onChange={(event) => handleSceneOutline(scene.id, event.target.value)}
                    onFocus={() => setActiveSceneId(scene.id)}
                    placeholder="场景大纲（可选）"
                    value={scene.outline ?? ''}
                  />
                  <button aria-label={`上移场景 ${index + 1}`} className="novel-flow__ghost" disabled={busy || index === 0} onClick={() => moveScene(scene.id, 'up')} type="button">上移</button>
                  <button aria-label={`下移场景 ${index + 1}`} className="novel-flow__ghost" disabled={busy || index === activeScenes.length - 1} onClick={() => moveScene(scene.id, 'down')} type="button">下移</button>
                  <button aria-label={`删除场景 ${index + 1}`} className="novel-flow__ghost" disabled={busy || !canRemoveScene(activeChapter.scenes)} onClick={() => deleteScene(scene.id, index + 1)} type="button">删除</button>
                </div>
              );
            })}
          </div>
        </section>
        {status === 'generating' ? (
          <div className="novel-workbench__state novel-workbench__state--streaming">
            <div className="novel-workbench__stream-head">
              <span className="novel-workbench__spinner" aria-hidden="true" />
              <strong>正在生成章节正文…</strong>
            </div>
            {streamingText ? (
              <p className="novel-workbench__stream-text">{streamingText}</p>
            ) : (
              <span>生成完成后会先展示草稿版本，确认后才会写入正文。</span>
            )}
            <button className="novel-flow__ghost" onClick={cancelGeneration} type="button">取消生成</button>
          </div>
        ) : chapterPreview && activeVersion ? (
          <div className="novel-workbench__draft">
            <div className="novel-workbench__draft-head">
              <strong>正文草稿{activeVersion.id === cancelledVersionId ? '（已取消）' : ''}</strong>
              <span>{countWords(activeVersion.content)} 字 · {activeVersion.id === cancelledVersionId ? '已取消生成，可编辑后写入或另生成一版' : '确认后写入本章正文'}</span>
            </div>
            <div className="novel-workbench__versions">
              {versions.map((version, index) => (
                <button
                  className={version.id === chapterPreview.activeVersionId ? 'novel-workbench__version-pill novel-workbench__version-pill--active' : 'novel-workbench__version-pill'}
                  key={version.id}
                  onClick={() => setPreview({ ...chapterPreview, activeVersionId: version.id })}
                  type="button"
                >
                  版本 {index + 1}
                </button>
              ))}
              {atVersionCap && <span className="novel-workbench__hint">已达 {MAX_CHAPTER_VERSIONS} 个版本上限</span>}
            </div>
            <p>{activeVersion.content}</p>
            <footer>
              {chapterError && <p className="novel-flow__error">{chapterError}</p>}
              <button className="novel-flow__ghost" onClick={() => setPreview(null)} type="button">关闭预览</button>
              <button className="novel-flow__ghost" disabled={busy || atVersionCap} onClick={() => void generateChapterBody()} type="button">再生成一版</button>
              <button className="novel-flow__primary novel-flow__primary--compact" onClick={() => void confirmPreviewWrite()} type="button">确认写入</button>
            </footer>
          </div>
        ) : status === 'done' ? (
          <div className="novel-workbench__editor">
            <div className="novel-workbench__editor-meta">
              <span>{saveStatusLabel(saveStatus)}</span>
              <span>{countWords(activeScene.content)} 字（当前场景）</span>
              {saveStatus === 'failed' && <button className="novel-flow__ghost" onClick={onRetrySave} type="button">重试保存</button>}
              {versions.length > 0 && <button className="novel-flow__ghost" onClick={() => setHistoryOpen(true)} type="button">历史版本</button>}
              <button className="novel-flow__ghost" disabled={busy || atVersionCap} onClick={() => void generateChapterBody('continue')} type="button">AI 续写</button>
              {chapterText(activeChapter).trim() && (
                <button className="novel-flow__ghost" disabled={busy} onClick={() => void generateChapterReview(activeChapter)} type="button">章节评审</button>
              )}
              {chapterText(activeChapter).trim() && (
                <button className="novel-flow__ghost" disabled={busy} onClick={() => void generateChapterConsistency(activeChapter)} type="button">一致性检查</button>
              )}
              {chapterText(activeChapter).trim() && (
                <button className="novel-flow__ghost" disabled={busy} onClick={() => void generateChapterRhythm(activeChapter)} type="button">节奏检查</button>
              )}
              <button className="novel-flow__ghost" disabled={busy} onClick={openOptimizeType} type="button">优化选区</button>
            </div>
            {rhythm.busy && (
              <div className="novel-workbench__review-loading">
                <span className="novel-workbench__spinner" aria-hidden="true" />
                <span>正在检查节奏…</span>
                <button className="novel-flow__ghost" onClick={cancelRhythm} type="button">取消</button>
              </div>
            )}
            {consistency.busy && (
              <div className="novel-workbench__review-loading">
                <span className="novel-workbench__spinner" aria-hidden="true" />
                <span>正在检查一致性…</span>
                <button className="novel-flow__ghost" onClick={cancelConsistency} type="button">取消</button>
              </div>
            )}
            {optimizeJob?.status === 'loading' && optimizeJob.chapterId === activeChapter.id && (
              <div className="novel-workbench__optimize-loading">
                <span className="novel-workbench__spinner" aria-hidden="true" />
                <span>正在优化选区…</span>
                <button className="novel-flow__ghost" onClick={cancelOptimize} type="button">取消优化</button>
              </div>
            )}
            {review.busy && (
              <div className="novel-workbench__review-loading">
                <span className="novel-workbench__spinner" aria-hidden="true" />
                <span>正在评审章节…</span>
                <button className="novel-flow__ghost" onClick={cancelReview} type="button">取消</button>
              </div>
            )}
            {review.error && <p className="novel-flow__error">{review.error}</p>}
            {consistency.error && <p className="novel-flow__error">{consistency.error}</p>}
            {rhythm.error && <p className="novel-flow__error">{rhythm.error}</p>}
            {optimizeError && <p className="novel-flow__error">{optimizeError}</p>}
            <ChapterFindReplace
              content={activeScene.content}
              disabled={busy}
              onLocate={locateEditorMatch}
              onReplace={(content, selectionStart, selectionEnd) => writeSceneContent(activeChapter.id, activeScene.id, content, 'replace', selectionStart, selectionEnd)}
            />
            <div className="novel-workbench__progress-bar">
              <label className="novel-workbench__progress-field">
                <span>{PROGRESS_LABELS.statusCompletion.slice(0, 2)}</span>
                <select
                  value={resolveChapterStatus(activeChapter)}
                  disabled={busy}
                  onChange={(event) => onUpdateChapterAndSave(activeChapter.id, { status: event.target.value as NovelChapterStatus })}
                >
                  {CHAPTER_STATUS_ORDER.map((status) => (
                    <option key={status} value={status}>{CHAPTER_STATUS_LABEL[status]}</option>
                  ))}
                </select>
              </label>
              <label className="novel-workbench__progress-field">
                <span>{PROGRESS_LABELS.chapterTarget}</span>
                <input
                  type="number"
                  min={0}
                  step={100}
                  value={activeChapter.wordTarget ?? ''}
                  disabled={busy}
                  placeholder={PROGRESS_LABELS.targetPlaceholder}
                  onChange={(event) => {
                    const raw = Number(event.target.value);
                    const next = Number.isFinite(raw) && raw > 0 ? Math.round(raw) : undefined;
                    onUpdateChapterAndSave(activeChapter.id, { wordTarget: next });
                  }}
                />
              </label>
              <span className="novel-workbench__progress-count">
                {countWords(chapterText(activeChapter))}{activeChapter.wordTarget ? ` / ${activeChapter.wordTarget}` : ''}
              </span>
            </div>
            {(() => {
              const words = countWords(chapterText(activeChapter));
              const target = activeChapter.wordTarget;
              if (target && words < target) return <p className="novel-workbench__soft-hint">{SOFT_GATE_HINTS.belowTarget(target - words)}</p>;
              if (target && words >= target && resolveChapterStatus(activeChapter) !== 'done') return <p className="novel-workbench__soft-hint">{SOFT_GATE_HINTS.reachedTarget}</p>;
              if (!target && words >= 1000 && resolveChapterStatus(activeChapter) !== 'done') return <p className="novel-workbench__soft-hint">{SOFT_GATE_HINTS.markDone}</p>;
              return null;
            })()}
            <textarea
              ref={textareaRef}
              value={activeScene.content}
              onChange={(event) => handleManualContentChange(event.currentTarget)}
              onKeyDown={handleEditorKeyDown}
              onKeyUp={(event) => recordSelection(event.currentTarget)}
              onMouseUp={(event) => recordSelection(event.currentTarget)}
              onSelect={(event) => recordSelection(event.currentTarget)}
              readOnly={busy}
              placeholder="继续打磨当前场景正文…"
            />
          </div>
        ) : isFirstPending ? (
          <div className="novel-workbench__state">
            <button className="novel-workbench__start-button" disabled={busy || !hasOutline || atVersionCap} onClick={() => void generateChapterBody()} type="button">{chapterError ? '重试生成' : '开始创作'}</button>
            <span>{hasOutline ? '前面的章节都已完成，可以按顺序生成本章正文。' : '本章还没有大纲，请先通过左侧「生成后续大纲」补齐本章大纲。'}</span>
            {chapterError && <p className="novel-flow__error">{chapterError}</p>}
            {atVersionCap && <span className="novel-workbench__hint">已达 {MAX_CHAPTER_VERSIONS} 个版本上限，请从已有草稿版本中选定写入。</span>}
            {versions.length > 0 && (
              <button className="novel-flow__ghost" onClick={() => setPreview({ chapterId: activeChapter.id, sceneId: activeScene.id, activeVersionId: versions[versions.length - 1].id, contentSnapshot: activeScene.content })} type="button">
                查看草稿版本（{versions.length}）
              </button>
            )}
          </div>
        ) : (
          <div className="novel-workbench__state">
            <button className="novel-workbench__start-button" disabled type="button">开始创作</button>
            <span>请先完成前面的章节，才能生成此章节。</span>
          </div>
        )}
      </>
    );
  }

  return (
    <section className="novel-workbench" aria-label="章节创作工作台">
      <header className="novel-workbench__bar">
        <div className="novel-workbench__bar-left">
          <button className="novel-flow__ghost" disabled={busy} onClick={onBackToProjects} type="button">返回</button>
          <div className="novel-workbench__title">
            <h1>{novel.title}</h1>
            <span>{summaryBrief ? `${summaryBrief} · ` : ''}{progress}% 完成 · {doneCount}/{chapters.length} 章</span>
          </div>
        </div>
        <button className="novel-flow__ghost" onClick={() => setForeshadowOpen(true)} type="button">伏笔记录</button>
        <button className="novel-flow__ghost" disabled={busy} onClick={onOpenProjectView} type="button">项目详情</button>
      </header>
      <div className="novel-workbench__body">
        <aside className="novel-workbench__side" aria-label="蓝图与章节列表">
          <section className="novel-workbench__blueprint">
            <h2>故事蓝图</h2>
            <p>{blueprintBrief || '还没有蓝图，可在项目详情中补充。'}</p>
          </section>
          <div className="novel-workbench__stats">
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
              {chapterGroups.map((group) => group.chapters.length > 0 && (
                <section className="novel-workbench__volume" key={group.volume?.id ?? 'unassigned'}>
                  <h4>{group.volume?.title ?? '未分卷'}<span>{group.chapters.length} 章</span></h4>
                  {group.chapters.map((chapter) => {
                    const index = chapters.findIndex((item) => item.id === chapter.id);
                    const status = chapterStatus(chapter);
                    return (
                      <button className={chapter.id === activeChapterId ? 'novel-workbench__chapter novel-workbench__chapter--active' : 'novel-workbench__chapter'} disabled={busy && generatingChapterId === null} id={`workbench-chapter-${chapter.id}`} key={chapter.id} onClick={() => selectChapter(chapter.id)} type="button">
                        <span className="novel-workbench__chapter-row">
                          <strong>第 {index + 1} 章 · {chapter.title || '未命名章节'}</strong>
                          <span className={`novel-workbench__pill novel-workbench__pill--${status}`}>{statusLabel(status)}</span>
                        </span>
                        <span className="novel-workbench__chapter-outline">{brief(chapter.outline ?? '', 44) || '暂无大纲'}</span>
                      </button>
                    );
                  })}
                </section>
              ))}
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
              {missingOutlineCount === 0 && <span className="novel-workbench__hint">所有章节都已有大纲</span>}
              {outlineError && <p className="novel-flow__error">{outlineError}</p>}
            </div>
          )}
          <section className="novel-workbench__settings" aria-label={SETTING_LABELS.sidebarTitle}>
            <div className="novel-workbench__list-head"><h3>{SETTING_LABELS.sidebarTitle}</h3></div>
            {settingGroups.length ? (
              <div className="novel-workbench__settings-list">
                {settingGroups.map((group) => (
                  <div className="novel-workbench__settings-group" key={group.type}>
                    <span className="novel-workbench__settings-type">{group.label}</span>
                    {group.entries.map((entry) => (
                      <div className="novel-workbench__settings-item" key={entry.id}>
                        <strong>{entry.title}</strong>
                        {entry.body && <p>{entry.body}</p>}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <span className="novel-workbench__hint">{SETTING_LABELS.sidebarEmpty}</span>
            )}
          </section>
        </aside>
        <section className="novel-workbench__main" aria-label="章节创作区">
          <div className="novel-workbench__main-inner" key={`${activeChapterId ?? 'none'}:${activeSceneId ?? 'none'}`}>{renderMain()}</div>
        </section>
      </div>
      {outlinePreview && (
        <div className="novel-modal" role="dialog" aria-modal="true" aria-label="后续大纲预览" onClick={() => setOutlinePreview(null)}>
          <div className="novel-workbench__preview" onClick={(event) => event.stopPropagation()}>
            <h2>后续大纲预览</h2>
            <p className="novel-workbench__preview-sub">确认后只写入下列缺少大纲的章节，已有大纲不会被覆盖。</p>
            <div className="novel-workbench__preview-list">
              {outlinePreview.map((entry) => (
                <article key={entry.chapterId}>
                  <strong>{entry.label} · {entry.title}</strong>
                  <p>{entry.outline}</p>
                </article>
              ))}
            </div>
            <footer>
              <button className="novel-flow__ghost" onClick={() => setOutlinePreview(null)} type="button">取消</button>
              <button className="novel-flow__primary novel-flow__primary--compact" onClick={confirmOutlinePreview} type="button">确认写入</button>
            </footer>
          </div>
        </div>
      )}
      {historyOpen && activeChapter && activeScene && (activeScene.versions?.length ?? 0) > 0 && (
        <div className="novel-modal" role="dialog" aria-modal="true" aria-label="历史版本" onClick={() => setHistoryOpen(false)}>
          <div className="novel-workbench__preview" onClick={(event) => event.stopPropagation()}>
            <h2>历史版本</h2>
            <p className="novel-workbench__preview-sub">写回会用所选版本覆盖当前正文，需再次确认；手动编辑不会改动这些版本。</p>
            <div className="novel-workbench__preview-list">
              {(activeScene.versions ?? []).map((version, index) => (
                <article key={version.id}>
                  <div className="novel-workbench__version-row">
                    <strong>版本 {index + 1} · {countWords(version.content)} 字 · {formatTime(version.createdAt)}</strong>
                    {activeScene.selectedVersionId === version.id && <span className="novel-workbench__pill novel-workbench__pill--done">当前选定</span>}
                    <button className="novel-flow__ghost" onClick={() => restoreVersion(activeChapter, activeScene, version)} type="button">写回正文</button>
                  </div>
                  <p>{brief(version.content, 120)}</p>
                </article>
              ))}
            </div>
            <footer>
              <button className="novel-flow__ghost" onClick={() => setHistoryOpen(false)} type="button">关闭</button>
            </footer>
          </div>
        </div>
      )}
      {review.result && review.result.chapterId === activeChapter?.id && (
        <div className="novel-modal" role="dialog" aria-modal="true" aria-label="章节评审" onClick={() => review.setResult(null)}>
          <div className="novel-workbench__preview" onClick={(event) => event.stopPropagation()}>
            <h2>章节评审</h2>
            <p className="novel-workbench__preview-sub">AI 基于作品蓝图和章节大纲给出的评审意见，仅供参考。</p>
            <div className="novel-workbench__preview-list">
              {review.result.content.split('\n').filter((p) => p.trim()).map((paragraph, index) => (
                <article key={index}>
                  <p>{paragraph}</p>
                </article>
              ))}
            </div>
            <footer>
              <button className="novel-flow__ghost" onClick={() => review.setResult(null)} type="button">关闭</button>
              <button className="novel-flow__ghost" disabled={busy} onClick={() => void generateChapterReview(activeChapter!)} type="button">重新评审</button>
            </footer>
          </div>
        </div>
      )}
      {consistency.result && consistency.result.chapterId === activeChapter?.id && (
        <div className="novel-modal" role="dialog" aria-modal="true" aria-label="一致性检查" onClick={() => consistency.setResult(null)}>
          <div className="novel-workbench__preview" onClick={(event) => event.stopPropagation()}>
            <h2>一致性检查</h2>
            <p className="novel-workbench__preview-sub">AI 基于作品蓝图、前文摘录和本章正文给出的只读一致性报告，关闭后不保存。</p>
            <div className="novel-workbench__preview-list">
              {consistency.result.content.split('\n').filter((p) => p.trim()).map((paragraph, index) => (
                <article key={index}>
                  <p>{paragraph}</p>
                </article>
              ))}
            </div>
            <footer>
              <button className="novel-flow__ghost" onClick={() => consistency.setResult(null)} type="button">关闭</button>
            </footer>
          </div>
        </div>
      )}
      {rhythm.result && rhythm.result.chapterId === activeChapter?.id && (
        <div className="novel-modal" role="dialog" aria-modal="true" aria-label="节奏检查" onClick={() => rhythm.setResult(null)}>
          <div className="novel-workbench__preview" onClick={(event) => event.stopPropagation()}>
            <h2>节奏检查</h2>
            <p className="novel-workbench__preview-sub">AI 基于作品蓝图、章节大纲和本章正文给出的只读节奏报告，关闭后不保存。</p>
            <div className="novel-workbench__preview-list">
              {rhythm.result.content.split('\n').filter((p) => p.trim()).map((paragraph, index) => (
                <article key={index}>
                  <p>{paragraph}</p>
                </article>
              ))}
            </div>
            <footer>
              <button className="novel-flow__ghost" onClick={() => rhythm.setResult(null)} type="button">关闭</button>
            </footer>
          </div>
        </div>
      )}
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
              <button className="novel-flow__primary novel-flow__primary--compact" onClick={() => void startOptimize('action')} type="button">动作描写优化</button>
            </footer>
          </div>
        </div>
      )}
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
      {foreshadowOpen && (
        <ForeshadowingPanel
          foreshadowings={novel.foreshadowings}
          chapters={chapters}
          onAdd={addForeshadowing}
          onEdit={editForeshadowing}
          onToggleStatus={toggleForeshadowingStatus}
          onDelete={deleteForeshadowing}
          pinnedIds={novel.pinnedForeshadowingIds}
          pinLimitReached={(novel.pinnedSettingIds?.length ?? 0) + (novel.pinnedForeshadowingIds?.length ?? 0) >= PINNED_CONTEXT_LIMIT}
          onTogglePin={togglePinnedForeshadowing}
          onClose={closeForeshadowPanel}
          aiCandidates={foreshadowCandidates.map<ForeshadowingAiCandidate>((candidate) => ({
            id: candidate.id,
            title: candidate.title,
            note: candidate.note,
          }))}
          aiPayoffCandidates={foreshadowPayoffCandidates.map<ForeshadowingPayoffAiCandidate>((candidate) => ({
            id: candidate.id,
            title: novel.foreshadowings.find((item) => item.id === candidate.foreshadowingId)?.title ?? '伏笔已不存在',
            note: candidate.note,
          }))}
          aiBusy={foreshadowAiBusy}
          aiError={foreshadowAiError}
          aiRawText={foreshadowAiRawText}
          aiGenerateDisabledReason={foreshadowGenerateDisabledReason}
          aiPayoffGenerateDisabledReason={foreshadowPayoffGenerateDisabledReason}
          onGenerateAiCandidates={generateForeshadowingCandidates}
          onAcceptAiCandidate={acceptForeshadowingCandidate}
          onDismissAiCandidate={dismissForeshadowingCandidate}
          onGenerateAiPayoffCandidates={generateForeshadowingPayoffCandidates}
          onAcceptAiPayoffCandidate={acceptForeshadowingPayoffCandidate}
          onDismissAiPayoffCandidate={dismissForeshadowingPayoffCandidate}
        />
      )}
    </section>
  );
}

function statusLabel(status: ChapterStatus): string {
  if (status === 'done') return '已完成';
  if (status === 'generating') return '生成中';
  return '未开始';
}

function brief(text: string, max: number): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length > max ? `${Array.from(normalized).slice(0, max).join('')}…` : normalized;
}

function normalizeTitle(title: string): string {
  return title.replace(/[\s《》「」·、，。：:.-]+/g, '').toLowerCase();
}
