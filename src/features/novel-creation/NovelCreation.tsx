import { useEffect, useMemo, useRef, useState } from 'react';
import { novelService } from '../../services/novelService';
import type { Chapter, Novel, NovelSummary } from '../../types/novel';
import './NovelCreation.css';

type SaveStatus = 'saved' | 'dirty' | 'saving' | 'failed';
type NovelForm = { title: string; summary: string; note: string };

const emptyForm: NovelForm = { title: '', summary: '', note: '' };

export function NovelCreation() {
  const [summaries, setSummaries] = useState<NovelSummary[]>([]);
  const [currentNovel, setCurrentNovel] = useState<Novel | null>(null);
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [feedback, setFeedback] = useState('');
  const [isLoading, setLoading] = useState(true);
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [form, setForm] = useState<NovelForm>(emptyForm);
  const chapterTitleRef = useRef<HTMLInputElement | null>(null);
  const revisionRef = useRef(0);

  const chapters = useMemo(() => [...(currentNovel?.chapters ?? [])].sort((a, b) => a.order - b.order), [currentNovel]);
  const activeChapter = chapters.find((chapter) => chapter.id === activeChapterId) ?? null;
  const currentChapterWords = countWords(activeChapter?.content ?? '');
  const totalWords = chapters.reduce((sum, chapter) => sum + countWords(chapter.content), 0);

  useEffect(() => {
    void loadSummaries();
  }, []);

  useEffect(() => {
    if (!currentNovel || saveStatus !== 'dirty') return;
    const handle = window.setTimeout(() => { void saveCurrentNovel(); }, 600);
    return () => window.clearTimeout(handle);
  }, [currentNovel, saveStatus]);

  async function loadSummaries() {
    setLoading(true);
    const result = await novelService.listNovels();
    setLoading(false);
    if (!result.ok) {
      setFeedback(result.message ?? '加载小说列表失败。');
      setSummaries([]);
      return;
    }
    setSummaries(result.novels);
  }

  async function openNovel(id: string) {
    if (currentNovel && saveStatus !== 'saved') await novelService.saveNovel(currentNovel);
    const result = await novelService.loadNovel(id);
    if (!result.ok || !result.novel) {
      setFeedback(result.message || '小说文件损坏。');
      setCurrentNovel(null);
      setActiveChapterId(null);
      return;
    }
    setCurrentNovel(result.novel);
    setActiveChapterId(result.novel.chapters[0]?.id ?? null);
    setSaveStatus('saved');
    setFeedback('');
  }

  function updateNovel(update: (novel: Novel) => Novel) {
    setCurrentNovel((current) => {
      if (!current) return current;
      revisionRef.current += 1;
      setSaveStatus('dirty');
      return update(current);
    });
  }

  async function saveCurrentNovel() {
    if (!currentNovel) return;
    const revision = revisionRef.current;
    setSaveStatus('saving');
    const result = await novelService.saveNovel(currentNovel);
    if (!result.ok) {
      setSaveStatus('failed');
      setFeedback(result.message);
      return;
    }
    if (revisionRef.current === revision) setSaveStatus('saved');
    else setSaveStatus('dirty');
    if (result.novel) setCurrentNovel((current) => current && current.id === result.novel?.id ? { ...current, updatedAt: result.novel.updatedAt } : current);
    void loadSummaries();
  }

  async function submitNovelForm() {
    if (!form.title.trim()) {
      setFeedback('请填写小说标题。');
      return;
    }
    if (modalMode === 'create') {
      const result = await novelService.createNovel(form);
      if (!result.ok || !result.novel) {
        setFeedback(result.message);
        return;
      }
      setModalMode(null);
      setForm(emptyForm);
      setCurrentNovel(result.novel);
      setActiveChapterId(null);
      setSaveStatus('saved');
      await loadSummaries();
      return;
    }
    updateNovel((novel) => ({ ...novel, ...form, updatedAt: new Date().toISOString() }));
    setModalMode(null);
  }

  async function deleteCurrentNovel() {
    if (!currentNovel || !window.confirm('确定删除这本小说吗？此操作不可撤销。')) return;
    const result = await novelService.deleteNovel(currentNovel.id);
    if (!result.ok) {
      setFeedback(result.message);
      return;
    }
    setCurrentNovel(null);
    setActiveChapterId(null);
    setSaveStatus('saved');
    await loadSummaries();
  }

  function addChapter() {
    const now = new Date().toISOString();
    const chapter: Chapter = { id: createId('chapter'), title: '未命名章节', content: '', order: chapters.length, createdAt: now, updatedAt: now };
    updateNovel((novel) => ({ ...novel, chapters: [...novel.chapters, chapter], updatedAt: now }));
    setActiveChapterId(chapter.id);
    window.setTimeout(() => chapterTitleRef.current?.focus(), 0);
  }

  function updateChapter(patch: Partial<Pick<Chapter, 'title' | 'content'>>) {
    if (!activeChapter) return;
    const now = new Date().toISOString();
    updateNovel((novel) => ({
      ...novel,
      updatedAt: now,
      chapters: novel.chapters.map((chapter) => chapter.id === activeChapter.id ? { ...chapter, ...patch, updatedAt: now } : chapter),
    }));
  }

  function deleteChapter(chapterId: string) {
    if (!window.confirm('确定删除这个章节吗？此操作不可撤销。')) return;
    updateNovel((novel) => {
      const nextChapters = novel.chapters.filter((chapter) => chapter.id !== chapterId).map((chapter, index) => ({ ...chapter, order: index }));
      return { ...novel, chapters: nextChapters, updatedAt: new Date().toISOString() };
    });
    if (activeChapterId === chapterId) setActiveChapterId(chapters.find((chapter) => chapter.id !== chapterId)?.id ?? null);
  }

  return (
    <main className="novel-creation" aria-label="小说创作">
      <section className="novel-creation__list">
        <header>
          <div><p>Novel Studio</p><h1>小说创作</h1></div>
          <button onClick={() => { setForm(emptyForm); setModalMode('create'); }} type="button">新建小说</button>
        </header>
        {isLoading ? <EmptyState title="正在加载小说…" /> : summaries.length ? (
          <div className="novel-list">
            {summaries.map((novel) => (
              <button className={currentNovel?.id === novel.id ? 'novel-list__item novel-list__item--active' : 'novel-list__item'} key={novel.id} onClick={() => void openNovel(novel.id)} type="button">
                <strong>{novel.title}</strong>
                <span>{novel.chapterCount} 章 · {novel.wordCount} 字</span>
                <small>{formatTime(novel.updatedAt)}</small>
              </button>
            ))}
          </div>
        ) : <EmptyState title="暂无小说" text="新建一本小说后，会显示在这里。" />}
      </section>

      <section className="novel-creation__chapters">
        {currentNovel ? (
          <>
            <header>
              <div><p>{currentNovel.summary || '暂无简介'}</p><h2>{currentNovel.title}</h2></div>
              <div><button onClick={() => { setForm({ title: currentNovel.title, summary: currentNovel.summary, note: currentNovel.note }); setModalMode('edit'); }} type="button">编辑信息</button><button onClick={() => void deleteCurrentNovel()} type="button">删除</button></div>
            </header>
            {currentNovel.note && <p className="novel-note">{currentNovel.note}</p>}
            <div className="chapter-head"><span>章节</span><button onClick={addChapter} type="button">新建章节</button></div>
            {chapters.length ? <div className="chapter-list">{chapters.map((chapter) => <button className={chapter.id === activeChapterId ? 'chapter-list__item chapter-list__item--active' : 'chapter-list__item'} key={chapter.id} onClick={() => setActiveChapterId(chapter.id)} type="button"><strong>{chapter.title || '未命名章节'}</strong><span>{countWords(chapter.content)} 字</span></button>)}</div> : <EmptyState title="暂无章节" text="点击新建章节开始写作。" />}
          </>
        ) : <EmptyState title={feedback || '未选择小说'} text="从左侧选择一本小说，或新建一本小说。" />}
      </section>

      <section className="novel-creation__editor">
        {currentNovel && activeChapter ? (
          <>
            <header>
              <input ref={chapterTitleRef} value={activeChapter.title} onChange={(event) => updateChapter({ title: event.target.value })} placeholder="未命名章节" />
              <div className="editor-stats"><span>{saveStatusLabel(saveStatus)}</span><span>当前章 {currentChapterWords} 字</span><span>全书 {totalWords} 字</span><span>{formatTime(activeChapter.updatedAt)}</span>{saveStatus === 'failed' && <button onClick={() => void saveCurrentNovel()} type="button">重试</button>}</div>
            </header>
            <textarea value={activeChapter.content} onChange={(event) => updateChapter({ content: event.target.value })} placeholder="开始写正文…" />
            <button className="chapter-delete" onClick={() => deleteChapter(activeChapter.id)} type="button">删除章节</button>
          </>
        ) : currentNovel ? <EmptyState title="无章节" text="在中间栏新建章节后开始写作。" /> : <EmptyState title="小说工作台" text="本地保存，选择小说后进入章节编辑。" />}
      </section>

      {modalMode && <div className="novel-modal" role="dialog" aria-modal="true" aria-label={modalMode === 'create' ? '新建小说' : '编辑小说信息'} onClick={() => setModalMode(null)}><div onClick={(event) => event.stopPropagation()}><h2>{modalMode === 'create' ? '新建小说' : '编辑小说信息'}</h2><label>标题<input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} /></label><label>简介<textarea value={form.summary} onChange={(event) => setForm((current) => ({ ...current, summary: event.target.value }))} /></label><label>备注<input value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} /></label><footer><button onClick={() => setModalMode(null)} type="button">取消</button><button onClick={() => void submitNovelForm()} type="button">保存</button></footer></div></div>}
    </main>
  );
}

function EmptyState({ title, text }: { title: string; text?: string }) {
  return <div className="novel-empty"><strong>{title}</strong>{text && <span>{text}</span>}</div>;
}

function countWords(text: string): number {
  return Array.from(text.replace(/\s+/g, '')).length;
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '未更新' : date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function saveStatusLabel(status: SaveStatus): string {
  if (status === 'dirty') return '未保存';
  if (status === 'saving') return '保存中';
  if (status === 'failed') return '保存失败';
  return '已保存';
}
