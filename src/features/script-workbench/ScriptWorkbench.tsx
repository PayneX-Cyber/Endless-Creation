import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  Episode,
  ProjectSettings,
  ProjectSettingEntry,
  Script,
  ScriptScene,
  ScriptSummary,
  SettingReference,
} from '../../types/script';
import { rendererBridge } from '../../services/rendererBridge';
import { scriptService } from '../../services/scriptService';
import { projectSettingsService } from '../../services/projectSettingsService';
import {
  addEpisode,
  addScene,
  cloneScriptSnapshot,
  moveEpisode,
  moveScene,
  removeEpisode,
  removeScene,
  renameEpisode,
  restoreEpisode,
  restoreScene,
  updateScene,
} from './scriptDomain';
import {
  ConfirmDialog,
  EpisodeList,
  ReferencePanel,
  SceneList,
  ScriptEditor,
  ScriptLibraryPanel,
  SharedSettingsPanel,
  UndoToast,
  type ConfirmState,
} from './ScriptPanels';
import './ScriptWorkbench.css';

type SaveStatus = 'saved' | 'dirty' | 'saving' | 'failed';

type UndoState =
  | {
      kind: 'script';
      message: string;
      snapshot: Script;
    }
  | {
      kind: 'episode';
      message: string;
      scriptId: string;
      episode: Episode;
      index: number;
    }
  | {
      kind: 'scene';
      message: string;
      scriptId: string;
      episodeId: string;
      scene: ScriptScene;
      index: number;
    };

export interface ScriptWorkbenchProps {
  projectId: string;
  registerBeforeWorkspaceChange?: (handler: (() => Promise<boolean>) | null) => void;
}

