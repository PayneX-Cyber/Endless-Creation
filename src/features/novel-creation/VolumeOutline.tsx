import { useState, type DragEvent } from 'react';
import type { Chapter, Novel } from '../../types/novel';
import { CHAPTER_STATUS_LABEL, CHAPTER_STATUS_ORDER, PROGRESS_LABELS, resolveChapterStatus } from './novelProgress';
import type { ChapterStatus } from '../../types/novel';
import {
  countChaptersInVolume,
  createVolume,
  deleteVolume,
  groupChaptersByVolume,
  moveChapterInStructure,
  renameVolume,
  reorderVolumes,
} from './novelStructure';

interface VolumeOutlineProps {
  novel: Novel;
  onUpdateNovel: (update: (novel: Novel) => Novel) => void;
  onAddChapter: () => void;
  onDeleteChapter: (chapterId: string) => void;
  onUpdateChapter: (chapterId: string, patch: Partial<Pick<Chapter, 'title' | 'outline'>>) => void;
  onUpdateChapterAndSave: (chapterId: string, patch: Partial<Pick<Chapter, 'status' | 'wordTarget'>>) => void;
}

type DropTarget = { volumeId: string | null; index: number };

export function VolumeOutline({
  novel,
  onUpdateNovel,
  onAddChapter,
  onDeleteChapter,
  onUpdateChapter,
  onUpdateChapterAndSave,
}: VolumeOutlineProps) {
  const [newVolumeTitle, setNewVolumeTitle] = useState('');
  const [draggedChapterId, setDraggedChapterId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const groups = groupChaptersByVolume(novel);
  const chapterNumber = new Map(groups.flatMap((group) => group.chapters).map((chapter, index) => [chapter.id, index + 1]));

  function addVolume() {
    const title = newVolumeTitle.trim();
    if (!title) return;
    onUpdateNovel((current) => createVolume(current, title));
    setNewVolumeTitle('');
  }

  function updateVolumeTitle(volumeId: string, title: string) {
    const nextTitle = title.trim();
    const currentTitle = novel.volumes.find((volume) => volume.id === volumeId)?.title;
    if (!nextTitle || nextTitle === currentTitle) return;
    onUpdateNovel((current) => renameVolume(current, volumeId, nextTitle));
  }

  function removeVolume(volumeId: string, title: string) {
    const count = countChaptersInVolume(novel, volumeId);
    if (!window.confirm(`确定删除卷「${title}」吗？其中 ${count} 个章节将移至“未分卷”，章节正文不会删除。`)) return;
    onUpdateNovel((current) => deleteVolume(current, volumeId));
  }

  function moveChapter(chapterId: string, volumeId: string | null, index: number) {
    onUpdateNovel((current) => moveChapterInStructure(current, chapterId, { volumeId, toIndex: index }));
  }

  function finishDrop(target: DropTarget) {
    if (draggedChapterId) moveChapter(draggedChapterId, target.volumeId, target.index);
    setDraggedChapterId(null);
    setDropTarget(null);
  }

  function allowDrop(event: DragEvent, target: DropTarget) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDropTarget(target);
  }

  return (
    <div className="novel-volume-outline">
      <div className="novel-volume-outline__toolbar">
        <label>
          <span>新建卷</span>
          <input
            aria-label="新卷标题"
            onChange={(event) => setNewVolumeTitle(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') addVolume(); }}
            placeholder="输入卷名"
            value={newVolumeTitle}
          />
        </label>
        <button className="novel-flow__ghost" disabled={!newVolumeTitle.trim()} onClick={addVolume} type="button">添加卷</button>
        <button className="novel-flow__primary novel-flow__primary--compact" onClick={onAddChapter} type="button">新增章节</button>
      </div>

      {groups.map((group, groupIndex) => {
        const volumeId = group.volume?.id ?? null;
        const isUnassigned = group.volume === null;
        return (
          <section
            className={dropTarget?.volumeId === volumeId && group.chapters.length === 0 ? 'novel-volume novel-volume--drop-target' : 'novel-volume'}
            key={volumeId ?? 'unassigned'}
            onDragOver={(event) => { if (group.chapters.length === 0) allowDrop(event, { volumeId, index: 0 }); }}
            onDrop={(event) => { if (group.chapters.length === 0) { event.preventDefault(); finishDrop({ volumeId, index: 0 }); } }}
          >
            <header className="novel-volume__head">
              <div className="novel-volume__title">
                <span>{isUnassigned ? '未分卷' : `第 ${groupIndex + 1} 卷`}</span>
                {group.volume ? (
                  <input
                    aria-label={`重命名卷 ${group.volume.title}`}
                    defaultValue={group.volume.title}
                    key={`${group.volume.id}-${group.volume.title}`}
                    onBlur={(event) => {
                      if (!event.target.value.trim()) event.target.value = group.volume!.title;
                      else updateVolumeTitle(group.volume!.id, event.target.value);
                    }}
                    onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
                  />
                ) : <strong>暂未归入正式卷</strong>}
                <small>{group.chapters.length} 章</small>
              </div>
              {group.volume && (
                <div className="novel-volume__actions">
                  <button aria-label={`上移卷 ${group.volume.title}`} className="novel-flow__ghost" disabled={groupIndex === 0} onClick={() => onUpdateNovel((current) => reorderVolumes(current, group.volume!.id, 'up'))} type="button">上移</button>
                  <button aria-label={`下移卷 ${group.volume.title}`} className="novel-flow__ghost" disabled={groupIndex === novel.volumes.length - 1} onClick={() => onUpdateNovel((current) => reorderVolumes(current, group.volume!.id, 'down'))} type="button">下移</button>
                  <button aria-label={`删除卷 ${group.volume.title}`} className="novel-flow__ghost" onClick={() => removeVolume(group.volume!.id, group.volume!.title)} type="button">删除卷</button>
                </div>
              )}
            </header>

            {group.chapters.length ? (
              <div className="novel-volume__chapters">
                {group.chapters.map((chapter, index) => {
                  const number = chapterNumber.get(chapter.id) ?? index + 1;
                  const isDropTarget = dropTarget?.volumeId === volumeId && dropTarget.index === index && draggedChapterId !== chapter.id;
                  return (
                    <article
                      aria-label={`第 ${number} 章，可拖拽调整顺序`}
                      className={isDropTarget ? 'novel-outline-card novel-outline-card--drop-target' : 'novel-outline-card'}
                      draggable
                      key={chapter.id}
                      onDragEnd={() => { setDraggedChapterId(null); setDropTarget(null); }}
                      onDragOver={(event) => allowDrop(event, { volumeId, index })}
                      onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; setDraggedChapterId(chapter.id); }}
                      onDrop={(event) => { event.preventDefault(); finishDrop({ volumeId, index }); }}
                    >
                      <div className="novel-outline-card__head">
                        <span>第 {number} 章</span>
                        <div className="novel-outline-card__actions">
                          <button aria-label={`上移第 ${number} 章`} className="novel-flow__ghost" disabled={index === 0} onClick={() => moveChapter(chapter.id, volumeId, index - 1)} type="button">上移</button>
                          <button aria-label={`下移第 ${number} 章`} className="novel-flow__ghost" disabled={index === group.chapters.length - 1} onClick={() => moveChapter(chapter.id, volumeId, index + 1)} type="button">下移</button>
                          <select aria-label={`调整第 ${number} 章所属卷`} onChange={(event) => moveChapter(chapter.id, event.target.value || null, Number.MAX_SAFE_INTEGER)} value={volumeId ?? ''}>
                            {novel.volumes.map((volume) => <option key={volume.id} value={volume.id}>{volume.title}</option>)}
                            <option value="">未分卷</option>
                          </select>
                          <button aria-label={`删除第 ${number} 章`} className="novel-flow__ghost" onClick={() => onDeleteChapter(chapter.id)} type="button">删除</button>
                        </div>
                      </div>
                      <input aria-label={`第 ${number} 章标题`} onChange={(event) => onUpdateChapter(chapter.id, { title: event.target.value })} placeholder="未命名章节" value={chapter.title} />
                      <div className="novel-outline-card__progress">
                        <label><span>{PROGRESS_LABELS.statusCompletion.slice(0, 2)}</span><select value={resolveChapterStatus(chapter)} onChange={(event) => onUpdateChapterAndSave(chapter.id, { status: event.target.value as ChapterStatus })}>{CHAPTER_STATUS_ORDER.map((status) => <option key={status} value={status}>{CHAPTER_STATUS_LABEL[status]}</option>)}</select></label>
                        <label><span>{PROGRESS_LABELS.chapterTarget}</span><input min={0} onChange={(event) => { const raw = Number(event.target.value); onUpdateChapterAndSave(chapter.id, { wordTarget: Number.isFinite(raw) && raw > 0 ? Math.round(raw) : undefined }); }} placeholder={PROGRESS_LABELS.targetPlaceholder} step={100} type="number" value={chapter.wordTarget ?? ''} /></label>
                      </div>
                      <textarea aria-label={`第 ${number} 章大纲`} onChange={(event) => onUpdateChapter(chapter.id, { outline: event.target.value })} placeholder="本章故事结构规划…" value={chapter.outline ?? ''} />
                    </article>
                  );
                })}
                <div
                  aria-hidden="true"
                  className={dropTarget?.volumeId === volumeId && dropTarget.index === group.chapters.length ? 'novel-volume__drop-end novel-volume__drop-end--active' : 'novel-volume__drop-end'}
                  onDragOver={(event) => allowDrop(event, { volumeId, index: group.chapters.length })}
                  onDrop={(event) => { event.preventDefault(); finishDrop({ volumeId, index: group.chapters.length }); }}
                />
              </div>
            ) : <div className="novel-volume__empty">拖拽章节到这里，或通过章节的所属卷选择器进行移动。</div>}
          </section>
        );
      })}
    </div>
  );
}
