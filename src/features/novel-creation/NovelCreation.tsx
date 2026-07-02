import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { rendererBridge } from '../../services/rendererBridge';
import { novelService } from '../../services/novelService';
import type { Chapter, Novel, NovelSummary } from '../../types/novel';
import { buildBlueprintFromConversationPrompt, buildBlueprintPrompt, buildChapterFromOutlinePrompt, buildContinueChapterPrompt, buildInspirationChatPrompt, buildOutlinePrompt, buildPolishChapterPrompt, buildRewriteChapterPrompt, INSPIRATION_OPENING_MESSAGE, parseOutlineText, type InspirationChatMessage, type TextMessage } from './novelPrompts';
import './NovelCreation.css';

type SaveStatus = 'saved' | 'dirty' | 'saving' | 'failed';
type TextGenerationStatus = 'idle' | 'generating' | 'failed';
type AiDraftAction = 'continue' | 'polish' | 'rewrite' | 'outline';
type AiDraftSource = { type: 'insert' } | { type: 'chapter'; chapterId: string } | { type: 'selection'; chapterId: string; start: number; end: number; text: string } | { type: 'outline'; chapterId: string; content: string; updatedAt: string };
type WizardStep = 'idea' | 'blueprint' | 'outline';
type NovelView = 'creationCenter' | 'inspirationIntro' | 'inspirationPreparing' | 'inspirationChat' | 'inspirationBlueprint' | 'inspirationOutline' | 'workbench';
type InspirationBusy = 'idle' | 'chat' | 'blueprint' | 'outline';
type ChatBubble = InspirationChatMessage & { id: string };
type NovelForm = { title: string; summary: string; note: string };
interface ModelPreferences { textModel?: string; textModels?: string[]; }
interface ApiProviderChannel { id: string; name?: string; baseUrl?: string; apiKey?: string; apiFormat?: string; enabled?: boolean; models?: string[]; }
interface ApiProviderStore { channels?: ApiProviderChannel[]; activeChannelId?: string; }

