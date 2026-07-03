import { useEffect, useRef, useState } from 'react';
import { rendererBridge } from '../../services/rendererBridge';
import type { Chapter, Novel } from '../../types/novel';
import { buildChapterFromOutlinePrompt, buildMissingOutlinePrompt, parseOutlineText } from './novelPrompts';
import { countWords, createId, saveStatusLabel, type SaveStatus } from './novelShared';
import './ChapterWorkbench.css';

export type ReadyTextModel = { channelId: string; channelLabel?: string; baseUrl: string; apiKey: string; model: string };

type ChapterStatus = 'done' | 'generating' | 'pending';
type DraftState = { chapterId: string; text: string; contentSnapshot: string };
type OutlinePreviewEntry = { chapterId: string; label: string; title: string; outline: string };

interface ChapterWorkbenchProps {
  novel: Novel;
  chapters: Chapter[];
  activeChapterId: string | null;
  saveStatus: SaveStatus;
  onSelectChapter: (chapterId: string) => void;
  onUpdateChapter: (chapterId: string, patch: Partial<Pick<Chapter, 'title' | 'content' | 'outline'>>) => void;
  onRetrySave: () => void;
  onBackToProjects: () => void;
  onOpenProjectView: () => void;
  ensureTextModel: (onIssue: (message: string) => void) => ReadyTextModel | null;
}

