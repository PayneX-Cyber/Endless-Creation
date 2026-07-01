import { useEffect, useMemo, useRef, useState } from 'react';
import { rendererBridge } from '../../services/rendererBridge';
import { novelService } from '../../services/novelService';
import type { Chapter, Novel, NovelSummary } from '../../types/novel';
import { buildContinueChapterPrompt, buildPolishChapterPrompt, buildRewriteChapterPrompt } from './novelPrompts';
import './NovelCreation.css';

type SaveStatus = 'saved' | 'dirty' | 'saving' | 'failed';
type TextGenerationStatus = 'idle' | 'generating' | 'failed';
type AiDraftAction = 'continue' | 'polish' | 'rewrite';
type NovelForm = { title: string; summary: string; note: string };
interface ModelPreferences { textModel?: string; textModels?: string[]; }
interface ApiProviderChannel { id: string; name?: string; baseUrl?: string; apiKey?: string; apiFormat?: string; enabled?: boolean; models?: string[]; }
interface ApiProviderStore { channels?: ApiProviderChannel[]; activeChannelId?: string; }

const emptyForm: NovelForm = { title: '', summary: '', note: '' };
const MODEL_PREFERENCES_STORAGE_KEY = 'endless-creation.model-preferences';
const API_PROVIDER_STORAGE_KEY = 'endless-creation.api-provider-config';

