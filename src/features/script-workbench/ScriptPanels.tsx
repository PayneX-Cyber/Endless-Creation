import { useEffect, useRef, useState } from 'react';
import type { Episode, ProjectSettings, ProjectSettingEntry, ScriptScene, ScriptSummary } from '../../types/script';

type SaveStatus = 'saved' | 'dirty' | 'saving' | 'failed';

export interface ConfirmState {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
}

function saveStatusLabel(status: SaveStatus): string {
  if (status === 'dirty') return '未保存';
  if (status === 'saving') return '保存中';
  if (status === 'failed') return '保存失败';
  return '已保存';
}

function sceneLabel(scene: { title: string }, index: number): string {
  return scene.title.trim() || `场景 ${index + 1}`;
}

// ===== 剧本库面板 =====

export interface ScriptLibraryPanelProps {
  summaries: ScriptSummary[];
  activeScriptId: string | null;
  error: string | null;
  onSelect: (scriptId: string) => void;
  onCreate: () => void;
  onRename: (scriptId: string, title: string) => void;
  onDelete: (summary: ScriptSummary) => void;
}

export function ScriptLibraryPanel({ summaries, activeScriptId, error, onSelect, onCreate, onRename, onDelete }: ScriptLibraryPanelProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  function commitRename(scriptId: string) {
    if (editingTitle.trim()) onRename(scriptId, editingTitle);
    setEditingId(null);
  }

  return (
    <aside className="script-library" aria-label="剧本列表">
      <div className="script-panel-head">
        <h2>剧本</h2>
        <button type="button" className="script-btn-primary" onClick={onCreate}>新建剧本</button>
      </div>
      {error && <p className="script-error" role="alert">{error}</p>}
      <ul className="script-list">
        {summaries.map((summary) => (
          <li key={summary.id} className={summary.id === activeScriptId ? 'is-active' : undefined}>
            {editingId === summary.id ? (
              <input
                className="script-input"
                autoFocus
                value={editingTitle}
                aria-label="剧本标题"
                onChange={(event) => setEditingTitle(event.target.value)}
                onBlur={() => commitRename(summary.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') commitRename(summary.id);
                  if (event.key === 'Escape') setEditingId(null);
                }}
              />
            ) : (
              <button type="button" className="script-list-item" onClick={() => onSelect(summary.id)}>
                <span className="script-list-title">{summary.title}</span>
                <span className="script-list-meta">{summary.episodeCount} 集 · {summary.sceneCount} 场</span>
              </button>
            )}
            <div className="script-list-actions">
              <button type="button" aria-label="重命名剧本" title="重命名" onClick={() => { setEditingId(summary.id); setEditingTitle(summary.title); }}>✎</button>
              <button type="button" aria-label="删除剧本" title="删除" onClick={() => onDelete(summary)}>🗑</button>
            </div>
          </li>
        ))}
        {summaries.length === 0 && <li className="script-empty" role="status">暂无剧本</li>}
      </ul>
    </aside>
  );
}

// ===== 集列表 =====

export interface EpisodeListProps {
  episodes: Episode[];
  activeEpisodeId: string | null;
  onSelectEpisode: (episodeId: string) => void;
  onAddEpisode: () => void;
  onRenameEpisode: (episodeId: string, title: string) => void;
  onMoveEpisode: (episodeId: string, direction: -1 | 1) => void;
  onRemoveEpisode: (episodeId: string) => void;
}