export function ChapterWorkbench({ novel, chapters, activeChapterId, saveStatus, onSelectChapter, onUpdateChapter, onRetrySave, onBackToProjects, onOpenProjectView, ensureTextModel }: ChapterWorkbenchProps) {
  const [generatingChapterId, setGeneratingChapterId] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState<{ chapterId: string; message: string } | null>(null);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [outlineBusy, setOutlineBusy] = useState(false);
  const [outlineError, setOutlineError] = useState('');
  const [outlinePreview, setOutlinePreview] = useState<OutlinePreviewEntry[] | null>(null);
  const requestIdRef = useRef<string | null>(null);
  const runRef = useRef(0);

  useEffect(() => () => {
    const requestId = requestIdRef.current;
    runRef.current += 1;
    requestIdRef.current = null;
    if (requestId) void rendererBridge.cancelTextGeneration(requestId);
  }, []);

  const activeIndex = chapters.findIndex((chapter) => chapter.id === activeChapterId);
  const activeChapter = activeIndex >= 0 ? chapters[activeIndex] : null;
  const doneCount = chapters.filter((chapter) => chapter.content.trim() !== '').length;
  const pendingCount = chapters.length - doneCount;
  const progress = chapters.length ? Math.round((doneCount / chapters.length) * 100) : 0;
  const firstPendingIndex = chapters.findIndex((chapter) => chapter.content.trim() === '');
  const missingOutlineCount = chapters.filter((chapter) => !chapter.outline?.trim()).length;
  const busy = generatingChapterId !== null || outlineBusy;
  const summaryBrief = brief(novel.summary, 42);
  const blueprintBrief = brief(novel.blueprint?.trim() || novel.summary.trim() || novel.idea?.trim() || '', 130);

  function chapterStatus(chapter: Chapter): ChapterStatus {
    if (chapter.id === generatingChapterId) return 'generating';
    return chapter.content.trim() ? 'done' : 'pending';
  }

  function locateFirstPending() {
    if (firstPendingIndex < 0) return;
    const chapter = chapters[firstPendingIndex];
    onSelectChapter(chapter.id);
    window.setTimeout(() => document.getElementById(`workbench-chapter-${chapter.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
  }

  async function generateChapterBody() {
    if (busy || firstPendingIndex < 0) return;
    const chapter = chapters[firstPendingIndex];
    if (!chapter.outline?.trim()) return;
    const previousChapter = firstPendingIndex > 0 ? chapters[firstPendingIndex - 1] : undefined;
    const ready = ensureTextModel((message) => setGenerationError({ chapterId: chapter.id, message }));
    if (!ready) return;
    const requestId = createId('text-request');
    const runId = runRef.current + 1;
    runRef.current = runId;
    requestIdRef.current = requestId;
    setGeneratingChapterId(chapter.id);
    setGenerationError(null);
    setDraft(null);
    const contentSnapshot = chapter.content;
    const result = await rendererBridge.generateText({
      requestId,
      channelId: ready.channelId,
      channelLabel: ready.channelLabel,
      baseUrl: ready.baseUrl,
      apiKey: ready.apiKey,
      model: ready.model,
      messages: buildChapterFromOutlinePrompt(novel, chapter, previousChapter),
      temperature: 0.8,
      maxTokens: 1500,
    });
    if (runRef.current !== runId) return;
    requestIdRef.current = null;
    setGeneratingChapterId(null);
    if (!result.ok || !result.text) {
      setGenerationError({ chapterId: chapter.id, message: result.message || '生成章节正文失败，请稍后重试。' });
      return;
    }
    setDraft({ chapterId: chapter.id, text: result.text, contentSnapshot });
  }

  function cancelGeneration() {
    const requestId = requestIdRef.current;
    runRef.current += 1;
    requestIdRef.current = null;
    setGeneratingChapterId(null);
    setOutlineBusy(false);
    if (requestId) void rendererBridge.cancelTextGeneration(requestId);
  }

  function confirmDraft() {
    if (!draft) return;
    const target = chapters.find((chapter) => chapter.id === draft.chapterId);
    if (!target) {
      setDraft(null);
      return;
    }
    if (target.content !== draft.contentSnapshot && !window.confirm('正文已被修改，写入将覆盖当前内容。仍要写入吗？')) return;
    onUpdateChapter(draft.chapterId, { content: draft.text });
    setDraft(null);
    setGenerationError(null);
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
    const status = chapterStatus(activeChapter);
    const isFirstPending = activeIndex === firstPendingIndex;
    const hasOutline = Boolean(activeChapter.outline?.trim());
    const chapterError = generationError && generationError.chapterId === activeChapter.id ? generationError.message : '';
    const chapterDraft = draft && draft.chapterId === activeChapter.id ? draft : null;
    return (
      <>
        <header className="novel-workbench__chapter-head">
          <div className="novel-workbench__chapter-title">
            <h2>第 {activeIndex + 1} 章 · {activeChapter.title || '未命名章节'}</h2>
            <span className={`novel-workbench__pill novel-workbench__pill--${status}`}>{statusLabel(status)}</span>
          </div>
          <p className={activeChapter.outline?.trim() ? 'novel-workbench__outline' : 'novel-workbench__outline novel-workbench__outline--empty'}>{activeChapter.outline?.trim() || '本章暂无大纲'}</p>
        </header>
        {status === 'generating' ? (
          <div className="novel-workbench__state">
            <span className="novel-workbench__spinner" aria-hidden="true" />
            <strong>正在生成章节正文…</strong>
            <span>生成完成后会先展示草稿，确认后才会写入正文。</span>
            <button className="novel-flow__ghost" onClick={cancelGeneration} type="button">取消生成</button>
          </div>
        ) : chapterDraft ? (
          <div className="novel-workbench__draft">
            <div className="novel-workbench__draft-head">
              <strong>正文草稿</strong>
              <span>{countWords(chapterDraft.text)} 字 · 确认后写入本章正文</span>
            </div>
            <p>{chapterDraft.text}</p>
            <footer>
              <button className="novel-flow__ghost" onClick={() => setDraft(null)} type="button">放弃</button>
              <button className="novel-flow__primary novel-flow__primary--compact" onClick={confirmDraft} type="button">确认写入</button>
            </footer>
          </div>
        ) : status === 'done' ? (
          <div className="novel-workbench__editor">
            <div className="novel-workbench__editor-meta">
              <span>{saveStatusLabel(saveStatus)}</span>
              <span>{countWords(activeChapter.content)} 字</span>
              {saveStatus === 'failed' && <button className="novel-flow__ghost" onClick={onRetrySave} type="button">重试保存</button>}
            </div>
            <textarea value={activeChapter.content} onChange={(event) => onUpdateChapter(activeChapter.id, { content: event.target.value })} placeholder="继续打磨本章正文…" />
          </div>
        ) : isFirstPending ? (
          <div className="novel-workbench__state">
            <strong>开始创作</strong>
            <span>{hasOutline ? '前面的章节都已完成，可以按顺序生成本章正文。' : '本章还没有大纲，请先通过左侧「生成后续大纲」补齐本章大纲。'}</span>
            {chapterError && <p className="novel-flow__error">{chapterError}</p>}
            <button className="novel-flow__primary" disabled={busy || !hasOutline} onClick={() => void generateChapterBody()} type="button">{chapterError ? '重试生成' : '按顺序生成'}</button>
          </div>
        ) : (
          <div className="novel-workbench__state">
            <strong>开始创作</strong>
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
          <button className="novel-flow__ghost" onClick={onBackToProjects} type="button">返回</button>
          <div className="novel-workbench__title">
            <h1>{novel.title}</h1>
            <span>{summaryBrief ? `${summaryBrief} · ` : ''}{progress}% 完成 · {doneCount}/{chapters.length} 章</span>
          </div>
        </div>
        <button className="novel-flow__ghost" onClick={onOpenProjectView} type="button">项目详情</button>
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
            {firstPendingIndex >= 0 && <button className="novel-flow__ghost" onClick={locateFirstPending} type="button">定位未完成</button>}
          </div>
          {chapters.length ? (
            <div className="novel-workbench__chapters">
              {chapters.map((chapter, index) => {
                const status = chapterStatus(chapter);
                return (
                  <button className={chapter.id === activeChapterId ? 'novel-workbench__chapter novel-workbench__chapter--active' : 'novel-workbench__chapter'} id={`workbench-chapter-${chapter.id}`} key={chapter.id} onClick={() => onSelectChapter(chapter.id)} type="button">
                    <span className="novel-workbench__chapter-row">
                      <strong>第 {index + 1} 章 · {chapter.title || '未命名章节'}</strong>
                      <span className={`novel-workbench__pill novel-workbench__pill--${status}`}>{statusLabel(status)}</span>
                    </span>
                    <span className="novel-workbench__chapter-outline">{brief(chapter.outline ?? '', 44) || '暂无大纲'}</span>
                  </button>
                );
              })}
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
        </aside>
        <section className="novel-workbench__main" aria-label="章节创作区">
          {renderMain()}
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