export function ScriptWorkbench({ projectId, registerBeforeWorkspaceChange }: ScriptWorkbenchProps) {
  const [summaries, setSummaries] = useState<ScriptSummary[]>([]);
  const [draft, setDraft] = useState<Script | null>(null);
  const [activeScriptId, setActiveScriptId] = useState<string | null>(null);
  const [activeEpisodeId, setActiveEpisodeId] = useState<string | null>(null);
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [undoState, setUndoState] = useState<UndoState | null>(null);
  const [settings, setSettings] = useState<ProjectSettings | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [editorLoading, setEditorLoading] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  const latestDraftRef = useRef<Script | null>(null);
  const latestSaveStatusRef = useRef<SaveStatus>('saved');
  const saveInFlightRef = useRef<Promise<boolean> | null>(null);
  const revisionRef = useRef(0);
  const projectIdRef = useRef(projectId);

  useEffect(() => {
    latestDraftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    latestSaveStatusRef.current = saveStatus;
  }, [saveStatus]);

  const refreshSummaries = useCallback(async (targetProjectId = projectId) => {
    const result = await scriptService.listScripts(targetProjectId);
    if (projectIdRef.current !== targetProjectId) return;
    if (result.ok) {
      setSummaries(result.summaries ?? []);
      setListError(null);
    } else {
      setListError(result.message ?? '加载剧本列表失败。');
    }
  }, [projectId]);

  const refreshSettings = useCallback(async (targetProjectId = projectId) => {
    const result = await projectSettingsService.load(targetProjectId);
    if (projectIdRef.current !== targetProjectId) return;
    if (result.ok && result.settings) {
      setSettings(result.settings);
    } else if (!result.ok) {
      setEditorError(result.message ?? '加载共享设定失败。');
    }
  }, [projectId]);

  // 项目切换由 App 在更新 projectId 前执行 flush；此处只重置并加载新上下文。
  useEffect(() => {
    projectIdRef.current = projectId;
    setUndoState(null);
    setSummaries([]);
    setSettings(null);
    setDraft(null);
    setActiveScriptId(null);
    setActiveEpisodeId(null);
    setActiveSceneId(null);
    setSaveStatus('saved');
    latestSaveStatusRef.current = 'saved';
    latestDraftRef.current = null;
    revisionRef.current = 0;
    setListError(null);
    setEditorError(null);
    void refreshSummaries(projectId);
    void refreshSettings(projectId);
  }, [projectId, refreshSummaries, refreshSettings]);

  // 选中剧本时加载完整树 draft。
  useEffect(() => {
    if (!activeScriptId) {
      setDraft(null);
      return;
    }
    let cancelled = false;
    setEditorLoading(true);
    setEditorError(null);
    (async () => {
      const result = await scriptService.loadScript(projectId, activeScriptId);
      if (cancelled || projectIdRef.current !== projectId) return;
      if (result.ok && result.script) {
        latestDraftRef.current = result.script;
        setDraft(result.script);
        setSaveStatus('saved');
        latestSaveStatusRef.current = 'saved';
        revisionRef.current = 0;
        setActiveEpisodeId(result.script.episodes[0]?.id ?? null);
        setActiveSceneId(result.script.episodes[0]?.scenes[0]?.id ?? null);
      } else {
        setEditorError(result.message ?? '剧本加载失败。');
      }
      setEditorLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeScriptId, projectId]);

  const saveDraft = useCallback((target?: Script): Promise<boolean> => {
    const script = target ?? latestDraftRef.current;
    if (!script) return Promise.resolve(true);
    const revisionAtStart = revisionRef.current;
    setSaveStatus('saving');
    latestSaveStatusRef.current = 'saving';
    const operation = (async () => {
      try {
        const result = await scriptService.saveScript(script);
        if (!result.ok) throw new Error(result.message);
        if (revisionRef.current === revisionAtStart) {
          setSaveStatus('saved');
          latestSaveStatusRef.current = 'saved';
        }
        void refreshSummaries(script.projectId);
        return true;
      } catch {
        setSaveStatus('failed');
        latestSaveStatusRef.current = 'failed';
        return false;
      }
    })();
    saveInFlightRef.current = operation;
    void operation.finally(() => {
      if (saveInFlightRef.current === operation) saveInFlightRef.current = null;
    });
    return operation;
  }, [refreshSummaries]);

  const flushLatestDraft = useCallback(async (): Promise<boolean> => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const inFlight = saveInFlightRef.current;
      if (inFlight) await inFlight;
      const status = latestSaveStatusRef.current;
      const script = latestDraftRef.current;
      if (!script || status === 'saved') return true;
      if (status === 'dirty' || status === 'failed') {
        const revisionAtStart = revisionRef.current;
        if (!await saveDraft(script)) return false;
        if (
          revisionRef.current === revisionAtStart
          && latestSaveStatusRef.current === 'saved'
        ) {
          return true;
        }
      }
    }
    return latestDraftRef.current === null || latestSaveStatusRef.current === 'saved';
  }, [saveDraft]);

  const prepareWorkspaceChange = useCallback(async (): Promise<boolean> => {
    const saved = await flushLatestDraft();
    if (saved) setUndoState(null);
    return saved;
  }, [flushLatestDraft]);

  // 600ms 防抖保存。
  useEffect(() => {
    if (saveStatus !== 'dirty') return;
    const handle = window.setTimeout(() => { void saveDraft(); }, 600);
    return () => window.clearTimeout(handle);
  }, [saveStatus, draft, saveDraft]);

  // Ctrl+S 立即保存。
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (latestSaveStatusRef.current === 'dirty' || latestSaveStatusRef.current === 'failed') {
          void saveDraft();
        }
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [saveDraft]);

  useEffect(() => {
    registerBeforeWorkspaceChange?.(prepareWorkspaceChange);
    return () => registerBeforeWorkspaceChange?.(null);
  }, [prepareWorkspaceChange, registerBeforeWorkspaceChange]);

  // 生命周期 flush：Electron close / 卸载 / beforeunload / 隐藏。
  useEffect(() => {
    function flushWithoutWaiting() {
      setUndoState(null);
      void flushLatestDraft();
    }
    function flushOnVisibility() {
      if (document.visibilityState === 'hidden') {
        flushWithoutWaiting();
      }
    }
    const removeCloseFlush = rendererBridge.onNovelFlushBeforeClose(async () => {
      setUndoState(null);
      return flushLatestDraft();
    });
    window.addEventListener('beforeunload', flushWithoutWaiting);
    document.addEventListener('visibilitychange', flushOnVisibility);
    return () => {
      setUndoState(null);
      flushWithoutWaiting();
      removeCloseFlush?.();
      window.removeEventListener('beforeunload', flushWithoutWaiting);
      document.removeEventListener('visibilitychange', flushOnVisibility);
    };
  }, [flushLatestDraft]);

  const updateDraft = useCallback((update: (script: Script) => Script): Script | null => {
    const current = latestDraftRef.current;
    if (!current) return null;
    const next = update(current);
    revisionRef.current += 1;
    latestDraftRef.current = next;
    setDraft(next);
    setSaveStatus('dirty');
    latestSaveStatusRef.current = 'dirty';
    return next;
  }, []);

  // ===== 剧本 CRUD =====

  const handleSelectScript = useCallback(async (scriptId: string) => {
    if (scriptId === activeScriptId) return;
    if (!await prepareWorkspaceChange()) {
      setEditorError('当前剧本保存失败，已取消切换。');
      return;
    }
    setActiveScriptId(scriptId);
  }, [activeScriptId, prepareWorkspaceChange]);

  const handleCreateScript = useCallback(async () => {
    if (!await prepareWorkspaceChange()) {
      setEditorError('当前剧本保存失败，已取消新建。');
      return;
    }
    const result = await scriptService.createScript({ projectId });
    if (result.ok && result.script) {
      await refreshSummaries();
      setActiveScriptId(result.script.id);
    } else {
      setListError(result.message ?? '新建剧本失败。');
    }
  }, [prepareWorkspaceChange, projectId, refreshSummaries]);

  const handleRenameScript = useCallback((scriptId: string, title: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    if (draft && draft.id === scriptId) {
      updateDraft((script) => ({ ...script, title: trimmed }));
      return;
    }
    // 非当前 draft：加载→改名→保存，不影响当前编辑。
    void (async () => {
      const loaded = await scriptService.loadScript(projectId, scriptId);
      if (loaded.ok && loaded.script) {
        await scriptService.saveScript({ ...loaded.script, title: trimmed });
        void refreshSummaries();
      }
    })();
  }, [draft, projectId, refreshSummaries, updateDraft]);

  const performDeleteScript = useCallback(async (summary: ScriptSummary) => {
    if (activeScriptId === summary.id && !await flushLatestDraft()) {
      setEditorError('当前剧本保存失败，已取消删除。');
      return;
    }
    const loaded = await scriptService.loadScript(projectId, summary.id);
    if (!loaded.ok || !loaded.script) {
      setListError(loaded.message ?? '删除前加载剧本失败。');
      return;
    }
    const snapshot = cloneScriptSnapshot(loaded.script);
    const deleted = await scriptService.deleteScript(projectId, summary.id);
    if (!deleted.ok) {
      setListError(deleted.message ?? '删除剧本失败。');
      return;
    }
    if (activeScriptId === summary.id) {
      setActiveScriptId(null);
      setDraft(null);
    }
    setUndoState({
      kind: 'script',
      message: `已删除《${snapshot.title}》`,
      snapshot,
    });
    await refreshSummaries();
  }, [activeScriptId, flushLatestDraft, projectId, refreshSummaries]);

  const requestDeleteScript = useCallback((summary: ScriptSummary) => {
    setConfirmState({
      title: '删除剧本',
      message: `确定删除《${summary.title}》？删除后可即时撤销。`,
      confirmLabel: '删除',
      onConfirm: () => {
        setConfirmState(null);
        void performDeleteScript(summary);
      },
    });
  }, [performDeleteScript]);

  const handleUndoDelete = useCallback(async () => {
    if (!undoState) return;
    const currentUndo = undoState;
    if (currentUndo.kind === 'script') {
      if (!await flushLatestDraft()) {
        setEditorError('当前剧本保存失败，已取消撤销切换。');
        return;
      }
      const restored = await scriptService.saveScript(currentUndo.snapshot);
      if (restored.ok && restored.script) {
        setUndoState(null);
        await refreshSummaries();
        setActiveScriptId(restored.script.id);
      } else {
        setListError(restored.message ?? '撤销删除失败。');
      }
      return;
    }

    const current = latestDraftRef.current;
    if (!current || current.id !== currentUndo.scriptId) {
      setUndoState(null);
      return;
    }
    const next = currentUndo.kind === 'episode'
      ? restoreEpisode(current, currentUndo.episode, currentUndo.index)
      : restoreScene(
          current,
          currentUndo.episodeId,
          currentUndo.scene,
          currentUndo.index,
        );
    updateDraft(() => next);
    if (currentUndo.kind === 'episode') {
      setActiveEpisodeId(currentUndo.episode.id);
      setActiveSceneId(currentUndo.episode.scenes[0]?.id ?? null);
    } else {
      setActiveEpisodeId(currentUndo.episodeId);
      setActiveSceneId(currentUndo.scene.id);
    }
    setUndoState(null);
    if (!await saveDraft(next)) {
      setEditorError('撤销已恢复到草稿，但保存失败，请重试。');
    }
  }, [flushLatestDraft, refreshSummaries, saveDraft, undoState, updateDraft]);

  // ===== 集 / 场 CRUD =====

  const handleAddEpisode = useCallback(() => {
    updateDraft((script) => {
      const next = addEpisode(script);
      const created = next.episodes[next.episodes.length - 1];
      setActiveEpisodeId(created.id);
      setActiveSceneId(created.scenes[0]?.id ?? null);
      return next;
    });
  }, [updateDraft]);

  const handleRenameEpisode = useCallback((episodeId: string, title: string) => {
    updateDraft((script) => renameEpisode(script, episodeId, title));
  }, [updateDraft]);

  const handleMoveEpisode = useCallback((episodeId: string, direction: -1 | 1) => {
    updateDraft((script) => moveEpisode(script, episodeId, direction));
  }, [updateDraft]);

  const requestRemoveEpisode = useCallback((episodeId: string) => {
    const current = latestDraftRef.current;
    if (!current) return;
    const episodeIndex = current.episodes.findIndex((episode) => episode.id === episodeId);
    const episode = current.episodes[episodeIndex];
    if (!episode) return;
    setConfirmState({
      title: '删除集',
      message: `确定删除《${episode.title.trim() || `第 ${episodeIndex + 1} 集`}》及其全部场次？删除后可即时撤销。`,
      confirmLabel: '删除',
      onConfirm: () => {
        setConfirmState(null);
        const source = latestDraftRef.current;
        if (!source) return;
        const deletedEpisode = structuredClone(episode);
        try {
          const next = removeEpisode(source, episodeId);
          updateDraft(() => next);
          if (activeEpisodeId === episodeId) {
            const fallback = next.episodes[0];
            setActiveEpisodeId(fallback?.id ?? null);
            setActiveSceneId(fallback?.scenes[0]?.id ?? null);
          }
          setUndoState({
            kind: 'episode',
            message: `已删除《${episode.title.trim() || `第 ${episodeIndex + 1} 集`}》`,
            scriptId: source.id,
            episode: deletedEpisode,
            index: episodeIndex,
          });
        } catch (error) {
          setEditorError(error instanceof Error ? error.message : '无法删除该集。');
        }
      },
    });
  }, [activeEpisodeId, updateDraft]);

  const handleAddScene = useCallback((episodeId: string) => {
    updateDraft((script) => {
      const { script: next, sceneId } = addScene(script, episodeId);
      if (sceneId) {
        setActiveEpisodeId(episodeId);
        setActiveSceneId(sceneId);
      }
      return next;
    });
  }, [updateDraft]);

  const handleMoveScene = useCallback((episodeId: string, sceneId: string, direction: -1 | 1) => {
    updateDraft((script) => moveScene(script, episodeId, sceneId, direction));
  }, [updateDraft]);

  const requestRemoveScene = useCallback((episodeId: string, sceneId: string) => {
    const current = latestDraftRef.current;
    const episode = current?.episodes.find((item) => item.id === episodeId);
    const sceneIndex = episode?.scenes.findIndex((scene) => scene.id === sceneId) ?? -1;
    const scene = sceneIndex >= 0 ? episode?.scenes[sceneIndex] : null;
    if (!current || !episode || !scene) return;
    setConfirmState({
      title: '删除场次',
      message: `确定删除《${scene.title.trim() || `场景 ${sceneIndex + 1}`}》？删除后可即时撤销。`,
      confirmLabel: '删除',
      onConfirm: () => {
        setConfirmState(null);
        const source = latestDraftRef.current;
        if (!source) return;
        const deletedScene = structuredClone(scene);
        try {
          const next = removeScene(source, episodeId, sceneId);
          updateDraft(() => next);
          if (activeSceneId === sceneId) {
            const nextEpisode = next.episodes.find((item) => item.id === episodeId);
            setActiveSceneId(nextEpisode?.scenes[0]?.id ?? null);
          }
          setUndoState({
            kind: 'scene',
            message: `已删除《${scene.title.trim() || `场景 ${sceneIndex + 1}`}》`,
            scriptId: source.id,
            episodeId,
            scene: deletedScene,
            index: sceneIndex,
          });
        } catch (error) {
          setEditorError(error instanceof Error ? error.message : '无法删除该场次。');
        }
      },
    });
  }, [activeSceneId, updateDraft]);

  const handleSceneTitleChange = useCallback((title: string) => {
    if (!activeEpisodeId || !activeSceneId) return;
    updateDraft((script) => updateScene(script, activeEpisodeId, activeSceneId, { title }));
  }, [activeEpisodeId, activeSceneId, updateDraft]);

  const handleSceneContentChange = useCallback((content: string) => {
    if (!activeEpisodeId || !activeSceneId) return;
    updateDraft((script) => updateScene(script, activeEpisodeId, activeSceneId, { content }));
  }, [activeEpisodeId, activeSceneId, updateDraft]);

  const handleToggleReference = useCallback((settingId: string, checked: boolean) => {
    if (!activeEpisodeId || !activeSceneId) return;
    updateDraft((script) => {
      const episode = script.episodes.find((item) => item.id === activeEpisodeId);
      const scene = episode?.scenes.find((item) => item.id === activeSceneId);
      if (!scene) return script;
      const nextRefs = checked
        ? Array.from(new Set([...scene.referenceIds, settingId]))
        : scene.referenceIds.filter((id) => id !== settingId);
      return updateScene(script, activeEpisodeId, activeSceneId, { referenceIds: nextRefs });
    });
  }, [activeEpisodeId, activeSceneId, updateDraft]);

  // ===== 共享设定 CRUD =====

  const persistSettings = useCallback(async (next: ProjectSettings) => {
    if (next.projectId !== projectIdRef.current) return;
    setSettings(next);
    const result = await projectSettingsService.save(next);
    if (!result.ok) {
      setEditorError(result.message ?? '保存共享设定失败。');
    }
  }, []);

  const handleUpsertSetting = useCallback((entry: ProjectSettingEntry) => {
    const base: ProjectSettings = settings?.projectId === projectId
      ? settings
      : { projectId, entries: [], schemaVersion: 1 };
    const exists = base.entries.some((item) => item.id === entry.id);
    const entries = exists
      ? base.entries.map((item) => (item.id === entry.id ? entry : item))
      : [...base.entries, entry];
    void persistSettings({ ...base, entries });
  }, [settings, projectId, persistSettings]);

  const handleDeleteSetting = useCallback((settingId: string): void => {
    setConfirmState({
      title: '删除设定',
      message: '确定删除该设定？若仍被场次引用将无法删除。',
      confirmLabel: '删除',
      onConfirm: () => {
        setConfirmState(null);
        void (async () => {
          if (!await flushLatestDraft()) {
            setEditorError('当前剧本保存失败，已取消删除设定。');
            return;
          }
          const result = await projectSettingsService.delete(projectId, settingId);
          if (result.ok) {
            await refreshSettings();
          } else {
            const positions = formatReferences(result.references);
            setEditorError(result.message ? `${result.message}${positions}` : `无法删除：仍被场次引用。${positions}`);
          }
        })();
      },
    });
  }, [flushLatestDraft, projectId, refreshSettings]);

  const activeEpisode = draft?.episodes.find((item) => item.id === activeEpisodeId) ?? null;
  const activeScene = activeEpisode?.scenes.find((item) => item.id === activeSceneId) ?? null;

  return (
    <main className="script-workbench" aria-label="剧本工作台">
      <ScriptLibraryPanel
        summaries={summaries}
        activeScriptId={activeScriptId}
        error={listError}
        onSelect={(scriptId) => { void handleSelectScript(scriptId); }}
        onCreate={() => { void handleCreateScript(); }}
        onRename={handleRenameScript}
        onDelete={requestDeleteScript}
      />

      <div className="script-structure" aria-label="集与场次">
        {draft ? (
          <>
            <EpisodeList
              episodes={draft.episodes}
              activeEpisodeId={activeEpisodeId}
              onSelectEpisode={(episodeId) => {
                setActiveEpisodeId(episodeId);
                const episode = draft.episodes.find((item) => item.id === episodeId);
                setActiveSceneId(episode?.scenes[0]?.id ?? null);
              }}
              onAddEpisode={handleAddEpisode}
              onRenameEpisode={handleRenameEpisode}
              onMoveEpisode={handleMoveEpisode}
              onRemoveEpisode={requestRemoveEpisode}
            />
            {activeEpisode && (
              <SceneList
                episode={activeEpisode}
                activeSceneId={activeSceneId}
                onSelectScene={setActiveSceneId}
                onAddScene={() => handleAddScene(activeEpisode.id)}
                onMoveScene={(sceneId, direction) => handleMoveScene(activeEpisode.id, sceneId, direction)}
                onRemoveScene={(sceneId) => requestRemoveScene(activeEpisode.id, sceneId)}
              />
            )}
          </>
        ) : (
          <p className="script-empty" role="status">
            {editorLoading ? '正在加载剧本…' : '选择或新建一个剧本开始创作。'}
          </p>
        )}
      </div>

      <ScriptEditor
        scene={activeScene}
        saveStatus={saveStatus}
        error={editorError}
        onDismissError={() => setEditorError(null)}
        onTitleChange={handleSceneTitleChange}
        onContentChange={handleSceneContentChange}
        onRetry={() => { void saveDraft(); }}
      />

      <div className="script-side" aria-label="设定与引用">
        <SharedSettingsPanel
          projectId={projectId}
          settings={settings}
          onUpsert={handleUpsertSetting}
          onDelete={handleDeleteSetting}
        />
        <ReferencePanel
          settings={settings}
          scene={activeScene}
          onToggleReference={handleToggleReference}
        />
      </div>

      {undoState && (
        <UndoToast
          message={undoState.message}
          onUndo={() => { void handleUndoDelete(); }}
          onDismiss={() => setUndoState(null)}
        />
      )}

      {confirmState && (
        <ConfirmDialog state={confirmState} onCancel={() => setConfirmState(null)} />
      )}
    </main>
  );
}

function formatReferences(references?: SettingReference[]): string {
  if (!references || references.length === 0) return '';
  const positions = references
    .map((ref) => `${ref.scriptTitle || '未命名剧本'} / ${ref.episodeTitle || '未命名集'} / ${ref.sceneTitle || '未命名场次'}`)
    .join('；');
  return `引用位置：${positions}`;
}
