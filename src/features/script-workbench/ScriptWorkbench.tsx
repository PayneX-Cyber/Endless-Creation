import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProjectSettings, ProjectSettingEntry, Script, ScriptSummary, SettingReference } from '../../types/script';
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

export interface ScriptWorkbenchProps {
  projectId: string;
}

export function ScriptWorkbench({ projectId }: ScriptWorkbenchProps) {
  const [summaries, setSummaries] = useState<ScriptSummary[]>([]);
  const [draft, setDraft] = useState<Script | null>(null);
  const [activeScriptId, setActiveScriptId] = useState<string | null>(null);
  const [activeEpisodeId, setActiveEpisodeId] = useState<string | null>(null);
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [undoSnapshot, setUndoSnapshot] = useState<Script | null>(null);
  const [settings, setSettings] = useState<ProjectSettings | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [editorLoading, setEditorLoading] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  const latestDraftRef = useRef<Script | null>(null);
  const latestSaveStatusRef = useRef<SaveStatus>('saved');
  const revisionRef = useRef(0);
  const projectIdRef = useRef(projectId);

  useEffect(() => {
    latestDraftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    latestSaveStatusRef.current = saveStatus;
  }, [saveStatus]);

  const refreshSummaries = useCallback(async () => {
    const result = await scriptService.listScripts(projectId);
    if (result.ok) {
      setSummaries(result.summaries ?? []);
      setListError(null);
    } else {
      setListError(result.message ?? '加载剧本列表失败。');
    }
  }, [projectId]);

  const refreshSettings = useCallback(async () => {
    const result = await projectSettingsService.load(projectId);
    if (result.ok && result.settings) setSettings(result.settings);
  }, [projectId]);

  // 项目切换：先失效撤销与选择，再加载新项目摘要与设定。
  useEffect(() => {
    projectIdRef.current = projectId;
    setUndoSnapshot(null);
    setDraft(null);
    setActiveScriptId(null);
    setActiveEpisodeId(null);
    setActiveSceneId(null);
    setSaveStatus('saved');
    latestSaveStatusRef.current = 'saved';
    latestDraftRef.current = null;
    void refreshSummaries();
    void refreshSettings();
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
      if (cancelled) return;
      if (result.ok && result.script) {
        setDraft(result.script);
        setSaveStatus('saved');
        latestSaveStatusRef.current = 'saved';
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

  const saveDraft = useCallback(async (target?: Script): Promise<void> => {
    const script = target ?? latestDraftRef.current;
    if (!script) return;
    const revisionAtStart = revisionRef.current;
    setSaveStatus('saving');
    latestSaveStatusRef.current = 'saving';
    try {
      const result = await scriptService.saveScript(script);
      if (!result.ok) throw new Error(result.message);
      if (revisionRef.current === revisionAtStart) {
        setSaveStatus('saved');
        latestSaveStatusRef.current = 'saved';
      }
      void refreshSummaries();
    } catch {
      setSaveStatus('failed');
      latestSaveStatusRef.current = 'failed';
    }
  }, [refreshSummaries]);

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

  // 生命周期 flush：卸载 / beforeunload / 隐藏。撤销快照随生命周期失效。
  useEffect(() => {
    function flushLatest() {
      if (latestSaveStatusRef.current !== 'dirty' || !latestDraftRef.current) return;
      void scriptService.saveScript(latestDraftRef.current);
    }
    function flushOnVisibility() {
      if (document.visibilityState === 'hidden') {
        setUndoSnapshot(null);
        flushLatest();
      }
    }
    window.addEventListener('beforeunload', flushLatest);
    document.addEventListener('visibilitychange', flushOnVisibility);
    return () => {
      setUndoSnapshot(null);
      flushLatest();
      window.removeEventListener('beforeunload', flushLatest);
      document.removeEventListener('visibilitychange', flushOnVisibility);
    };
  }, []);

  const updateDraft = useCallback((update: (script: Script) => Script) => {
    setDraft((current) => {
      if (!current) return current;
      revisionRef.current += 1;
      setSaveStatus('dirty');
      latestSaveStatusRef.current = 'dirty';
      return update(current);
    });
  }, []);

  // ===== 剧本 CRUD =====

  const handleCreateScript = useCallback(async () => {
    const result = await scriptService.createScript({ projectId });
    if (result.ok && result.script) {
      await refreshSummaries();
      setActiveScriptId(result.script.id);
    } else {
      setListError(result.message ?? '新建剧本失败。');
    }
  }, [projectId, refreshSummaries]);

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
    setUndoSnapshot(snapshot);
    await refreshSummaries();
  }, [activeScriptId, projectId, refreshSummaries]);

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
    if (!undoSnapshot) return;
    const restored = await scriptService.saveScript(undoSnapshot);
    setUndoSnapshot(null);
    if (restored.ok && restored.script) {
      await refreshSummaries();
      setActiveScriptId(restored.script.id);
    }
  }, [undoSnapshot, refreshSummaries]);

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

  const handleRemoveEpisode = useCallback((episodeId: string) => {
    try {
      updateDraft((script) => {
        const next = removeEpisode(script, episodeId);
        if (activeEpisodeId === episodeId) {
          const fallback = next.episodes[0];
          setActiveEpisodeId(fallback?.id ?? null);
          setActiveSceneId(fallback?.scenes[0]?.id ?? null);
        }
        return next;
      });
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : '无法删除该集。');
    }
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

  const handleRemoveScene = useCallback((episodeId: string, sceneId: string) => {
    try {
      updateDraft((script) => {
        const next = removeScene(script, episodeId, sceneId);
        if (activeSceneId === sceneId) {
          const episode = next.episodes.find((item) => item.id === episodeId);
          setActiveSceneId(episode?.scenes[0]?.id ?? null);
        }
        return next;
      });
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : '无法删除该场次。');
    }
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
    setSettings(next);
    const result = await projectSettingsService.save(next);
    if (!result.ok) setEditorError(result.message ?? '保存共享设定失败。');
  }, []);

  const handleUpsertSetting = useCallback((entry: ProjectSettingEntry) => {
    const base: ProjectSettings = settings ?? { projectId, entries: [], schemaVersion: 1 };
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
  }, [projectId, refreshSettings]);

  const activeEpisode = draft?.episodes.find((item) => item.id === activeEpisodeId) ?? null;
  const activeScene = activeEpisode?.scenes.find((item) => item.id === activeSceneId) ?? null;

  return (
    <main className="script-workbench" aria-label="剧本工作台">
      <ScriptLibraryPanel
        summaries={summaries}
        activeScriptId={activeScriptId}
        error={listError}
        onSelect={setActiveScriptId}
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
              onRemoveEpisode={handleRemoveEpisode}
            />
            {activeEpisode && (
              <SceneList
                episode={activeEpisode}
                activeSceneId={activeSceneId}
                onSelectScene={setActiveSceneId}
                onAddScene={() => handleAddScene(activeEpisode.id)}
                onMoveScene={(sceneId, direction) => handleMoveScene(activeEpisode.id, sceneId, direction)}
                onRemoveScene={(sceneId) => handleRemoveScene(activeEpisode.id, sceneId)}
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

      {undoSnapshot && (
        <UndoToast
          message={`已删除《${undoSnapshot.title}》`}
          onUndo={() => { void handleUndoDelete(); }}
          onDismiss={() => setUndoSnapshot(null)}
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
    .map((ref) => `${ref.scriptTitle} / ${ref.episodeTitle} / ${ref.sceneTitle || '未命名场次'}`)
    .join('；');
  return `引用位置：${positions}`;
}