export function EpisodeList({ episodes, activeEpisodeId, onSelectEpisode, onAddEpisode, onRenameEpisode, onMoveEpisode, onRemoveEpisode }: EpisodeListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  function commit(episodeId: string) {
    if (editingTitle.trim()) onRenameEpisode(episodeId, editingTitle);
    setEditingId(null);
  }

  return (
    <section className="script-episodes" aria-label="集列表">
      <div className="script-panel-head">
        <h3>集</h3>
        <button type="button" className="script-btn-ghost" onClick={onAddEpisode}>新增集</button>
      </div>
      <ul className="script-list">
        {episodes.map((episode, index) => (
          <li key={episode.id} className={episode.id === activeEpisodeId ? 'is-active' : undefined}>
            {editingId === episode.id ? (
              <input
                className="script-input"
                autoFocus
                value={editingTitle}
                aria-label="集标题"
                onChange={(event) => setEditingTitle(event.target.value)}
                onBlur={() => commit(episode.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') commit(episode.id);
                  if (event.key === 'Escape') setEditingId(null);
                }}
              />
            ) : (
              <button type="button" className="script-list-item" onClick={() => onSelectEpisode(episode.id)}>
                {episode.title.trim() || `第 ${index + 1} 集`}
              </button>
            )}
            <div className="script-list-actions">
              <button type="button" aria-label="上移集" title="上移" disabled={index === 0} onClick={() => onMoveEpisode(episode.id, -1)}>↑</button>
              <button type="button" aria-label="下移集" title="下移" disabled={index === episodes.length - 1} onClick={() => onMoveEpisode(episode.id, 1)}>↓</button>
              <button type="button" aria-label="重命名集" title="重命名" onClick={() => { setEditingId(episode.id); setEditingTitle(episode.title); }}>✎</button>
              <button type="button" aria-label="删除集" title="删除" disabled={episodes.length <= 1} onClick={() => onRemoveEpisode(episode.id)}>🗑</button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ===== 场次列表 =====

export interface SceneListProps {
  episode: Episode;
  activeSceneId: string | null;
  onSelectScene: (sceneId: string) => void;
  onAddScene: () => void;
  onMoveScene: (sceneId: string, direction: -1 | 1) => void;
  onRemoveScene: (sceneId: string) => void;
}

export function SceneList({ episode, activeSceneId, onSelectScene, onAddScene, onMoveScene, onRemoveScene }: SceneListProps) {
  const scenes = [...episode.scenes].sort((a, b) => a.order - b.order);
  return (
    <section className="script-scenes" aria-label="场次列表">
      <div className="script-panel-head">
        <h3>场次</h3>
        <button type="button" className="script-btn-ghost" onClick={onAddScene}>新增场次</button>
      </div>
      <ul className="script-list">
        {scenes.map((scene, index) => (
          <li key={scene.id} className={scene.id === activeSceneId ? 'is-active' : undefined}>
            <button type="button" className="script-list-item" onClick={() => onSelectScene(scene.id)}>
              {sceneLabel(scene, index)}
            </button>
            <div className="script-list-actions">
              <button type="button" aria-label="上移场次" title="上移" disabled={index === 0} onClick={() => onMoveScene(scene.id, -1)}>↑</button>
              <button type="button" aria-label="下移场次" title="下移" disabled={index === scenes.length - 1} onClick={() => onMoveScene(scene.id, 1)}>↓</button>
              <button type="button" aria-label="删除场次" title="删除" disabled={scenes.length <= 1} onClick={() => onRemoveScene(scene.id)}>🗑</button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ===== 场次编辑器 =====

export interface ScriptEditorProps {
  scene: ScriptScene | null;
  saveStatus: SaveStatus;
  error: string | null;
  onDismissError: () => void;
  onTitleChange: (title: string) => void;
  onContentChange: (content: string) => void;
  onRetry: () => void;
}

export function ScriptEditor({ scene, saveStatus, error, onDismissError, onTitleChange, onContentChange, onRetry }: ScriptEditorProps) {
  if (!scene) {
    return (
      <section className="script-editor" aria-label="场次编辑器">
        <p className="script-empty" role="status">选择一个场次开始写作。</p>
      </section>
    );
  }
  return (
    <section className="script-editor" aria-label="场次编辑器">
      <div className="script-editor-head">
        <input
          className="script-scene-title"
          value={scene.title}
          placeholder="场次标题（可空）"
          aria-label="场次标题"
          onChange={(event) => onTitleChange(event.target.value)}
        />
        <span className={`script-save-status is-${saveStatus}`} role="status">
          {saveStatusLabel(saveStatus)}
          {saveStatus === 'failed' && (
            <button type="button" className="script-btn-ghost" onClick={onRetry}>重试</button>
          )}
        </span>
      </div>
      {error && (
        <p className="script-error" role="alert">
          {error}
          <button type="button" aria-label="关闭提示" onClick={onDismissError}>×</button>
        </p>
      )}
      <textarea
        className="script-content"
        value={scene.content}
        placeholder="在此写作场次正文…"
        aria-label="场次正文"
        onChange={(event) => onContentChange(event.target.value)}
      />
    </section>
  );
}

// ===== 共享设定面板 =====

export interface SharedSettingsPanelProps {
  projectId: string;
  settings: ProjectSettings | null;
  onUpsert: (entry: ProjectSettingEntry) => void;
  onDelete: (settingId: string) => void;
}

export function SharedSettingsPanel({ projectId, settings, onUpsert, onDelete }: SharedSettingsPanelProps) {
  const [type, setType] = useState<'character' | 'location'>('character');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const entries = settings?.entries ?? [];

  function resetForm() {
    setTitle('');
    setBody('');
    setEditingId(null);
  }

  function submit() {
    if (!title.trim()) return;
    const now = new Date().toISOString();
    const existing = editingId ? entries.find((item) => item.id === editingId) : null;
    onUpsert({
      id: editingId ?? crypto.randomUUID(),
      projectId,
      type,
      title: title.trim(),
      body,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
    resetForm();
  }

  return (
    <section className="script-settings" aria-label="共享设定">
      <div className="script-panel-head">
        <h3>共享设定</h3>
      </div>
      <div className="script-settings-form">
        <div className="script-settings-type" role="radiogroup" aria-label="设定类型">
          <label>
            <input type="radio" name="setting-type" checked={type === 'character'} onChange={() => setType('character')} /> 人物
          </label>
          <label>
            <input type="radio" name="setting-type" checked={type === 'location'} onChange={() => setType('location')} /> 地点
          </label>
        </div>
        <input className="script-input" value={title} placeholder="名称" aria-label="设定名称" onChange={(event) => setTitle(event.target.value)} />
        <textarea className="script-settings-body" value={body} placeholder="简介（可空）" aria-label="设定简介" onChange={(event) => setBody(event.target.value)} />
        <div className="script-settings-actions">
          <button type="button" className="script-btn-primary" onClick={submit}>{editingId ? '保存修改' : '新增设定'}</button>
          {editingId && <button type="button" className="script-btn-ghost" onClick={resetForm}>取消</button>}
        </div>
      </div>
      <ul className="script-list">
        {entries.map((entry) => (
          <li key={entry.id}>
            <span className="script-list-item" title={entry.body}>
              <span className="script-setting-tag">{entry.type === 'character' ? '人物' : '地点'}</span>
              {entry.title}
            </span>
            <div className="script-list-actions">
              <button type="button" aria-label="编辑设定" title="编辑" onClick={() => { setEditingId(entry.id); setType(entry.type); setTitle(entry.title); setBody(entry.body); }}>✎</button>
              <button type="button" aria-label="删除设定" title="删除" onClick={() => onDelete(entry.id)}>🗑</button>
            </div>
          </li>
        ))}
        {entries.length === 0 && <li className="script-empty" role="status">暂无设定</li>}
      </ul>
    </section>
  );
}

// ===== 引用面板 =====

export interface ReferencePanelProps {
  settings: ProjectSettings | null;
  scene: ScriptScene | null;
  onToggleReference: (settingId: string, checked: boolean) => void;
}

export function ReferencePanel({ settings, scene, onToggleReference }: ReferencePanelProps) {
  const [filter, setFilter] = useState<'all' | 'character' | 'location'>('all');
  const entries = (settings?.entries ?? []).filter((entry) => filter === 'all' || entry.type === filter);
  const linkedIds = new Set(scene?.referenceIds ?? []);

  return (
    <section className="script-references" aria-label="场次引用">
      <div className="script-panel-head">
        <h3>场次引用</h3>
      </div>
      {!scene ? (
        <p className="script-empty" role="status">选择场次后可关联设定。</p>
      ) : (
        <>
          <div className="script-ref-filter" role="radiogroup" aria-label="按类型筛选">
            <button type="button" className={filter === 'all' ? 'is-active' : undefined} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>全部</button>
            <button type="button" className={filter === 'character' ? 'is-active' : undefined} aria-pressed={filter === 'character'} onClick={() => setFilter('character')}>人物</button>
            <button type="button" className={filter === 'location' ? 'is-active' : undefined} aria-pressed={filter === 'location'} onClick={() => setFilter('location')}>地点</button>
          </div>
          <ul className="script-ref-list">
            {entries.map((entry) => (
              <li key={entry.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={linkedIds.has(entry.id)}
                    onChange={(event) => onToggleReference(entry.id, event.target.checked)}
                  />
                  <span className="script-setting-tag">{entry.type === 'character' ? '人物' : '地点'}</span>
                  {entry.title}
                </label>
              </li>
            ))}
            {entries.length === 0 && <li className="script-empty" role="status">暂无可关联设定</li>}
          </ul>
        </>
      )}
    </section>
  );
}

// ===== 撤销提示 =====

export interface UndoToastProps {
  message: string;
  onUndo: () => void;
  onDismiss: () => void;
}

export function UndoToast({ message, onUndo, onDismiss }: UndoToastProps) {
  useEffect(() => {
    const handle = window.setTimeout(onDismiss, 8000);
    return () => window.clearTimeout(handle);
  }, [onDismiss]);
  return (
    <div className="script-undo-toast" role="status">
      <span>{message}</span>
      <button type="button" className="script-btn-ghost" onClick={onUndo}>撤销</button>
    </div>
  );
}

// ===== 确认对话框 =====

export interface ConfirmDialogProps {
  state: ConfirmState;
  onCancel: () => void;
}

export function ConfirmDialog({ state, onCancel }: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  return (
    <div className="script-dialog-backdrop" onClick={onCancel}>
      <div
        className="script-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={state.title}
        onClick={(event) => event.stopPropagation()}
      >
        <h3>{state.title}</h3>
        <p>{state.message}</p>
        <div className="script-dialog-actions">
          <button type="button" className="script-btn-ghost" onClick={onCancel}>取消</button>
          <button type="button" className="script-btn-danger" ref={confirmRef} onClick={state.onConfirm}>{state.confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