const emptyForm: NovelForm = { title: '', summary: '', note: '' };
const MODEL_PREFERENCES_STORAGE_KEY = 'endless-creation.model-preferences';
const API_PROVIDER_STORAGE_KEY = 'endless-creation.api-provider-config';
const INSPIRATION_STAGES = ['灵感收集', '故事核心', '角色冲突', '蓝图确认'];
const MAX_CHAT_TURNS = 8;

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
  const [aiDraftSource, setAiDraftSource] = useState<AiDraftSource>({ type: 'insert' });
  const [wizardStep, setWizardStep] = useState<WizardStep | null>(null);
  const [wizardIdea, setWizardIdea] = useState('');
  const [wizardBlueprint, setWizardBlueprint] = useState('');
  const [wizardOutline, setWizardOutline] = useState('');
  const [wizardStatus, setWizardStatus] = useState<TextGenerationStatus>('idle');
  const [wizardError, setWizardError] = useState('');
  const [wizardNotice, setWizardNotice] = useState('');
  const [view, setView] = useState<NovelView>('creationCenter');
  const [chatMessages, setChatMessages] = useState<ChatBubble[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [inspirationBusy, setInspirationBusy] = useState<InspirationBusy>('idle');
  const [inspirationError, setInspirationError] = useState('');
  const [inspirationBlueprintDraft, setInspirationBlueprintDraft] = useState('');
  const [inspirationIdeaDraft, setInspirationIdeaDraft] = useState('');
  const [inspirationOutlineDraft, setInspirationOutlineDraft] = useState('');
  const [blueprintConfirmed, setBlueprintConfirmed] = useState(false);
  const chapterTitleRef = useRef<HTMLInputElement | null>(null);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const revisionRef = useRef(0);
  const latestNovelRef = useRef<Novel | null>(null);
  const latestSaveStatusRef = useRef<SaveStatus>('saved');
  const activeTextRequestIdRef = useRef<string | null>(null);
  const textGenerationRunRef = useRef(0);
  const wizardRequestIdRef = useRef<string | null>(null);
  const wizardRunRef = useRef(0);
  const inspirationRequestIdRef = useRef<string | null>(null);
  const inspirationRunRef = useRef(0);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const chatInputRef = useRef<HTMLTextAreaElement | null>(null);

  const chapters = useMemo(() => [...(currentNovel?.chapters ?? [])].sort((a, b) => a.order - b.order), [currentNovel]);
  const activeChapter = chapters.find((chapter) => chapter.id === activeChapterId) ?? null;
  const currentChapterWords = countWords(activeChapter?.content ?? '');
  const totalWords = chapters.reduce((sum, chapter) => sum + countWords(chapter.content), 0);
  const selectedTextModel = useMemo(() => resolveTextModel(modelPreferences, apiProviderStore), [apiProviderStore, modelPreferences]);
  const chatUserTurns = chatMessages.filter((message) => message.role === 'user').length;
  const chatStage = Math.min(chatUserTurns, INSPIRATION_STAGES.length - 1);

  useEffect(() => {
    if (view === 'inspirationChat') chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [chatMessages, inspirationBusy, view]);

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
    async function flushLatestNovel() {
      const latestNovel = latestNovelRef.current;
      if (!latestNovel || latestSaveStatusRef.current === 'saved') return;
      const result = await novelService.saveNovel(latestNovel);
      if (result.ok) latestSaveStatusRef.current = 'saved';
    }

    function flushWithoutWaiting() {
      void flushLatestNovel();
    }

    function flushOnVisibilityChange() {
      if (document.visibilityState === 'hidden') flushWithoutWaiting();
    }

    const removeCloseFlush = rendererBridge.onNovelFlushBeforeClose?.(async () => {
      await flushLatestNovel();
    });

    window.addEventListener('beforeunload', flushWithoutWaiting);
    document.addEventListener('visibilitychange', flushOnVisibilityChange);
    return () => {
      flushWithoutWaiting();
      removeCloseFlush?.();
      window.removeEventListener('beforeunload', flushWithoutWaiting);
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

  function updateChapter(patch: Partial<Pick<Chapter, 'title' | 'content' | 'outline'>>) {
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

  function ensureTextModelReady(onIssue: (message: string) => void): { channel: ApiProviderChannel; model: string; baseUrl: string; apiKey: string } | null {
    if (!selectedTextModel) {
      onIssue('\u8bf7\u5148\u5728 API\u914d\u7f6e / \u6a21\u578b\u504f\u597d \u4e2d\u914d\u7f6e\u53ef\u7528\u6587\u672c\u6a21\u578b\u3002');
      return null;
    }
    const channel = selectedTextModel.channel;
    if (channel.enabled === false) {
      onIssue('\u5f53\u524d API \u6e20\u9053\u5df2\u7981\u7528\uff0c\u8bf7\u5728 API\u914d\u7f6e \u4e2d\u542f\u7528\u540e\u91cd\u8bd5\u3002');
      return null;
    }
    const baseUrl = channel.baseUrl;
    const apiKey = channel.apiKey;
    if (!baseUrl?.trim() || !apiKey?.trim()) {
      onIssue('\u5f53\u524d API \u6e20\u9053\u7f3a\u5c11 Base URL \u6216 API Key\uff0c\u8bf7\u5148\u5b8c\u6210 API\u914d\u7f6e\u3002');
      return null;
    }
    if (channel.apiFormat && channel.apiFormat !== 'openai') {
      onIssue('\u5f53\u524d\u4ec5\u652f\u6301 OpenAI-compatible \u6587\u672c\u6a21\u578b\u3002');
      return null;
    }
    return { channel, model: selectedTextModel.model, baseUrl, apiKey };
  }

  async function generateChapterDraft(action: AiDraftAction) {
    if (!currentNovel || !activeChapter) return;
    const readyModel = ensureTextModelReady(setTextGenerationError);
    if (!readyModel) return;
    if (action === 'outline' && !activeChapter.outline?.trim()) {
      setTextGenerationError('\u672c\u7ae0\u8fd8\u6ca1\u6709\u5927\u7eb2\uff0c\u8bf7\u5148\u901a\u8fc7\u300cAI \u751f\u6210\u5927\u7eb2\u300d\u751f\u6210\uff0c\u6216\u5c55\u5f00\u300c\u672c\u7ae0\u5927\u7eb2\u300d\u586b\u5199\u3002');
      return;
    }

    const selection = getChapterSelection();
    const aiSource: AiDraftSource = action === 'continue'
      ? { type: 'insert' }
      : action === 'outline'
        ? { type: 'outline', chapterId: activeChapter.id, content: activeChapter.content, updatedAt: activeChapter.updatedAt }
        : selection
          ? { type: 'selection', chapterId: activeChapter.id, start: selection.start, end: selection.end, text: selection.text }
          : { type: 'chapter', chapterId: activeChapter.id };
    const editText = selection?.text || activeChapter.content;
    if ((action === 'polish' || action === 'rewrite') && !editText.trim()) {
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
    setAiDraftSource(aiSource);

    const messages = action === 'polish'
      ? buildPolishChapterPrompt(currentNovel, activeChapter, editText)
      : action === 'rewrite'
        ? buildRewriteChapterPrompt(currentNovel, activeChapter, editText)
        : action === 'outline'
          ? buildChapterFromOutlinePrompt(currentNovel, activeChapter)
          : buildContinueChapterPrompt(currentNovel, activeChapter);

    const result = await rendererBridge.generateText({
      requestId,
      channelId: readyModel.channel.id,
      channelLabel: readyModel.channel.name,
      baseUrl: readyModel.baseUrl,
      apiKey: readyModel.apiKey,
      model: readyModel.model,
      messages,
      temperature: action === 'rewrite' ? 0.85 : action === 'outline' ? 0.8 : 0.75,
      maxTokens: action === 'outline' ? 1500 : action === 'continue' ? 700 : 1200,
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

  function getChapterSelection() {
    const target = editorRef.current;
    if (!target || !activeChapter) return null;
    const start = target.selectionStart;
    const end = target.selectionEnd;
    return end > start ? { start, end, text: activeChapter.content.slice(start, end) } : null;
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
    if (aiDraftSource.type === 'outline') {
      if (aiDraftSource.chapterId !== activeChapter.id) {
        setTextGenerationError('当前章节已切换，请切回原章节后再插入，或重新生成。');
        return;
      }
      const chapterChanged = activeChapter.content !== aiDraftSource.content || activeChapter.updatedAt !== aiDraftSource.updatedAt;
      if (chapterChanged && !window.confirm('生成期间本章正文已被修改，仍要在当前位置插入草稿吗？')) return;
    }
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

  function replaceAiDraftSource() {
    if (!activeChapter || !aiDraft || aiDraftSource.type === 'insert') return;
    if (aiDraftSource.chapterId !== activeChapter.id) {
      setTextGenerationError('\u539f\u6587\u8303\u56f4\u5df2\u53d8\u5316\uff0c\u8bf7\u91cd\u65b0\u9009\u62e9\u540e\u751f\u6210\u3002');
      return;
    }
    if (aiDraftSource.type === 'chapter') {
      updateChapter({ content: aiDraft });
      setAiDraft('');
      return;
    }
    if (aiDraftSource.type !== 'selection') return;
    const content = activeChapter.content;
    if (aiDraftSource.end > content.length || content.slice(aiDraftSource.start, aiDraftSource.end) !== aiDraftSource.text) {
      setTextGenerationError('\u539f\u6587\u8303\u56f4\u5df2\u53d8\u5316\uff0c\u8bf7\u91cd\u65b0\u9009\u62e9\u540e\u751f\u6210\u3002');
      return;
    }
    updateChapter({ content: `${content.slice(0, aiDraftSource.start)}${aiDraft}${content.slice(aiDraftSource.end)}` });
    setAiDraft('');
  }

  function openOutlineWizard() {
    if (!currentNovel) return;
    setWizardIdea(currentNovel.idea ?? '');
    setWizardBlueprint(currentNovel.blueprint ?? '');
    setWizardOutline('');
    setWizardError('');
    setWizardNotice('');
    setWizardStatus('idle');
    setWizardStep('idea');
  }

  function closeOutlineWizard() {
    cancelWizardGeneration();
    setWizardStep(null);
    setWizardError('');
    setWizardNotice('');
  }

  function goToWizardStep(step: WizardStep) {
    setWizardError('');
    setWizardNotice('');
    setWizardStep(step);
  }

  function saveWizardBlueprint() {
    updateNovel((novel) => ({ ...novel, idea: wizardIdea, blueprint: wizardBlueprint, updatedAt: new Date().toISOString() }));
  }

  async function runWizardGeneration(kind: 'blueprint' | 'outline') {
    if (!currentNovel) return;
    const readyModel = ensureTextModelReady(setWizardError);
    if (!readyModel) return;
    if (kind === 'blueprint' && !wizardIdea.trim()) {
      setWizardError('请先输入一句创意。');
      return;
    }
    if (kind === 'outline' && !wizardBlueprint.trim()) {
      setWizardError('请先生成或填写作品蓝图。');
      return;
    }
    if (kind === 'outline') saveWizardBlueprint();

    const requestId = createId('text-request');
    const runId = wizardRunRef.current + 1;
    wizardRunRef.current = runId;
    wizardRequestIdRef.current = requestId;
    setWizardStatus('generating');
    setWizardError('');
    setWizardNotice('');

    const messages = kind === 'blueprint'
      ? buildBlueprintPrompt(wizardIdea.trim())
      : buildOutlinePrompt({ ...currentNovel, idea: wizardIdea, blueprint: wizardBlueprint });

    const result = await rendererBridge.generateText({
      requestId,
      channelId: readyModel.channel.id,
      channelLabel: readyModel.channel.name,
      baseUrl: readyModel.baseUrl,
      apiKey: readyModel.apiKey,
      model: readyModel.model,
      messages,
      temperature: kind === 'blueprint' ? 0.85 : 0.7,
      maxTokens: kind === 'blueprint' ? 1000 : 2000,
    });

    if (wizardRunRef.current !== runId) return;
    wizardRequestIdRef.current = null;
    if (!result.ok || !result.text) {
      setWizardStatus('failed');
      setWizardError(result.message || (kind === 'blueprint' ? '生成蓝图失败，请稍后重试。' : '生成章节大纲失败，请稍后重试。'));
      return;
    }
    setWizardStatus('idle');
    if (kind === 'blueprint') {
      setWizardBlueprint(result.text);
      setWizardStep('blueprint');
      return;
    }
    setWizardOutline(result.text);
    setWizardStep('outline');
  }

  function cancelWizardGeneration() {
    const requestId = wizardRequestIdRef.current;
    wizardRunRef.current += 1;
    wizardRequestIdRef.current = null;
    setWizardStatus('idle');
    if (requestId) void rendererBridge.cancelTextGeneration(requestId);
  }

  function applyParsedOutline(outlineText: string, onIssue: (message: string) => void): boolean {
    if (!currentNovel) return false;
    const parsed = parseOutlineText(outlineText);
    if (!parsed.length) {
      onIssue('未能从大纲文本解析出章节，请把每章调整为「第1章 标题」+「大纲：…」两行的格式后重试。');
      return false;
    }
    if (currentNovel.chapters.length && !window.confirm(`确认后将用 ${parsed.length} 个新章节替换现有 ${currentNovel.chapters.length} 个章节，现有章节及正文将被删除。确定继续吗？`)) return false;
    const now = new Date().toISOString();
    const nextChapters: Chapter[] = parsed.map((item, index) => ({
      id: createId('chapter'),
      title: item.title,
      content: '',
      outline: item.outline,
      order: index,
      createdAt: now,
      updatedAt: now,
    }));
    updateNovel((novel) => ({ ...novel, chapters: nextChapters, updatedAt: now }));
    setActiveChapterId(nextChapters[0]?.id ?? null);
    return true;
  }

  function confirmWizardOutline() {
    if (!currentNovel) return;
    if (!applyParsedOutline(wizardOutline, setWizardError)) return;
    setWizardStep(null);
    setWizardError('');
    setWizardNotice('');
  }

  function openCreationCenter() {
    cancelInspirationGeneration();
    setInspirationError('');
    setView('creationCenter');
  }

  function startInspirationIntro() {
    setInspirationError('');
    setView('inspirationIntro');
  }

  function startInspirationSession() {
    if (!chatMessages.length) resetInspirationConversation();
    setView('inspirationPreparing');
    window.setTimeout(() => {
      setView((current) => current === 'inspirationPreparing' ? 'inspirationChat' : current);
    }, 600);
  }

  function resetInspirationConversation() {
    cancelInspirationGeneration();
    setChatMessages([{ id: createId('chat'), role: 'ai', text: INSPIRATION_OPENING_MESSAGE }]);
    setChatInput('');
    setInspirationError('');
    setInspirationIdeaDraft('');
    setInspirationBlueprintDraft('');
    setInspirationOutlineDraft('');
    setBlueprintConfirmed(false);
  }

  function resetInspirationChat() {
    if (chatUserTurns > 0 && !window.confirm('重置将清空当前对话内容，确定吗？')) return;
    resetInspirationConversation();
  }

  function cancelInspirationGeneration() {
    const requestId = inspirationRequestIdRef.current;
    inspirationRunRef.current += 1;
    inspirationRequestIdRef.current = null;
    setInspirationBusy('idle');
    if (requestId) void rendererBridge.cancelTextGeneration(requestId);
  }

  async function generateInspirationText(kind: 'chat' | 'blueprint' | 'outline', messages: TextMessage[]): Promise<string | null> {
    const readyModel = ensureTextModelReady(setInspirationError);
    if (!readyModel) return null;
    const requestId = createId('text-request');
    const runId = inspirationRunRef.current + 1;
    inspirationRunRef.current = runId;
    inspirationRequestIdRef.current = requestId;
    setInspirationBusy(kind);
    setInspirationError('');
    const result = await rendererBridge.generateText({
      requestId,
      channelId: readyModel.channel.id,
      channelLabel: readyModel.channel.name,
      baseUrl: readyModel.baseUrl,
      apiKey: readyModel.apiKey,
      model: readyModel.model,
      messages,
      temperature: kind === 'chat' ? 0.9 : kind === 'blueprint' ? 0.85 : 0.7,
      maxTokens: kind === 'chat' ? 500 : kind === 'blueprint' ? 1000 : 2000,
    });
    if (inspirationRunRef.current !== runId) return null;
    inspirationRequestIdRef.current = null;
    setInspirationBusy('idle');
    if (!result.ok || !result.text) {
      setInspirationError(result.message || '文思暂时没能接上话，请稍后重试。');
      return null;
    }
    return result.text;
  }

  async function sendInspirationMessage() {
    const text = chatInput.trim();
    if (!text || inspirationBusy !== 'idle' || chatUserTurns >= MAX_CHAT_TURNS) return;
    const nextMessages: ChatBubble[] = [...chatMessages, { id: createId('chat'), role: 'user', text }];
    setChatMessages(nextMessages);
    setChatInput('');
    const reply = await generateInspirationText('chat', buildInspirationChatPrompt(nextMessages));
    if (reply === null) return;
    setChatMessages((current) => [...current, { id: createId('chat'), role: 'ai', text: reply }]);
  }

  function handleChatKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void sendInspirationMessage();
  }

  function collectInspirationIdea(): string {
    return chatMessages.filter((message) => message.role === 'user').map((message) => message.text).join('\n');
  }

  async function generateInspirationBlueprint() {
    if (inspirationBusy !== 'idle') return;
    if (!chatUserTurns) {
      setInspirationError('先和文思聊聊你的灵感，再生成蓝图。');
      return;
    }
    const fromChat = view === 'inspirationChat';
    const text = await generateInspirationText('blueprint', buildBlueprintFromConversationPrompt(chatMessages));
    if (text === null) return;
    if (fromChat || !inspirationIdeaDraft.trim()) setInspirationIdeaDraft(collectInspirationIdea());
    setInspirationBlueprintDraft(text);
    setBlueprintConfirmed(false);
    setView('inspirationBlueprint');
  }

  async function confirmInspirationBlueprint() {
    if (!inspirationBlueprintDraft.trim()) return;
    const idea = inspirationIdeaDraft.trim() ? inspirationIdeaDraft : collectInspirationIdea();
    const blueprint = inspirationBlueprintDraft;
    const now = new Date().toISOString();
    if (currentNovel) {
      updateNovel((novel) => ({ ...novel, idea, blueprint, updatedAt: now }));
      setBlueprintConfirmed(true);
      return;
    }
    const result = await novelService.createNovel({ title: '' });
    if (!result.ok || !result.novel) {
      setInspirationError(result.message || '创建小说失败，请稍后重试。');
      return;
    }
    revisionRef.current += 1;
    setCurrentNovel({ ...result.novel, idea, blueprint, updatedAt: now });
    setActiveChapterId(null);
    setSaveStatus('dirty');
    setBlueprintConfirmed(true);
    void loadSummaries();
  }

  async function generateInspirationOutline() {
    if (!currentNovel || inspirationBusy !== 'idle') return;
    const text = await generateInspirationText('outline', buildOutlinePrompt({ ...currentNovel, blueprint: inspirationBlueprintDraft }));
    if (text === null) return;
    setInspirationOutlineDraft(text);
    setView('inspirationOutline');
  }

  function confirmInspirationOutline() {
    if (!currentNovel) return;
    if (!applyParsedOutline(inspirationOutlineDraft, setInspirationError)) return;
    setInspirationError('');
    setView('workbench');
  }

  return (
    <main className={view === 'workbench' ? 'novel-creation' : 'novel-creation novel-creation--flow'} aria-label="小说创作">
      {view === 'creationCenter' && (
        <section className="novel-center" aria-label="创作中心">
          <header className="novel-center__head">
            <p>Novel Studio</p>
            <h1>创作中心</h1>
            <span>从一次对话开始，或回到你的书桌。</span>
          </header>
          <div className="novel-center__cards">
            <article className="novel-center__card novel-center__card--inspiration">
              <h2>灵感模式</h2>
              <p>通过对话梳理故事灵感，并进入蓝图、大纲与章节正文。</p>
              <button className="novel-flow__primary" onClick={startInspirationIntro} type="button">开启灵感模式</button>
            </article>
            <article className="novel-center__card">
              <h2>小说工作台</h2>
              <p>查看、编辑和管理本地小说与章节。</p>
              <span className="novel-center__meta">{summaries.length ? `最近编辑：《${summaries[0].title}》` : '暂无本地小说'}</span>
              <button className="novel-flow__primary" onClick={() => setView('workbench')} type="button">进入工作台</button>
            </article>
          </div>
        </section>
      )}
      {view === 'inspirationIntro' && (
        <section className="novel-intro" aria-label="灵感模式启动">
          <div className="novel-intro__panel">
            <p className="novel-intro__eyebrow">灵感模式</p>
            <h1>小说家的新篇章</h1>
            <p className="novel-intro__sub">和「文思」对话，整理你的故事种子，并生成可确认的创作蓝图。</p>
            <div className="novel-intro__actions">
              <button className="novel-flow__primary" onClick={startInspirationSession} type="button">开启灵感模式</button>
              <button className="novel-flow__ghost" onClick={openCreationCenter} type="button">返回创作中心</button>
            </div>
          </div>
        </section>
      )}
      {view === 'inspirationPreparing' && (
        <section className="novel-preparing" aria-label="灵感空间准备中">
          <span className="novel-preparing__pulse" aria-hidden="true" />
          <h2>正在为你准备灵感空间</h2>
          <p>文思正在整理对话上下文…</p>
        </section>
      )}
      {view === 'inspirationChat' && (
        <section className="novel-chat" aria-label="灵感对话">
          <header className="novel-chat__bar">
            <div className="novel-chat__bar-side">
              <button className="novel-flow__ghost" onClick={() => setView('inspirationIntro')} type="button">返回</button>
            </div>
            <div className="novel-chat__bar-center">
              <strong>与「文思」对话中...</strong>
              <span className="novel-chat__stage">{INSPIRATION_STAGES[chatStage]} {chatStage + 1}/4</span>
            </div>
            <div className="novel-chat__bar-side novel-chat__bar-side--end">
              <button className="novel-flow__ghost" onClick={resetInspirationChat} type="button">重置</button>
              <button className="novel-flow__ghost" onClick={openCreationCenter} type="button">关闭</button>
            </div>
          </header>
          <div className="novel-chat__messages">
            {chatMessages.map((message) => (
              <div className={message.role === 'ai' ? 'novel-chat__bubble novel-chat__bubble--ai' : 'novel-chat__bubble novel-chat__bubble--user'} key={message.id}>{message.text}</div>
            ))}
            {inspirationBusy === 'chat' && <div className="novel-chat__bubble novel-chat__bubble--ai novel-chat__bubble--pending">文思正在思考...</div>}
            <div ref={chatEndRef} />
          </div>
          <footer className="novel-chat__composer">
            {inspirationError && <p className="novel-flow__error">{inspirationError}</p>}
            <div className="novel-chat__actions">
              <button className="novel-flow__primary novel-flow__primary--compact" disabled={inspirationBusy !== 'idle' || !chatUserTurns} onClick={() => void generateInspirationBlueprint()} type="button">{inspirationBusy === 'blueprint' ? '生成蓝图中…' : '生成蓝图'}</button>
              <button className="novel-flow__ghost" disabled={inspirationBusy !== 'idle'} onClick={() => chatInputRef.current?.focus()} type="button">继续对话</button>
              {(chatUserTurns >= 4) && inspirationBusy === 'idle' && <span className="novel-chat__ready">{chatUserTurns >= MAX_CHAT_TURNS ? '已达 8 轮对话上限，让文思为你生成蓝图吧' : '文思觉得灵感差不多了，可以生成蓝图'}</span>}
            </div>
            <div className="novel-chat__input">
              <textarea ref={chatInputRef} disabled={chatUserTurns >= MAX_CHAT_TURNS} value={chatInput} onChange={(event) => setChatInput(event.target.value)} onKeyDown={handleChatKeyDown} placeholder={chatUserTurns >= MAX_CHAT_TURNS ? '对话已达上限，点击「生成蓝图」继续' : '告诉文思你的故事灵感、角色、冲突或世界设定...'} rows={2} />
              <button disabled={!chatInput.trim() || inspirationBusy !== 'idle' || chatUserTurns >= MAX_CHAT_TURNS} onClick={() => void sendInspirationMessage()} type="button">发送</button>
            </div>
          </footer>
        </section>
      )}
      {view === 'inspirationBlueprint' && (
        <section className="novel-preview novel-preview--blueprint" aria-label="蓝图预览">
          <header className="novel-preview__head">
            <p className="novel-intro__eyebrow">灵感模式</p>
            <h2>作品蓝图</h2>
            <span>{blueprintConfirmed ? '蓝图已保存，可以继续生成章节大纲。' : '检查并润色文思为你整理的蓝图，确认后写入小说。'}</span>
          </header>
          <label className="novel-preview__label" htmlFor="inspiration-idea">创意概要</label>
          <textarea className="novel-preview__editor novel-preview__editor--idea" id="inspiration-idea" value={inspirationIdeaDraft} onChange={(event) => { setInspirationIdeaDraft(event.target.value); setBlueprintConfirmed(false); }} placeholder="这本书最初的点子，会随蓝图一起写入小说…" />
          <label className="novel-preview__label" htmlFor="inspiration-blueprint">作品蓝图</label>
          <textarea className="novel-preview__editor" id="inspiration-blueprint" value={inspirationBlueprintDraft} onChange={(event) => { setInspirationBlueprintDraft(event.target.value); setBlueprintConfirmed(false); }} placeholder="作品蓝图…" />
          {inspirationError && <p className="novel-flow__error">{inspirationError}</p>}
          <footer className="novel-preview__actions">
            {blueprintConfirmed ? (
              <>
                <button className="novel-flow__primary" disabled={inspirationBusy !== 'idle'} onClick={() => void generateInspirationOutline()} type="button">{inspirationBusy === 'outline' ? '生成大纲中…' : '生成章节大纲'}</button>
                <button className="novel-flow__ghost" disabled={inspirationBusy !== 'idle'} onClick={() => setView('inspirationChat')} type="button">返回对话</button>
              </>
            ) : (
              <>
                <button className="novel-flow__primary" disabled={inspirationBusy !== 'idle' || !inspirationBlueprintDraft.trim()} onClick={() => void confirmInspirationBlueprint()} type="button">确认蓝图</button>
                <button className="novel-flow__ghost" disabled={inspirationBusy !== 'idle'} onClick={() => void generateInspirationBlueprint()} type="button">{inspirationBusy === 'blueprint' ? '重新生成中…' : '重新生成'}</button>
                <button className="novel-flow__ghost" disabled={inspirationBusy !== 'idle'} onClick={() => setView('inspirationChat')} type="button">返回对话</button>
              </>
            )}
          </footer>
        </section>
      )}
      {view === 'inspirationOutline' && (
        <section className="novel-preview" aria-label="大纲预览">
          <header className="novel-preview__head">
            <p className="novel-intro__eyebrow">灵感模式</p>
            <h2>章节大纲</h2>
            <span>确认后将按大纲生成章节列表，正文留空，由你逐章创作。</span>
          </header>
          <textarea className="novel-preview__editor" value={inspirationOutlineDraft} onChange={(event) => setInspirationOutlineDraft(event.target.value)} placeholder="章节大纲，每章两行：第1章 标题 / 大纲：…" />
          {inspirationError && <p className="novel-flow__error">{inspirationError}</p>}
          <footer className="novel-preview__actions">
            <button className="novel-flow__primary" disabled={inspirationBusy !== 'idle' || !inspirationOutlineDraft.trim()} onClick={confirmInspirationOutline} type="button">确认生成章节</button>
            <button className="novel-flow__ghost" disabled={inspirationBusy !== 'idle'} onClick={() => void generateInspirationOutline()} type="button">{inspirationBusy === 'outline' ? '重新生成中…' : '重新生成'}</button>
            <button className="novel-flow__ghost" disabled={inspirationBusy !== 'idle'} onClick={() => setView('inspirationBlueprint')} type="button">返回蓝图</button>
          </footer>
        </section>
      )}
      {view === 'workbench' && (
        <>
      <section className="novel-creation__list">
        <header>
          <div><p>Novel Studio</p><h1>小说创作</h1></div>
          <button onClick={() => { setForm(emptyForm); setModalMode('create'); }} type="button">新建小说</button>
        </header>
        <button className="novel-list__inspiration" onClick={startInspirationIntro} type="button">从灵感开始</button>
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
            <div className="chapter-head"><span>章节</span><div className="chapter-head__actions"><button onClick={openOutlineWizard} type="button">AI 生成大纲</button><button onClick={addChapter} type="button">新建章节</button></div></div>
            {chapters.length ? <div className="chapter-list">{chapters.map((chapter) => <button className={chapter.id === activeChapterId ? 'chapter-list__item chapter-list__item--active' : 'chapter-list__item'} key={chapter.id} onClick={() => setActiveChapterId(chapter.id)} type="button"><strong>{chapter.title || '未命名章节'}</strong><span>{countWords(chapter.content)} 字</span></button>)}</div> : <EmptyState title="暂无章节" text="点击新建章节开始写作。" />}
          </>
        ) : <EmptyState title={feedback || '未选择小说'} text="从左侧选择一本小说，或新建一本小说。" />}
      </section>

      <section className="novel-creation__editor">
        {currentNovel && activeChapter ? (
          <>
            <header>
              <input ref={chapterTitleRef} value={activeChapter.title} onChange={(event) => updateChapter({ title: event.target.value })} placeholder="未命名章节" />
              <div className="editor-stats"><span>{saveStatusLabel(saveStatus)}</span><span>{'\u5f53\u524d\u7ae0'} {currentChapterWords} {'\u5b57'}</span><span>{'\u5168\u4e66'} {totalWords} {'\u5b57'}</span><span>{formatTime(activeChapter.updatedAt)}</span><button disabled={textGenerationStatus === 'generating'} onClick={() => void generateChapterDraft('continue')} type="button">{textGenerationStatus === 'generating' ? '\u751f\u6210\u4e2d' : 'AI \u7eed\u5199'}</button><button disabled={textGenerationStatus === 'generating'} onClick={() => void generateChapterDraft('polish')} type="button">{'AI \u6da6\u8272'}</button><button disabled={textGenerationStatus === 'generating'} onClick={() => void generateChapterDraft('rewrite')} type="button">{'AI \u6539\u5199'}</button>{typeof activeChapter.outline === 'string' && activeChapter.outline.trim() !== '' && <button disabled={textGenerationStatus === 'generating'} onClick={() => void generateChapterDraft('outline')} type="button">{'\u6309\u5927\u7eb2\u751f\u6210\u6b63\u6587'}</button>}{textGenerationStatus === 'generating' && <button onClick={cancelTextGeneration} type="button">{'\u53d6\u6d88'}</button>}{saveStatus === 'failed' && <button onClick={() => void saveCurrentNovel()} type="button">{'\u91cd\u8bd5'}</button>}</div>
              {typeof activeChapter.outline === 'string' && <details className="chapter-outline"><summary>本章大纲</summary><textarea value={activeChapter.outline} onChange={(event) => updateChapter({ outline: event.target.value })} placeholder="本章剧情要点…" /></details>}
            </header>
            <textarea ref={editorRef} value={activeChapter.content} onChange={(event) => updateChapter({ content: event.target.value })} placeholder="开始写正文…" />
            {(aiDraft || textGenerationError) && <div className="novel-ai-draft">{textGenerationError ? <p>{textGenerationError}</p> : <><strong>{aiDraftTitle(aiDraftAction)}</strong><p>{aiDraft}</p><div>{(aiDraftSource.type === 'chapter' || aiDraftSource.type === 'selection') && <button onClick={replaceAiDraftSource} type="button">{'\u66ff\u6362\u539f\u6587'}</button>}<button onClick={insertAiDraft} type="button">{'\u63d2\u5165\u6b63\u6587'}</button><button onClick={() => void copyAiDraft()} type="button">{'\u590d\u5236'}</button><button onClick={() => setAiDraft('')} type="button">{'\u653e\u5f03'}</button></div></>}</div>}
            <button className="chapter-delete" onClick={() => deleteChapter(activeChapter.id)} type="button">删除章节</button>
          </>
        ) : currentNovel ? <EmptyState title="无章节" text="在中间栏新建章节后开始写作。" /> : <EmptyState title="小说工作台" text="本地保存，选择小说后进入章节编辑。" />}
      </section>

      {modalMode && <div className="novel-modal" role="dialog" aria-modal="true" aria-label={modalMode === 'create' ? '新建小说' : '编辑小说信息'} onClick={() => setModalMode(null)}><div onClick={(event) => event.stopPropagation()}><h2>{modalMode === 'create' ? '新建小说' : '编辑小说信息'}</h2><label>标题<input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} /></label><label>简介<textarea value={form.summary} onChange={(event) => setForm((current) => ({ ...current, summary: event.target.value }))} /></label><label>备注<input value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} /></label><footer><button onClick={() => setModalMode(null)} type="button">取消</button><button onClick={() => void submitNovelForm()} type="button">保存</button></footer></div></div>}
      {wizardStep && currentNovel && (
        <div className="novel-modal" role="dialog" aria-modal="true" aria-label="AI 生成大纲" onClick={closeOutlineWizard}>
          <div className="novel-wizard" onClick={(event) => event.stopPropagation()}>
            <h2>AI 生成大纲</h2>
            <p className="novel-wizard__steps">{wizardStepLabel(wizardStep)}</p>
            {wizardStep === 'idea' && (
              <>
                <label>一句创意<textarea className="novel-wizard__input--short" value={wizardIdea} onChange={(event) => setWizardIdea(event.target.value)} placeholder="例：一个能听见植物说话的植物学家，被卷入一场灭世阴谋。" /></label>
                <footer>
                  <button onClick={closeOutlineWizard} type="button">取消</button>
                  {wizardBlueprint.trim() !== '' && <button disabled={wizardStatus === 'generating'} onClick={() => goToWizardStep('blueprint')} type="button">使用已有蓝图</button>}
                  <button disabled={wizardStatus === 'generating'} onClick={() => void runWizardGeneration('blueprint')} type="button">{wizardStatus === 'generating' ? '生成中…' : '生成蓝图'}</button>
                </footer>
              </>
            )}
            {wizardStep === 'blueprint' && (
              <>
                <label>作品蓝图（可编辑）<textarea className="novel-wizard__input" value={wizardBlueprint} onChange={(event) => setWizardBlueprint(event.target.value)} placeholder="生成或手动填写作品蓝图…" /></label>
                <footer>
                  <button disabled={wizardStatus === 'generating'} onClick={() => goToWizardStep('idea')} type="button">上一步</button>
                  <button disabled={wizardStatus === 'generating'} onClick={() => void runWizardGeneration('blueprint')} type="button">重新生成</button>
                  <button disabled={wizardStatus === 'generating'} onClick={() => { saveWizardBlueprint(); setWizardNotice('蓝图已保存。'); }} type="button">保存蓝图</button>
                  <button disabled={wizardStatus === 'generating'} onClick={() => void runWizardGeneration('outline')} type="button">{wizardStatus === 'generating' ? '生成中…' : '生成章节大纲'}</button>
                </footer>
              </>
            )}
            {wizardStep === 'outline' && (
              <>
                <label>章节大纲（可编辑）<textarea className="novel-wizard__input" value={wizardOutline} onChange={(event) => setWizardOutline(event.target.value)} placeholder="生成或手动填写章节大纲，每章两行：第1章 标题 / 大纲：…" /></label>
                <footer>
                  <button disabled={wizardStatus === 'generating'} onClick={() => goToWizardStep('blueprint')} type="button">上一步</button>
                  <button disabled={wizardStatus === 'generating'} onClick={() => void runWizardGeneration('outline')} type="button">重新生成</button>
                  <button disabled={wizardStatus === 'generating'} onClick={confirmWizardOutline} type="button">确认生成章节</button>
                </footer>
              </>
            )}
            {wizardStatus === 'generating' && <p className="novel-wizard__hint">AI 生成中，请稍候… <button onClick={cancelWizardGeneration} type="button">取消生成</button></p>}
            {wizardNotice && <p className="novel-wizard__notice">{wizardNotice}</p>}
            {wizardError && <p className="novel-wizard__error">{wizardError}</p>}
          </div>
        </div>
      )}
        </>
      )}
    </main>
  );
}

function wizardStepLabel(step: WizardStep): string {
  if (step === 'idea') return '第 1 步 / 共 3 步：输入一句创意';
  if (step === 'blueprint') return '第 2 步 / 共 3 步：确认作品蓝图';
  return '第 3 步 / 共 3 步：确认章节大纲';
}

function aiActionLabel(action: AiDraftAction): string {
  if (action === 'polish') return '\u6da6\u8272';
  if (action === 'rewrite') return '\u6539\u5199';
  if (action === 'outline') return '\u6309\u5927\u7eb2\u751f\u6210\u6b63\u6587';
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
