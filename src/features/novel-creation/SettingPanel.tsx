import { useState } from 'react';
import type { SettingEntry, SettingType } from '../../types/novel';
import {
  SETTING_LABELS,
  SETTING_TYPE_LABEL,
  SETTING_TYPE_ORDER,
  emptySettingDraft,
  groupSettingsByType,
  type SettingDraft,
} from './novelSettings';

// 受控设定面板：不调 AI、不解析、不落库。手动 CRUD 只通过 props 回调改 Novel
// （写入走 NovelCreation 的 updateNovel 链）。首版仅角色/地点/组织/物品/术语/规则/其他
// 七类手动条目，无别名/标签/归档/搜索/AI 抽取/自动注入。
interface SettingPanelProps {
  settings: SettingEntry[];
  onAdd: (draft: SettingDraft) => void;
  onEdit: (id: string, draft: SettingDraft) => void;
  onDelete: (id: string) => void;
  pinnedIds?: string[];
  pinLimitReached?: boolean;
  onTogglePin?: (id: string) => void;
  allowedTypes?: readonly SettingType[];
  title?: string;
  description?: string;
  emptyTitle?: string;
  emptyHint?: string;
}

export function SettingPanel({
  settings,
  onAdd,
  onEdit,
  onDelete,
  pinnedIds = [],
  pinLimitReached = false,
  onTogglePin,
  allowedTypes = SETTING_TYPE_ORDER,
  title = SETTING_LABELS.panelTitle,
  description = SETTING_LABELS.panelSub,
  emptyTitle = SETTING_LABELS.emptyTitle,
  emptyHint = SETTING_LABELS.emptyHint,
}: SettingPanelProps) {
  const [mode, setMode] = useState<'list' | 'create' | { editId: string }>('list');
  const [draft, setDraft] = useState<SettingDraft>(emptySettingDraft);
  const [formError, setFormError] = useState('');
  const typeOptions = SETTING_TYPE_ORDER.filter((type) => allowedTypes.includes(type));
  const characterMode = typeOptions.length === 1 && typeOptions[0] === 'character';

  function openCreate() {
    setDraft({ ...emptySettingDraft, type: typeOptions[0] ?? 'other' });
    setFormError('');
    setMode('create');
  }

  function openEdit(item: SettingEntry) {
    setDraft({ type: item.type, title: item.title, body: item.body });
    setFormError('');
    setMode({ editId: item.id });
  }

  function backToList() {
    setDraft(emptySettingDraft);
    setFormError('');
    setMode('list');
  }

  function submitDraft() {
    if (!draft.title.trim()) {
      setFormError(SETTING_LABELS.titleRequired);
      return;
    }
    const normalized: SettingDraft = { type: draft.type, title: draft.title.trim(), body: draft.body.trim() };
    if (mode === 'create') onAdd(normalized);
    else if (typeof mode === 'object') onEdit(mode.editId, normalized);
    backToList();
  }

  function handleDelete(item: SettingEntry) {
    if (!window.confirm(SETTING_LABELS.deleteConfirm(item.title))) return;
    onDelete(item.id);
  }

  const isForm = mode === 'create' || typeof mode === 'object';
  const groups = groupSettingsByType(settings.filter((entry) => typeOptions.includes(entry.type)));

  return (
    <div className={characterMode ? 'novel-setting novel-setting--characters' : 'novel-setting'}>
      <div className="novel-project-panel__head">
        <div className="novel-project-panel__heading">
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        {!isForm && <button className="novel-flow__primary novel-flow__primary--compact" onClick={openCreate} type="button">{characterMode ? '新增角色' : SETTING_LABELS.add}</button>}
      </div>
      {pinLimitReached && <p className="novel-flow__error">已达钉选上限（8 条），取消一条后可继续钉选。</p>}
      {isForm ? (
        <div className="novel-setting__form">
          {typeOptions.length > 1 && (
            <label>
              {SETTING_LABELS.typeField}
              <select value={draft.type} onChange={(event) => setDraft((current) => ({ ...current, type: event.target.value as SettingDraft['type'] }))}>
                {typeOptions.map((type) => <option key={type} value={type}>{SETTING_TYPE_LABEL[type]}</option>)}
              </select>
            </label>
          )}
          <label>
            {SETTING_LABELS.titleField}
            <input value={draft.title} placeholder={SETTING_LABELS.titlePlaceholder} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} />
          </label>
          <label>
            {SETTING_LABELS.bodyField}
            <textarea value={draft.body} placeholder={SETTING_LABELS.bodyPlaceholder} onChange={(event) => setDraft((current) => ({ ...current, body: event.target.value }))} />
          </label>
          {formError && <p className="novel-flow__error">{formError}</p>}
          <footer>
            <button className="novel-flow__ghost" onClick={backToList} type="button">{SETTING_LABELS.cancel}</button>
            <button className="novel-flow__primary novel-flow__primary--compact" disabled={!draft.title.trim()} onClick={submitDraft} type="button">{SETTING_LABELS.save}</button>
          </footer>
        </div>
      ) : groups.length ? (
        <div className="novel-setting__groups">
          {groups.map((group) => (
            <section className="novel-setting__group" key={group.type}>
              <div className="novel-setting__group-head"><span>{group.label}</span><span className="novel-setting__group-count">{group.entries.length}</span></div>
              <div className="novel-setting__list">
                {group.entries.map((item) => (
                  <article className="novel-setting__item" key={item.id}>
                    {characterMode && <span className="novel-setting__avatar" aria-hidden="true">{Array.from(item.title.trim())[0] ?? '角'}</span>}
                    <div className="novel-setting__item-content">
                      <div className="novel-setting__item-head">
                        <strong>{item.title}</strong>
                        <div className="novel-setting__item-actions">
                          {onTogglePin && <button aria-pressed={pinnedIds.includes(item.id)} className="novel-flow__ghost" disabled={pinLimitReached && !pinnedIds.includes(item.id)} onClick={() => onTogglePin(item.id)} type="button">{pinnedIds.includes(item.id) ? '取消钉选' : '钉选'}</button>}
                          <button className="novel-flow__ghost" onClick={() => openEdit(item)} type="button">{SETTING_LABELS.edit}</button>
                          <button className="novel-flow__ghost" onClick={() => handleDelete(item)} type="button">{SETTING_LABELS.delete}</button>
                        </div>
                      </div>
                      {item.body && <p className="novel-setting__body">{item.body}</p>}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="novel-setting__empty">
          <strong>{emptyTitle}</strong>
          <span>{emptyHint}</span>
        </div>
      )}
    </div>
  );
}
