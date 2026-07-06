import { useState } from 'react';
import type { Chapter, Foreshadowing } from '../../types/novel';

// 受控伏笔面板：不调 AI bridge、不解析、不落库。手动 CRUD 只通过 props 回调改 Novel
// （写入走 ChapterWorkbench 的 updateNovel 链）；AI 建议区也只收 props 渲染，AI 调用/解析/
// 状态机全在 ChapterWorkbench，本面板绝不接触桥接调用、结构化解析、提示词构造。
// 不新增 IPC；悬空章节引用降级显示，不崩。

export interface ForeshadowingDraft {
  title: string;
  plantedChapterId: string;
  payoffChapterId: string;
  note: string;
}

export interface ForeshadowingAiCandidate {
  id: string;
  title: string;
  note: string;
}

export interface ForeshadowingPayoffAiCandidate {
  id: string;
  title: string;
  note: string;
}

interface ForeshadowingPanelProps {
  foreshadowings: Foreshadowing[];
  chapters: Chapter[];
  onAdd: (draft: ForeshadowingDraft) => void;
  onEdit: (id: string, draft: ForeshadowingDraft) => void;
  onToggleStatus: (id: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  aiCandidates: ForeshadowingAiCandidate[];
  aiPayoffCandidates: ForeshadowingPayoffAiCandidate[];
  aiBusy: boolean;
  aiError: string;
  aiRawText: string;
  aiGenerateDisabledReason: string;
  aiPayoffGenerateDisabledReason: string;
  onGenerateAiCandidates: () => void;
  onAcceptAiCandidate: (candidateId: string) => void;
  onDismissAiCandidate: (candidateId: string) => void;
  onGenerateAiPayoffCandidates: () => void;
  onAcceptAiPayoffCandidate: (candidateId: string) => void;
  onDismissAiPayoffCandidate: (candidateId: string) => void;
}

const emptyDraft: ForeshadowingDraft = { title: '', plantedChapterId: '', payoffChapterId: '', note: '' };

export function ForeshadowingPanel({
  foreshadowings,
  chapters,
  onAdd,
  onEdit,
  onToggleStatus,
  onDelete,
  onClose,
  aiCandidates,
  aiPayoffCandidates,
  aiBusy,
  aiError,
  aiRawText,
  aiGenerateDisabledReason,
  aiPayoffGenerateDisabledReason,
  onGenerateAiCandidates,
  onAcceptAiCandidate,
  onDismissAiCandidate,
  onGenerateAiPayoffCandidates,
  onAcceptAiPayoffCandidate,
  onDismissAiPayoffCandidate,
}: ForeshadowingPanelProps) {
  const [mode, setMode] = useState<'list' | 'create' | { editId: string }>('list');
  const [draft, setDraft] = useState<ForeshadowingDraft>(emptyDraft);
  const [formError, setFormError] = useState('');

  function chapterLabel(chapterId: string): string {
    if (!chapterId) return '未指定章节';
    const index = chapters.findIndex((chapter) => chapter.id === chapterId);
    if (index < 0) return '章节已删除';
    return `第 ${index + 1} 章 · ${chapters[index].title || '未命名章节'}`;
  }

  function openCreate() {
    setDraft(emptyDraft);
    setFormError('');
    setMode('create');
  }

  function openEdit(item: Foreshadowing) {
    setDraft({
      title: item.title,
      plantedChapterId: item.plantedChapterId,
      payoffChapterId: item.payoffChapterId ?? '',
      note: item.note ?? '',
    });
    setFormError('');
    setMode({ editId: item.id });
  }

  function backToList() {
    setDraft(emptyDraft);
    setFormError('');
    setMode('list');
  }

  function submitDraft() {
    if (!draft.title.trim()) {
      setFormError('请填写伏笔简述。');
      return;
    }
    const normalized: ForeshadowingDraft = {
      title: draft.title.trim(),
      plantedChapterId: draft.plantedChapterId,
      payoffChapterId: draft.payoffChapterId,
      note: draft.note.trim(),
    };
    if (mode === 'create') onAdd(normalized);
    else if (typeof mode === 'object') onEdit(mode.editId, normalized);
    backToList();
  }

  function handleDelete(item: Foreshadowing) {
    if (!window.confirm(`确定删除伏笔「${item.title}」吗？删除后不可恢复。`)) return;
    onDelete(item.id);
  }

  const isForm = mode === 'create' || typeof mode === 'object';
  const pendingCount = foreshadowings.filter((item) => item.status === 'planted').length;
  const paidOffCount = foreshadowings.length - pendingCount;

  return (
    <div className="novel-modal" role="dialog" aria-modal="true" aria-label="伏笔记录" onClick={onClose}>
      <div className="novel-workbench__preview novel-foreshadow" onClick={(event) => event.stopPropagation()}>
        <h2>伏笔记录</h2>
        <p className="novel-workbench__preview-sub">手动记录伏笔的埋设与回收，跨章追踪。删除章节不会清理引用，悬空引用显示为「章节已删除」，可编辑改挂。</p>

        {isForm ? (
          <div className="novel-foreshadow__form">
            <label>
              伏笔简述
              <input
                value={draft.title}
                placeholder="例如：主角腰间的旧玉佩"
                onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
              />
            </label>
            <label>
              埋设章节
              <select
                value={draft.plantedChapterId}
                onChange={(event) => setDraft((current) => ({ ...current, plantedChapterId: event.target.value }))}
              >
                <option value="">未指定章节</option>
                {draft.plantedChapterId && !chapters.some((chapter) => chapter.id === draft.plantedChapterId) && (
                  <option value={draft.plantedChapterId}>章节已删除（保留原引用）</option>
                )}
                {chapters.map((chapter, index) => (
                  <option key={chapter.id} value={chapter.id}>{`第 ${index + 1} 章 · ${chapter.title || '未命名章节'}`}</option>
                ))}
              </select>
            </label>
            <label>
              回收章节（可选）
              <select
                value={draft.payoffChapterId}
                onChange={(event) => setDraft((current) => ({ ...current, payoffChapterId: event.target.value }))}
              >
                <option value="">未指定章节</option>
                {draft.payoffChapterId && !chapters.some((chapter) => chapter.id === draft.payoffChapterId) && (
                  <option value={draft.payoffChapterId}>章节已删除（保留原引用）</option>
                )}
                {chapters.map((chapter, index) => (
                  <option key={chapter.id} value={chapter.id}>{`第 ${index + 1} 章 · ${chapter.title || '未命名章节'}`}</option>
                ))}
              </select>
            </label>
            <label>
              备注（可选）
              <textarea
                value={draft.note}
                placeholder="怎么回收、暗示了什么……"
                onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))}
              />
            </label>
            {formError && <p className="novel-flow__error">{formError}</p>}
            <footer>
              <button className="novel-flow__ghost" onClick={backToList} type="button">取消</button>
              <button className="novel-flow__primary novel-flow__primary--compact" disabled={!draft.title.trim()} onClick={submitDraft} type="button">保存伏笔</button>
            </footer>
          </div>
        ) : (
          <>
            <div className="novel-foreshadow__summary">
              <span>待回收 {pendingCount}</span>
              <span>已回收 {paidOffCount}</span>
            </div>
            {foreshadowings.length ? (
              <div className="novel-foreshadow__list">
                {foreshadowings.map((item) => (
                  <article className="novel-foreshadow__item" key={item.id}>
                    <div className="novel-foreshadow__item-head">
                      <strong>{item.title}</strong>
                      <span className={`novel-foreshadow__pill novel-foreshadow__pill--${item.status}`}>
                        {item.status === 'planted' ? '待回收' : '已回收'}
                      </span>
                    </div>
                    <div className="novel-foreshadow__item-meta">
                      <span>埋设：{chapterLabel(item.plantedChapterId)}</span>
                      {item.status === 'paidOff' && <span>回收：{chapterLabel(item.payoffChapterId ?? '')}</span>}
                    </div>
                    {item.note && <p className="novel-foreshadow__note">{item.note}</p>}
                    <div className="novel-foreshadow__item-actions">
                      <button className="novel-flow__ghost" onClick={() => openEdit(item)} type="button">编辑</button>
                      <button className="novel-flow__ghost" onClick={() => onToggleStatus(item.id)} type="button">
                        {item.status === 'planted' ? '标记已回收' : '取消回收'}
                      </button>
                      <button className="novel-flow__ghost" onClick={() => handleDelete(item)} type="button">删除</button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="novel-foreshadow__empty">
                <strong>还没有伏笔记录</strong>
                <span>点下面的「新增伏笔」，把埋设的线索记下来，方便后续回收。</span>
              </div>
            )}
            <section className="novel-foreshadow__ai">
              <div className="novel-foreshadow__ai-head">
                <strong>AI 建议</strong>
                <div className="novel-foreshadow__ai-actions">
                  <button
                    className="novel-flow__primary novel-flow__primary--compact"
                    disabled={aiBusy || Boolean(aiGenerateDisabledReason)}
                    onClick={onGenerateAiCandidates}
                    type="button"
                  >
                    {aiBusy ? 'AI 识别中…' : 'AI 找伏笔'}
                  </button>
                  <button
                    className="novel-flow__primary novel-flow__primary--compact"
                    disabled={aiBusy || Boolean(aiPayoffGenerateDisabledReason)}
                    onClick={onGenerateAiPayoffCandidates}
                    type="button"
                  >
                    {aiBusy ? 'AI 识别中…' : 'AI 找回收'}
                  </button>
                </div>
              </div>
              {aiGenerateDisabledReason && <p className="novel-foreshadow__ai-hint">{aiGenerateDisabledReason}</p>}
              {aiPayoffGenerateDisabledReason && aiPayoffGenerateDisabledReason !== aiGenerateDisabledReason && (
                <p className="novel-foreshadow__ai-hint">{aiPayoffGenerateDisabledReason}</p>
              )}
              {aiCandidates.length > 0 && (
                <div className="novel-foreshadow__ai-group">
                  <span className="novel-foreshadow__ai-label">新埋候选</span>
                  <div className="novel-foreshadow__ai-list">
                    {aiCandidates.map((candidate) => (
                      <article className="novel-foreshadow__ai-card" key={candidate.id}>
                        <strong>{candidate.title}</strong>
                        {candidate.note && <p className="novel-foreshadow__note">{candidate.note}</p>}
                        <div className="novel-foreshadow__item-actions">
                          <button className="novel-flow__primary novel-flow__primary--compact" onClick={() => onAcceptAiCandidate(candidate.id)} type="button">加入记录</button>
                          <button className="novel-flow__ghost" onClick={() => onDismissAiCandidate(candidate.id)} type="button">忽略</button>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              )}
              {aiPayoffCandidates.length > 0 && (
                <div className="novel-foreshadow__ai-group">
                  <span className="novel-foreshadow__ai-label">回收候选</span>
                  <div className="novel-foreshadow__ai-list">
                    {aiPayoffCandidates.map((candidate) => (
                      <article className="novel-foreshadow__ai-card" key={candidate.id}>
                        <strong>{candidate.title}</strong>
                        {candidate.note && <p className="novel-foreshadow__note">{candidate.note}</p>}
                        <div className="novel-foreshadow__item-actions">
                          <button className="novel-flow__primary novel-flow__primary--compact" onClick={() => onAcceptAiPayoffCandidate(candidate.id)} type="button">标记回收</button>
                          <button className="novel-flow__ghost" onClick={() => onDismissAiPayoffCandidate(candidate.id)} type="button">忽略</button>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              )}
              {aiError && <p className="novel-foreshadow__ai-error">{aiError}</p>}
              {aiRawText && (
                <div className="novel-foreshadow__ai-raw">
                  <span>AI 原始输出：</span>
                  <pre>{aiRawText}</pre>
                </div>
              )}
            </section>
            <footer>
              <button className="novel-flow__ghost" onClick={onClose} type="button">关闭</button>
              <button className="novel-flow__primary novel-flow__primary--compact" onClick={openCreate} type="button">新增伏笔</button>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