export function NovelCreation() {
  const [summaries, setSummaries] = useState<NovelSummary[]>([]);
  const [currentNovel, setCurrentNovel] = useState<Novel | null>(null);
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [feedback, setFeedback] = useState('');
  const [isLoading, setLoading] = useState(true);
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [form, setForm] = useState<NovelForm>(emptyForm);
  const [modelPreferences, setModelPreferences] = useState<ModelPreferences>(() => readLocalStorage(MODEL_PREFERENCES_STORAGE_KEY, {}));
  const [apiProviderStore, setApiProviderStore] = useState<ApiProviderStore>(() => readLocalStorage(API_PROVIDER_STORAGE_KEY, {}));
  const [textGenerationStatus, setTextGenerationStatus] = useState<TextGenerationStatus>('idle');
  const [textGenerationError, setTextGenerationError] = useState('');
  const [aiDraft, setAiDraft] = useState('');
  const [aiDraftAction, setAiDraftAction] = useState<AiDraftAction>('continue');
  const chapterTitleRef = useRef<HTMLInputElement | null>(null);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const revisionRef = useRef(0);
  const latestNovelRef = useRef<Novel | null>(null);
  const latestSaveStatusRef = useRef<SaveStatus>('saved');
  const activeTextRequestIdRef = useRef<string | null>(null);
  const textGenerationRunRef = useRef(0);

  const chapters = useMemo(() => [...(currentNovel?.chapters ?? [])].sort((a, b) => a.order - b.order), [currentNovel]);
  const activeChapter = chapters.find((chapter) => chapter.id === activeChapterId) ?? null;
  const currentChapterWords = countWords(activeChapter?.content ?? '');
  const totalWords = chapters.reduce((sum, chapter) => sum + countWords(chapter.content), 0);
  const selectedTextModel = useMemo(() => resolveTextModel(modelPreferences, apiProviderStore), [apiProviderStore, modelPreferences]);

  useEffect(() => {
    void loadSummaries();
  }, []);

  useEffect(() => {
    function refreshModelStores() {
      setModelPreferences(readLocalStorage(MODEL_PREFERENCES_STORAGE_KEY, {}));
      setApiProviderStore(readLocalStorage(API_PROVIDER_STORAGE_KEY, {}));
    }

    function refreshOnVisibilityChange() {
      if (!document.hidden) refreshModelStores();
    }

    window.addEventListener('focus', refreshModelStores);
    document.addEventListener('visibilitychange', refreshOnVisibilityChange);
    window.addEventListener('endless-creation:model-preferences-updated', refreshModelStores);
    return () => {
      window.removeEventListener('focus', refreshModelStores);
      document.removeEventListener('visibilitychange', refreshOnVisibilityChange);
      window.removeEventListener('endless-creation:model-preferences-updated', refreshModelStores);
    };
  }, []);

  useEffect(() => {
    latestNovelRef.current = currentNovel;
  }, [currentNovel]);

  useEffect(() => {
    latestSaveStatusRef.current = saveStatus;
  }, [saveStatus]);

  useEffect(() => {
    if (!currentNovel || saveStatus !== 'dirty') return;
    const handle = window.setTimeout(() => { void saveCurrentNovel(); }, 600);
    return () => window.clearTimeout(handle);
  }, [currentNovel, saveStatus]);

  useEffect(() => {
    function flushLatestNovel() {
      const latestNovel = latestNovelRef.current;
      if (!latestNovel || latestSaveStatusRef.current === 'saved') return;
      void novelService.saveNovel(latestNovel);
    }

    function flushOnVisibilityChange() {
      if (document.visibilityState === 'hidden') flushLatestNovel();
    }

    window.addEventListener('beforeunload', flushLatestNovel);
    document.addEventListener('visibilitychange', flushOnVisibilityChange);
    return () => {
      flushLatestNovel();
      window.removeEventListener('beforeunload', flushLatestNovel);
      document.removeEventListener('visibilitychange', flushOnVisibilityChange);
    };
  }, []);

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

  async function generateChapterDraft(action: AiDraftAction) {
    if (!currentNovel || !activeChapter) return;
    if (!selectedTextModel) {
      setTextGenerationError('\u8bf7\u5148\u5728 API\u914d\u7f6e / \u6a21\u578b\u504f\u597d \u4e2d\u914d\u7f6e\u53ef\u7528\u6587\u672c\u6a21\u578b\u3002');
      return;
    }
    if (selectedTextModel.channel.enabled === false) {
      setTextGenerationError('\u5f53\u524d API \u6e20\u9053\u5df2\u7981\u7528\uff0c\u8bf7\u5728 API\u914d\u7f6e \u4e2d\u542f\u7528\u540e\u91cd\u8bd5\u3002');
      return;
    }
    if (!selectedTextModel.channel.baseUrl?.trim() || !selectedTextModel.channel.apiKey?.trim()) {
      setTextGenerationError('\u5f53\u524d API \u6e20\u9053\u7f3a\u5c11 Base URL \u6216 API Key\uff0c\u8bf7\u5148\u5b8c\u6210 API\u914d\u7f6e\u3002');
      return;
    }
    if (selectedTextModel.channel.apiFormat && selectedTextModel.channel.apiFormat !== 'openai') {
      setTextGenerationError('\u5f53\u524d\u4ec5\u652f\u6301 OpenAI-compatible \u6587\u672c\u6a21\u578b\u3002');
      return;
    }

    const editText = getSelectedChapterText() || activeChapter.content;
    if (action !== 'continue' && !editText.trim()) {
      setTextGenerationError('\u8bf7\u5148\u8f93\u5165\u6b63\u6587\u3002');
      return;
    }

    const requestId = createId('text-request');
    const runId = textGenerationRunRef.current + 1;
    textGenerationRunRef.current = runId;
    activeTextRequestIdRef.current = requestId;
    setTextGenerationStatus('generating');
    setTextGenerationError('');
    setAiDraft('');
    setAiDraftAction(action);

    const messages = action === 'polish'
      ? buildPolishChapterPrompt(currentNovel, activeChapter, editText)
      : action === 'rewrite'
        ? buildRewriteChapterPrompt(currentNovel, activeChapter, editText)
        : buildContinueChapterPrompt(currentNovel, activeChapter);

    const result = await rendererBridge.generateText({
      requestId,
      channelId: selectedTextModel.channel.id,
      channelLabel: selectedTextModel.channel.name,
      baseUrl: selectedTextModel.channel.baseUrl,
      apiKey: selectedTextModel.channel.apiKey,
      model: selectedTextModel.model,
      messages,
      temperature: action === 'rewrite' ? 0.85 : 0.75,
      maxTokens: action === 'continue' ? 700 : 1200,
    });

    if (textGenerationRunRef.current !== runId) return;
    activeTextRequestIdRef.current = null;
    if (!result.ok || !result.text) {
      setTextGenerationStatus('failed');
      setTextGenerationError(result.message || `${aiActionLabel(action)}\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002`);
      return;
    }
    setTextGenerationStatus('idle');
    setAiDraft(result.text);
  }

  function getSelectedChapterText() {
    const target = editorRef.current;
    if (!target || !activeChapter) return '';
    const start = target.selectionStart;
    const end = target.selectionEnd;
    return end > start ? activeChapter.content.slice(start, end) : '';
  }

  function cancelTextGeneration() {
    const requestId = activeTextRequestIdRef.current;
    textGenerationRunRef.current += 1;
    activeTextRequestIdRef.current = null;
    setTextGenerationStatus('idle');
    if (requestId) void rendererBridge.cancelTextGeneration(requestId);
  }

  async function copyAiDraft() {
    if (!aiDraft) return;
    await rendererBridge.copyText(aiDraft);
  }

  function insertAiDraft() {
    if (!activeChapter || !aiDraft) return;
    const target = editorRef.current;
    const content = activeChapter.content;
    const cursor = target && document.activeElement === target ? target.selectionStart : content.length;
    const prefix = content.slice(0, cursor);
    const suffix = content.slice(cursor);
    const spacer = prefix && !prefix.endsWith('\n') ? '\n\n' : '';
    const inserted = `${spacer}${aiDraft}`;
    updateChapter({ content: `${prefix}${inserted}${suffix}` });
    setAiDraft('');
    window.setTimeout(() => {
      target?.focus();
      const nextCursor = cursor + inserted.length;
      target?.setSelectionRange(nextCursor, nextCursor);
    }, 0);
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
              <div className="editor-stats"><span>{saveStatusLabel(saveStatus)}</span><span>{'\u5f53\u524d\u7ae0'} {currentChapterWords} {'\u5b57'}</span><span>{'\u5168\u4e66'} {totalWords} {'\u5b57'}</span><span>{formatTime(activeChapter.updatedAt)}</span><button disabled={textGenerationStatus === 'generating'} onClick={() => void generateChapterDraft('continue')} type="button">{textGenerationStatus === 'generating' ? '\u751f\u6210\u4e2d' : 'AI \u7eed\u5199'}</button><button disabled={textGenerationStatus === 'generating'} onClick={() => void generateChapterDraft('polish')} type="button">{'AI \u6da6\u8272'}</button><button disabled={textGenerationStatus === 'generating'} onClick={() => void generateChapterDraft('rewrite')} type="button">{'AI \u6539\u5199'}</button>{textGenerationStatus === 'generating' && <button onClick={cancelTextGeneration} type="button">{'\u53d6\u6d88'}</button>}{saveStatus === 'failed' && <button onClick={() => void saveCurrentNovel()} type="button">{'\u91cd\u8bd5'}</button>}</div>
            </header>
            <textarea ref={editorRef} value={activeChapter.content} onChange={(event) => updateChapter({ content: event.target.value })} placeholder="开始写正文…" />
            {(aiDraft || textGenerationError) && <div className="novel-ai-draft">{textGenerationError ? <p>{textGenerationError}</p> : <><strong>{aiDraftTitle(aiDraftAction)}</strong><p>{aiDraft}</p><div><button onClick={insertAiDraft} type="button">插入正文</button><button onClick={() => void copyAiDraft()} type="button">复制</button><button onClick={() => setAiDraft('')} type="button">放弃</button></div></>}</div>}
            <button className="chapter-delete" onClick={() => deleteChapter(activeChapter.id)} type="button">删除章节</button>
          </>
        ) : currentNovel ? <EmptyState title="无章节" text="在中间栏新建章节后开始写作。" /> : <EmptyState title="小说工作台" text="本地保存，选择小说后进入章节编辑。" />}
      </section>

      {modalMode && <div className="novel-modal" role="dialog" aria-modal="true" aria-label={modalMode === 'create' ? '新建小说' : '编辑小说信息'} onClick={() => setModalMode(null)}><div onClick={(event) => event.stopPropagation()}><h2>{modalMode === 'create' ? '新建小说' : '编辑小说信息'}</h2><label>标题<input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} /></label><label>简介<textarea value={form.summary} onChange={(event) => setForm((current) => ({ ...current, summary: event.target.value }))} /></label><label>备注<input value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} /></label><footer><button onClick={() => setModalMode(null)} type="button">取消</button><button onClick={() => void submitNovelForm()} type="button">保存</button></footer></div></div>}
    </main>
  );
}

function aiActionLabel(action: AiDraftAction): string {
  if (action === 'polish') return '\u6da6\u8272';
  if (action === 'rewrite') return '\u6539\u5199';
  return '\u7eed\u5199';
}

function aiDraftTitle(action: AiDraftAction): string {
  return `${aiActionLabel(action)}\u8349\u7a3f`;
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

function resolveTextModel(modelPreferences: ModelPreferences, apiProviderStore: ApiProviderStore): { channel: ApiProviderChannel; model: string } | null {
  const channels = apiProviderStore.channels ?? [];
  const preferred = modelPreferences.textModel || modelPreferences.textModels?.[0] || '';
  const decoded = decodeChannelModel(preferred);
  if (decoded) {
    const channel = channels.find((item) => item.id === decoded.channelId);
    return channel ? { channel, model: decoded.model } : null;
  }
  const channel = channels.find((item) => item.models?.includes(preferred)) ?? channels.find((item) => item.id === apiProviderStore.activeChannelId) ?? channels[0];
  const model = preferred || channel?.models?.[0] || '';
  return channel && model ? { channel, model } : null;
}

function decodeChannelModel(value: string) {
  const separatorIndex = value.indexOf('::');
  if (separatorIndex <= 0) return null;
  const channelId = value.slice(0, separatorIndex);
  const model = value.slice(separatorIndex + 2);
  return channelId && model ? { channelId, model } : null;
}

function readLocalStorage<T>(key: string, fallback: T): T {
  try {
    const rawValue = window.localStorage.getItem(key);
    return rawValue ? JSON.parse(rawValue) as T : fallback;
  } catch {
    return fallback;
  }
}
