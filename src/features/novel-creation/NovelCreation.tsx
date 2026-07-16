import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowLeftIcon, BoltIcon, BookIcon, ChartIcon, ChevronDownIcon, GlobeIcon, ListIcon, PenBookIcon, ProjectIcon, ScriptIcon, UserIcon, UsersIcon } from '../../app/icons';
import { rendererBridge } from '../../services/rendererBridge';
import { novelService } from '../../services/novelService';
import type { CharacterGraph, Chapter, Foreshadowing, Novel, NovelSummary, SettingEntry, SettingType } from '../../types/novel';
import { buildBlueprintFromConversationPrompt, buildInspirationChatPrompt, buildOutlinePrompt, INSPIRATION_OPENING_MESSAGE, parseImportedManuscript, parseOutlineText, PINNED_CONTEXT_LIMIT, type InspirationChatMessage, type TextMessage } from './novelPrompts';
import { buildCharacterGraphPrompt, parseCharacterGraph } from './characterGraph';
import { NovelCharacterGraphPanel } from './NovelCharacterGraph';
import { NovelErrorBanner, NovelListSkeleton } from './NovelSkeletons';
import { ChapterWorkbench } from './ChapterWorkbench';
import { ForeshadowingPanel, type ForeshadowingDraft } from './ForeshadowingPanel';
import { NovelStats } from './NovelStats';
import { EmotionArcPanel } from './EmotionArcPanel';
import { SettingPanel } from './SettingPanel';
import type { SettingDraft } from './novelSettings';
import { countWords, createId, formatTime, type SaveStatus } from './novelShared';
import { CHAPTER_STATUS_LABEL, PROGRESS_LABELS, resolveChapterStatus } from './novelProgress';
import { copyWholeBookMarkdown, exportOfflinePackage, exportStoryboardDocFile, exportWholeBookMarkdownFile } from './novelExport';
import { ChapterSearchPanel, type ChapterLocateRequest, type ChapterSearchResult } from './novelNavigation';
import { deleteChapterInStructure, groupChaptersByVolume, orderedChapters } from './novelStructure';
import { chapterText, initialScenes } from './sceneStructure';
import { VolumeOutline } from './VolumeOutline';
import { migrateLegacyNovelAnalysis } from './novelAnalysisPersistence';
import './NovelCreation.css';

type NovelView = 'creationCenter' | 'projectList' | 'projectView' | 'inspirationIntro' | 'inspirationPreparing' | 'inspirationChat' | 'inspirationBlueprint' | 'inspirationOutline' | 'workbench';
type ProjectViewTab = 'overview' | 'world' | 'characters' | 'graph' | 'outline' | 'chapters' | 'emotion' | 'foreshadowing';
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
const WORLD_SETTING_TYPES = ['location', 'organization', 'item', 'term', 'rule', 'other'] satisfies SettingType[];
const CHARACTER_SETTING_TYPES = ['character'] satisfies SettingType[];
const PROJECT_VIEW_TABS = [
  { id: 'overview', label: '项目概览', description: '定位与整体概览', Icon: ProjectIcon },
  { id: 'world', label: '世界设定', description: '规则、地点与阵营', Icon: GlobeIcon },
  { id: 'characters', label: '主要角色', description: '人物性格与目标', Icon: UserIcon },
  { id: 'graph', label: '人物关系', description: '角色之间的关系', Icon: UsersIcon },
  { id: 'outline', label: '章节大纲', description: '故事结构规划', Icon: ListIcon },
  { id: 'chapters', label: '章节内容', description: '生成状态与摘要', Icon: BookIcon },
  { id: 'foreshadowing', label: '伏笔管理', description: '故事线索与回收', Icon: BoltIcon },
  { id: 'emotion', label: '情感曲线', description: '全书情绪起伏与基调', Icon: ChartIcon },
] as const satisfies readonly { id: ProjectViewTab; label: string; description: string; Icon: typeof ProjectIcon }[];

export function NovelCreation({ projectId }: { projectId: string }) {
  const [summaries, setSummaries] = useState<NovelSummary[]>([]);
  const [currentNovel, setCurrentNovel] = useState<Novel | null>(null);
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
  const [pendingLocate, setPendingLocate] = useState<ChapterLocateRequest | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [feedback, setFeedback] = useState('');
  const [isLoading, setLoading] = useState(true);
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [form, setForm] = useState<NovelForm>(emptyForm);
  const [modelPreferences, setModelPreferences] = useState<ModelPreferences>(() => readLocalStorage(MODEL_PREFERENCES_STORAGE_KEY, {}));
  const [apiProviderStore, setApiProviderStore] = useState<ApiProviderStore>(() => readLocalStorage(API_PROVIDER_STORAGE_KEY, {}));
  const [view, setView] = useState<NovelView>('creationCenter');
  const [projectViewTab, setProjectViewTab] = useState<ProjectViewTab>('overview');
  const [initialForeshadowPanel, setInitialForeshadowPanel] = useState(false);
  const [workbenchReturnTab, setWorkbenchReturnTab] = useState<ProjectViewTab | null>(null);
  const [chapterPickerOpen, setChapterPickerOpen] = useState(false);
  const [analyzeChapterId, setAnalyzeChapterId] = useState<string | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatBubble[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [inspirationBusy, setInspirationBusy] = useState<InspirationBusy>('idle');
  const [inspirationError, setInspirationError] = useState('');
  const [inspirationBlueprintDraft, setInspirationBlueprintDraft] = useState('');
  const [inspirationIdeaDraft, setInspirationIdeaDraft] = useState('');
  const [inspirationOutlineDraft, setInspirationOutlineDraft] = useState('');
  const [blueprintConfirmed, setBlueprintConfirmed] = useState(false);
  const revisionRef = useRef(0);
  const latestNovelRef = useRef<Novel | null>(null);
  const latestSaveStatusRef = useRef<SaveStatus>('saved');
  const inspirationRequestIdRef = useRef<string | null>(null);
  const inspirationRunRef = useRef(0);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const chatInputRef = useRef<HTMLTextAreaElement | null>(null);
  const projectPanelRef = useRef<HTMLElement | null>(null);
  const lastProjectIdRef = useRef(projectId);
  const lastValidChapterRef = useRef(new Map<string, string>());
  const [graphBusy, setGraphBusy] = useState(false);
  const [graphError, setGraphError] = useState('');
  const graphRequestIdRef = useRef<string | null>(null);
  const graphRunRef = useRef(0);

  const chapters = useMemo(() => (currentNovel ? orderedChapters(currentNovel) : []), [currentNovel]);
  const graphData = currentNovel?.characterGraph ?? null;
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
    setGraphError('');
  }, [currentNovel?.id]);

  useEffect(() => {
    if (lastProjectIdRef.current === projectId) return;
    lastProjectIdRef.current = projectId;
    let active = true;
    void (async () => {
      const dirtyNovel = latestNovelRef.current;
      if (dirtyNovel && latestSaveStatusRef.current !== 'saved') {
        await novelService.saveNovel(dirtyNovel);
        latestSaveStatusRef.current = 'saved';
      }
      if (!active) return;
      setCurrentNovel(null);
      setActiveChapterId(null);
      setInitialForeshadowPanel(false);
      setWorkbenchReturnTab(null);
      setChapterPickerOpen(false);
      setExportMenuOpen(false);
      setView('creationCenter');
      setFeedback('');
      await loadSummaries();
    })();
    return () => { active = false; };
  }, [projectId]);

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
    const result = await novelService.listNovels(projectId);
    setLoading(false);
    if (!result.ok) {
      setFeedback(result.message ?? '加载小说列表失败。');
      setSummaries([]);
      return;
    }
    setSummaries(result.novels);
  }

  async function openNovel(id: string): Promise<boolean> {
    if (currentNovel && saveStatus !== 'saved') await novelService.saveNovel(currentNovel);
    const result = await novelService.loadNovel(id);
    if (!result.ok || !result.novel) {
      setFeedback(result.message || '小说文件损坏。');
      setCurrentNovel(null);
      setActiveChapterId(null);
      return false;
    }
    const novel = await migrateLegacyNovelAnalysis(result.novel, window.localStorage, (next) => novelService.saveNovel(next));
    setCurrentNovel(novel);
    setActiveChapterId(orderedChapters(novel)[0]?.id ?? null);
    setSaveStatus('saved');
    setFeedback('');
    return true;
  }

  async function openProjectView(id: string) {
    if (!await openNovel(id)) return;
    setInitialForeshadowPanel(false);
    setWorkbenchReturnTab(null);
    setExportMenuOpen(false);
    setProjectViewTab('overview');
    setView('projectView');
  }

  async function openProjectWorkbench(id: string, chapterId?: string, intent?: { foreshadowPanel?: boolean; returnTab?: ProjectViewTab }) {
    const previousNovel = currentNovel;
    const previousActiveChapterId = activeChapterId;
    if (!await openNovel(id)) {
      setCurrentNovel(previousNovel);
      setActiveChapterId(previousActiveChapterId);
      setInitialForeshadowPanel(false);
      setWorkbenchReturnTab(null);
      return;
    }
    if (chapterId) setActiveChapterId(chapterId);
    setInitialForeshadowPanel(Boolean(intent?.foreshadowPanel));
    setWorkbenchReturnTab(intent?.returnTab ?? null);
    setExportMenuOpen(false);
    setView('workbench');
  }

  async function deleteProject(novel: NovelSummary) {
    if (!window.confirm(`确定删除小说项目「${novel.title || '未命名小说'}」吗？项目章节与正文将一并删除，不可恢复。`)) return;
    const result = await novelService.deleteNovel(novel.id);
    if (!result.ok) {
      setFeedback(result.message || '删除小说失败。');
      return;
    }
    if (currentNovel?.id === novel.id) {
      setCurrentNovel(null);
      setActiveChapterId(null);
      setSaveStatus('saved');
    }
    setFeedback('');
    await loadSummaries();
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
      const result = await novelService.createNovel({ ...form, projectId });
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

  function addChapter() {
    const now = new Date().toISOString();
    const chapter: Chapter = { id: createId('chapter'), title: '未命名章节', scenes: initialScenes(), order: chapters.length, createdAt: now, updatedAt: now };
    updateNovel((novel) => ({ ...novel, chapters: [...novel.chapters, chapter], updatedAt: now }));
    setActiveChapterId(chapter.id);
  }

  function updateChapterById(chapterId: string, patch: Partial<Pick<Chapter, 'title' | 'scenes' | 'outline' | 'status' | 'wordTarget'>>) {
    const now = new Date().toISOString();
    updateNovel((novel) => ({
      ...novel,
      updatedAt: now,
      chapters: novel.chapters.map((chapter) => chapter.id === chapterId ? { ...chapter, ...patch, updatedAt: now } : chapter),
    }));
  }

  function updateChapterByIdAndSave(chapterId: string, patch: Partial<Pick<Chapter, 'title' | 'scenes' | 'outline' | 'status' | 'wordTarget'>>) {
    if (!currentNovel) return;
    const now = new Date().toISOString();
    const nextNovel: Novel = {
      ...currentNovel,
      updatedAt: now,
      chapters: currentNovel.chapters.map((chapter) => chapter.id === chapterId ? { ...chapter, ...patch, updatedAt: now } : chapter),
    };
    revisionRef.current += 1;
    const revision = revisionRef.current;
    setCurrentNovel(nextNovel);
    setSaveStatus('saving');
    void novelService.saveNovel(nextNovel).then((result) => {
      if (!result.ok) {
        setSaveStatus('failed');
        setFeedback(result.message);
        return;
      }
      if (revisionRef.current === revision) setSaveStatus('saved');
      else setSaveStatus('dirty');
      if (result.novel) setCurrentNovel((current) => current && current.id === result.novel?.id ? { ...current, updatedAt: result.novel.updatedAt } : current);
      void loadSummaries();
    });
  }

  function deleteChapterById(chapterId: string) {
    const index = chapters.findIndex((chapter) => chapter.id === chapterId);
    if (index < 0) return;
    const chapter = chapters[index];
    if (!window.confirm(`确定删除「第 ${index + 1} 章 · ${chapter.title || '未命名章节'}」吗？本章大纲与正文将一并删除，不可恢复。`)) return;
    updateNovel((novel) => deleteChapterInStructure(novel, chapterId));
    setActiveChapterId((current) => current === chapterId ? null : current);
  }

  async function openSearchResult(result: ChapterSearchResult) {
    setPendingLocate({
      chapterId: result.chapterId,
      sceneId: result.sceneId,
      ...(result.field === 'content' ? { offset: result.matchOffset, text: result.matchedText } : {}),
      requestId: Date.now(),
    });
    await openProjectWorkbench(currentNovel?.id ?? '', result.chapterId);
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
      scenes: initialScenes(),
      outline: item.outline,
      order: index,
      createdAt: now,
      updatedAt: now,
    }));
    updateNovel((novel) => ({ ...novel, chapters: nextChapters, updatedAt: now }));
    setActiveChapterId(nextChapters[0]?.id ?? null);
    return true;
  }

  function openCreationCenter() {
    cancelInspirationGeneration();
    setInspirationError('');
    setView('creationCenter');
  }

  function hasUnsettledInspirationContent() {
    return chatUserTurns > 0
      || Boolean(chatInput.trim())
      || Boolean(inspirationIdeaDraft.trim())
      || Boolean(inspirationBlueprintDraft.trim())
      || Boolean(inspirationOutlineDraft.trim());
  }

  function closeInspirationFlow() {
    if (hasUnsettledInspirationContent() && !window.confirm('关闭后本次灵感对话不会保存，确定关闭吗？')) return;
    openCreationCenter();
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
      projectId: currentNovel?.id ?? projectId,
      requestType: `novel.inspiration.${kind}`,
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
    const result = await novelService.createNovel({ title: '', projectId });
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

  function startNewProject() {
    setForm(emptyForm);
    setModalMode('create');
  }

  async function handleImportManuscript() {
    const picked = await rendererBridge.openTextFile();
    if (!picked.ok) {
      if (!picked.canceled) setFeedback(picked.message || '导入失败。');
      return;
    }
    const rawContent = picked.content ?? '';
    if (!rawContent.trim()) {
      setFeedback('文件内容为空，未导入。');
      return;
    }
    const baseName = (picked.fileName ?? '').replace(/\.[^.]+$/, '').trim();
    const title = baseName || '导入的小说';
    const parsed = parseImportedManuscript(rawContent);
    const createResult = await novelService.createNovel({ title, projectId });
    if (!createResult.ok || !createResult.novel) {
      setFeedback(createResult.message || '创建小说失败，请稍后重试。');
      return;
    }
    const now = new Date().toISOString();
    const chapters: Chapter[] = parsed.chapters.map((chapter, index) => ({
      id: createId('chapter'),
      title: chapter.title,
      scenes: [{ ...initialScenes()[0], content: chapter.content }],
      order: index,
      createdAt: now,
      updatedAt: now,
    }));
    const importedNovel: Novel = { ...createResult.novel, chapters, updatedAt: now };
    const saveResult = await novelService.saveNovel(importedNovel);
    if (!saveResult.ok) {
      setFeedback(saveResult.message || '保存导入内容失败。');
      return;
    }
    setCurrentNovel(importedNovel);
    setActiveChapterId(null);
    setSaveStatus('saved');
    setProjectViewTab('overview');
    setFeedback('');
    setView('projectView');
    await loadSummaries();
    window.alert(parsed.splitByHeaders
      ? `导入成功，共识别 ${chapters.length} 章。`
      : '未识别到分章，已作为单章导入。');
  }

  function projectProgress(summary: NovelSummary): number {
    return summary.chapterCount ? Math.round((summary.filledChapterCount / summary.chapterCount) * 100) : 0;
  }

  function projectStatus(summary: NovelSummary): string {
    return summary.filledChapterCount > 0 ? '连载中' : '蓝图';
  }

  function selectProjectViewTab(tab: ProjectViewTab) {
    setProjectViewTab(tab);
    requestAnimationFrame(() => {
      if (projectPanelRef.current) projectPanelRef.current.scrollTop = 0;
    });
  }

  function openAnalyzeChapterPicker() {
    if (!currentNovel) return;
    const lastValidId = lastValidChapterRef.current.get(currentNovel.id);
    const selected = chapters.find((chapter) => chapter.id === lastValidId && chapterText(chapter).trim())
      ?? chapters.find((chapter) => chapterText(chapter).trim());
    setAnalyzeChapterId(selected?.id ?? null);
    setChapterPickerOpen(true);
  }

  function projectSummary(novel: Novel): string {
    return novel.blueprint?.trim() || novel.summary.trim() || novel.idea?.trim() || '';
  }

  // 人物关系图谱 V0：AI 从蓝图 + 正文推演，仅 session 态展示，不落库、不建模。可重新推演。
  async function deduceCharacterGraph() {
    if (!currentNovel || graphBusy) return;
    const readyModel = ensureTextModelReady(setGraphError);
    if (!readyModel) return;
    const requestId = createId('text-request');
    const runId = graphRunRef.current + 1;
    graphRunRef.current = runId;
    graphRequestIdRef.current = requestId;
    setGraphBusy(true);
    setGraphError('');
    const result = await rendererBridge.generateText({
      requestId,
      channelId: readyModel.channel.id,
      channelLabel: readyModel.channel.name,
      projectId: currentNovel.id,
      requestType: 'novel.characterGraph',
      baseUrl: readyModel.baseUrl,
      apiKey: readyModel.apiKey,
      model: readyModel.model,
      messages: buildCharacterGraphPrompt(currentNovel),
      temperature: 0.4,
      maxTokens: 1400,
    });
    if (graphRunRef.current !== runId) return;
    graphRequestIdRef.current = null;
    setGraphBusy(false);
    if (!result.ok || !result.text) {
      setGraphError(result.message || 'AI 推演失败，请稍后重试。');
      return;
    }
    const parsed = parseCharacterGraph(result.text, currentNovel);
    if (parsed.kind === 'invalid') {
      setGraphError('AI 返回的人物关系格式无法解析，请重新推演。');
      return;
    }
    if (parsed.kind === 'empty') {
      updateCharacterGraph({ characters: [], relationships: [] });
      setGraphError('');
      return;
    }
    updateCharacterGraph(parsed.graph);
  }

  function updateCharacterGraph(graph: CharacterGraph) {
    const now = new Date().toISOString();
    updateNovel((novel) => ({ ...novel, characterGraph: graph, updatedAt: now }));
  }

  function updateProjectField(field: 'blueprint' | 'summary' | 'idea', value: string) {
    updateNovel((novel) => ({ ...novel, [field]: value, updatedAt: new Date().toISOString() }));
  }

  function updateNovelWordTarget(value: string) {
    const raw = Number(value);
    const next = Number.isFinite(raw) && raw > 0 ? Math.round(raw) : undefined;
    updateNovel((novel) => ({ ...novel, wordTarget: next, updatedAt: new Date().toISOString() }));
  }

  function addSetting(draft: SettingDraft) {
    const now = new Date().toISOString();
    const entry: SettingEntry = { id: createId('setting'), type: draft.type, title: draft.title, body: draft.body, createdAt: now, updatedAt: now };
    updateNovel((novel) => ({ ...novel, settings: [...(novel.settings ?? []), entry], updatedAt: now }));
  }

  function editSetting(id: string, draft: SettingDraft) {
    const now = new Date().toISOString();
    updateNovel((novel) => ({
      ...novel,
      settings: (novel.settings ?? []).map((entry) => entry.id === id ? { ...entry, type: draft.type, title: draft.title, body: draft.body, updatedAt: now } : entry),
      updatedAt: now,
    }));
  }

  function deleteSetting(id: string) {
    const now = new Date().toISOString();
    updateNovel((novel) => ({ ...novel, settings: (novel.settings ?? []).filter((entry) => entry.id !== id), updatedAt: now }));
  }

  function togglePinnedSetting(id: string) {
    const now = new Date().toISOString();
    updateNovel((novel) => {
      const ids = novel.pinnedSettingIds ?? [];
      if (!ids.includes(id) && ids.length + (novel.pinnedForeshadowingIds?.length ?? 0) >= PINNED_CONTEXT_LIMIT) return novel;
      return { ...novel, pinnedSettingIds: ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id], updatedAt: now };
    });
  }

  function addForeshadowing(draft: ForeshadowingDraft) {
    const now = new Date().toISOString();
    const entry: Foreshadowing = {
      id: createId('foreshadow'),
      title: draft.title,
      plantedChapterId: draft.plantedChapterId,
      status: 'planted',
      payoffChapterId: draft.payoffChapterId || undefined,
      note: draft.note || undefined,
      createdAt: now,
      updatedAt: now,
    };
    updateNovel((novel) => ({ ...novel, foreshadowings: [...novel.foreshadowings, entry], updatedAt: now }));
  }

  function editForeshadowing(id: string, draft: ForeshadowingDraft) {
    const now = new Date().toISOString();
    updateNovel((novel) => ({
      ...novel,
      foreshadowings: novel.foreshadowings.map((entry) => entry.id === id ? {
        ...entry,
        title: draft.title,
        plantedChapterId: draft.plantedChapterId,
        payoffChapterId: draft.payoffChapterId || undefined,
        note: draft.note || undefined,
        updatedAt: now,
      } : entry),
      updatedAt: now,
    }));
  }

  function toggleForeshadowingStatus(id: string) {
    const now = new Date().toISOString();
    updateNovel((novel) => ({
      ...novel,
      foreshadowings: novel.foreshadowings.map((entry) => entry.id === id ? {
        ...entry,
        status: entry.status === 'planted' ? 'paidOff' : 'planted',
        updatedAt: now,
      } : entry),
      updatedAt: now,
    }));
  }

  function deleteForeshadowing(id: string) {
    const now = new Date().toISOString();
    updateNovel((novel) => ({ ...novel, foreshadowings: novel.foreshadowings.filter((entry) => entry.id !== id), updatedAt: now }));
  }

  function togglePinnedForeshadowing(id: string) {
    const now = new Date().toISOString();
    updateNovel((novel) => {
      const ids = novel.pinnedForeshadowingIds ?? [];
      if (!ids.includes(id) && ids.length + (novel.pinnedSettingIds?.length ?? 0) >= PINNED_CONTEXT_LIMIT) return novel;
      return { ...novel, pinnedForeshadowingIds: ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id], updatedAt: now };
    });
  }

  return (
    <main className={view === 'projectView' ? 'novel-creation novel-creation--flow novel-creation--project' : 'novel-creation novel-creation--flow'} aria-label="小说创作">
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
              <button className="novel-flow__primary" onClick={() => setView('projectList')} type="button">我的小说项目</button>
            </article>
          </div>
        </section>
      )}
      {view === 'projectList' && (
        <section className="novel-projects" aria-label="我的小说项目">
          <header className="novel-projects__head">
            <div>
              <p>Novel Studio</p>
              <h1>我的小说项目</h1>
            </div>
            <nav>
              <button className="novel-flow__primary novel-flow__primary--compact" onClick={startNewProject} type="button">新建</button>
              <button className="novel-flow__ghost" onClick={() => void handleImportManuscript()} type="button">导入</button>
              <button className="novel-flow__ghost" onClick={openCreationCenter} type="button">返回</button>
            </nav>
          </header>
          {feedback && <NovelErrorBanner message={feedback} onRetry={() => void loadSummaries()} />}
          {isLoading ? <NovelListSkeleton /> : summaries.length ? (
            <div className="novel-project-grid">
              {summaries.map((novel) => {
                const progress = projectProgress(novel);
                return (
                  <article className="novel-project-card" key={novel.id}>
                    <div className="novel-project-card__top">
                      <span>{projectStatus(novel)}</span>
                      <small>{formatTime(novel.updatedAt)}</small>
                    </div>
                    <h2>{novel.title}</h2>
                    <p>{novel.chapterCount} 章 · {novel.wordCount} 字</p>
                    <div className="novel-project-progress" aria-label={`完成度 ${progress}%`}><span style={{ width: `${progress}%` }} /></div>
                    <footer>
                      <span className="novel-project-card__actions">
                        <button className="novel-flow__ghost" onClick={() => void openProjectView(novel.id)} type="button">查看</button>
                        <button className="novel-flow__ghost novel-flow__ghost--danger" onClick={() => void deleteProject(novel)} type="button">删除</button>
                      </span>
                      <button className="novel-flow__primary novel-flow__primary--compact" onClick={() => void openProjectWorkbench(novel.id)} type="button">创作</button>
                    </footer>
                  </article>
                );
              })}
            </div>
          ) : <EmptyState title="暂无小说项目" text="创建一个新项目后，它会显示在这里。" />}
        </section>
      )}
      {view === 'projectView' && currentNovel && (
        <section className="novel-project-view" aria-label="项目查看">
          <header className="novel-project-view__bar">
            <div className="novel-project-view__title">
              <h1>{currentNovel.title}</h1>
              <span>最近更新 {formatTime(currentNovel.updatedAt)}</span>
            </div>
            <nav aria-label="项目操作">
              <button className="novel-project-view__action novel-project-view__action--back" onClick={() => {
                setExportMenuOpen(false);
                setView('projectList');
              }} type="button">
                <ArrowLeftIcon />
                <span>返回列表</span>
              </button>
              <button className="novel-project-view__action" onClick={() => {
                setForm({ title: currentNovel.title, summary: currentNovel.summary, note: currentNovel.note });
                setModalMode('edit');
              }} type="button"><span>编辑信息</span></button>
              <div className="novel-project-view__export">
                <button aria-expanded={exportMenuOpen} aria-haspopup="menu" className="novel-project-view__action" onClick={() => setExportMenuOpen((open) => !open)} type="button">
                  <span>导出作品</span>
                  <ChevronDownIcon />
                </button>
                {exportMenuOpen && (
                  <div className="novel-project-view__export-menu" onMouseLeave={() => setExportMenuOpen(false)} role="menu">
                    <button onClick={() => { setExportMenuOpen(false); void copyWholeBookMarkdown(currentNovel); }} role="menuitem" type="button">复制全书 Markdown</button>
                    <button onClick={() => { setExportMenuOpen(false); void exportWholeBookMarkdownFile(currentNovel); }} role="menuitem" type="button">导出 .md 文件</button>
                    <button onClick={() => { setExportMenuOpen(false); void exportStoryboardDocFile(currentNovel); }} role="menuitem" type="button">导出 Word 分镜本</button>
                    <button onClick={() => { setExportMenuOpen(false); void exportOfflinePackage(currentNovel); }} role="menuitem" type="button">导出离线包 ZIP</button>
                  </div>
                )}
              </div>
              <button className="novel-project-view__action novel-project-view__action--start" onClick={() => void openProjectWorkbench(currentNovel.id, activeChapterId ?? undefined)} type="button">
                <PenBookIcon />
                <span>开始创作</span>
              </button>
            </nav>
          </header>
          <div className="novel-project-view__body">
            <aside className="novel-project-nav">
              <div className="novel-project-nav__title">
                <span className="novel-project-nav__title-icon"><BookIcon /></span>
                <strong>蓝图导航</strong>
              </div>
              {PROJECT_VIEW_TABS.map((tab) => (
                <button aria-current={projectViewTab === tab.id ? 'page' : undefined} className={projectViewTab === tab.id ? 'novel-project-nav__item novel-project-nav__item--active' : 'novel-project-nav__item'} key={tab.id} onClick={() => selectProjectViewTab(tab.id)} type="button">
                  <span className="novel-project-nav__icon" aria-hidden="true"><tab.Icon /></span>
                  <span className="novel-project-nav__copy">
                    <strong>{tab.label}</strong>
                    <small>{tab.description}</small>
                  </span>
                </button>
              ))}
            </aside>
            <div className="novel-project-workspace">
              <section className="novel-project-panel novel-project-panel--animated" key={projectViewTab} ref={projectPanelRef}>
                {projectViewTab === 'overview' && (
                  <div className="novel-project-overview">
                    <div className="novel-project-panel__head">
                      <div className="novel-project-panel__heading"><h2>项目概览</h2><p>查看项目定位、创作进度与核心资料</p></div>
                    </div>
                    <ChapterSearchPanel novel={currentNovel} onSelect={(result) => void openSearchResult(result)} />
                    <section className="novel-overview__summary">
                      <div><strong>核心摘要</strong><span>快速了解项目的定位与主线</span></div>
                      <textarea aria-label="核心摘要" value={projectSummary(currentNovel)} onChange={(event) => updateProjectField('blueprint', event.target.value)} placeholder="写下这本小说的核心设定、主线冲突和整体梗概。" />
                    </section>
                    <NovelStats novel={currentNovel} />
                    <div className="novel-overview__fields">
                      <label>{PROGRESS_LABELS.novelTarget}<input type="number" min={0} step={1000} value={currentNovel.wordTarget ?? ''} onChange={(event) => updateNovelWordTarget(event.target.value)} placeholder={PROGRESS_LABELS.targetPlaceholder} /></label>
                      <label>项目简介<textarea value={currentNovel.summary} onChange={(event) => updateProjectField('summary', event.target.value)} placeholder="一句话介绍这本小说。" /></label>
                      <label>创意源<textarea value={currentNovel.idea ?? ''} onChange={(event) => updateProjectField('idea', event.target.value)} placeholder="最初的灵感、主题或想表达的情绪。" /></label>
                    </div>
                  </div>
                )}
                {projectViewTab === 'world' && (
                  <SettingPanel
                    settings={currentNovel.settings ?? []}
                    allowedTypes={WORLD_SETTING_TYPES}
                    title="世界设定"
                    description="维护规则、地点、组织、物品与专有术语"
                    emptyTitle="还没有世界设定"
                    emptyHint="新增地点、组织、物品或规则，建立可随时查阅的故事世界。"
                    onAdd={addSetting}
                    onEdit={editSetting}
                    onDelete={deleteSetting}
                    pinnedIds={currentNovel.pinnedSettingIds}
                    pinLimitReached={(currentNovel.pinnedSettingIds?.length ?? 0) + (currentNovel.pinnedForeshadowingIds?.length ?? 0) >= PINNED_CONTEXT_LIMIT}
                    onTogglePin={togglePinnedSetting}
                  />
                )}
                {projectViewTab === 'characters' && (
                  <SettingPanel
                    settings={currentNovel.settings ?? []}
                    allowedTypes={CHARACTER_SETTING_TYPES}
                    title="主要角色"
                    description="了解故事中核心人物的目标与个性"
                    emptyTitle="还没有主要角色"
                    emptyHint="新增角色，把身份、动机和人物要点记录下来。"
                    onAdd={addSetting}
                    onEdit={editSetting}
                    onDelete={deleteSetting}
                    pinnedIds={currentNovel.pinnedSettingIds}
                    pinLimitReached={(currentNovel.pinnedSettingIds?.length ?? 0) + (currentNovel.pinnedForeshadowingIds?.length ?? 0) >= PINNED_CONTEXT_LIMIT}
                    onTogglePin={togglePinnedSetting}
                  />
                )}
                {projectViewTab === 'graph' && (
                  <NovelCharacterGraphPanel graph={graphData} busy={graphBusy} error={graphError} onDeduce={() => void deduceCharacterGraph()} />
                )}
                {projectViewTab === 'outline' && (
                  <>
                    <div className="novel-project-panel__head">
                      <div className="novel-project-panel__heading"><h2>章节大纲</h2><p>按卷组织章节，梳理故事结构与创作进度</p></div>
                    </div>
                    <VolumeOutline novel={currentNovel} onAddChapter={addChapter} onDeleteChapter={deleteChapterById} onUpdateChapter={updateChapterById} onUpdateChapterAndSave={updateChapterByIdAndSave} onUpdateNovel={updateNovel} />
                  </>
                )}
                {projectViewTab === 'chapters' && (
                  <>
                    <div className="novel-project-panel__head">
                      <div className="novel-project-panel__heading"><h2>章节内容</h2><p>查看章节生成状态、摘要并进入现有工作台</p></div>
                      <button className="novel-flow__primary novel-flow__primary--compact" onClick={() => void openProjectWorkbench(currentNovel.id)} type="button">开始创作</button>
                    </div>
                    {chapters.length ? <div className="novel-content-groups">{groupChaptersByVolume(currentNovel).map((group) => group.chapters.length > 0 && (
                      <section className="novel-content-group" key={group.volume?.id ?? 'unassigned'}>
                        <header><strong>{group.volume?.title ?? '未分卷'}</strong><span>{group.chapters.length} 章</span></header>
                        <div className="novel-content-list">{group.chapters.map((chapter) => {
                          const index = chapters.findIndex((item) => item.id === chapter.id);
                          return (
                            <button className="novel-content-card" key={chapter.id} onClick={() => void openProjectWorkbench(currentNovel.id, chapter.id)} type="button">
                              <span className="novel-content-card__index">{index + 1}</span>
                              <span className="novel-content-card__copy">
                                <strong>{chapter.title || '未命名章节'}</strong>
                                <span>{countWords(chapterText(chapter))} 字 · {CHAPTER_STATUS_LABEL[resolveChapterStatus(chapter)]}</span>
                                <p>{chapter.outline?.trim() || '暂无章节大纲'}</p>
                                <small>{chapterText(chapter).trim() ? chapterText(chapter).trim().slice(0, 120) : '暂无正文'}</small>
                              </span>
                            </button>
                          );
                        })}</div>
                      </section>
                    ))}</div> : <EmptyState title="暂无章节内容" text="新增章节后，可以进入编辑器开始写正文。" />}
                  </>
                )}
                {projectViewTab === 'emotion' && (
                  <EmotionArcPanel novel={currentNovel} resolveModel={ensureTextModelReady} onUpdateNovel={updateNovel} />
                )}
                {projectViewTab === 'foreshadowing' && (
                  <ForeshadowingPanel
                    variant="embedded"
                    title="伏笔管理"
                    description="追踪故事线索的埋设、回收与章节引用"
                    showAiSuggestions={false}
                    foreshadowings={currentNovel.foreshadowings}
                    chapters={chapters}
                    onAdd={addForeshadowing}
                    onEdit={editForeshadowing}
                    onToggleStatus={toggleForeshadowingStatus}
                    onDelete={deleteForeshadowing}
                    pinnedIds={currentNovel.pinnedForeshadowingIds}
                    pinLimitReached={(currentNovel.pinnedSettingIds?.length ?? 0) + (currentNovel.pinnedForeshadowingIds?.length ?? 0) >= PINNED_CONTEXT_LIMIT}
                    onTogglePin={togglePinnedForeshadowing}
                    onAnalyzeChapter={openAnalyzeChapterPicker}
                    analyzeDisabled={!chapters.some((chapter) => chapterText(chapter).trim())}
                    analyzeDisabledHint="请先完成章节正文"
                  />
                )}
              </section>
            </div>
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
              <button className="novel-flow__ghost" onClick={closeInspirationFlow} type="button">关闭</button>
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
      {view === 'workbench' && currentNovel && (
        <ChapterWorkbench
          novel={currentNovel}
          projectId={projectId}
          chapters={chapters}
          activeChapterId={activeChapterId}
          locateRequest={pendingLocate}
          saveStatus={saveStatus}
          onSelectChapter={setActiveChapterId}
          onLocateConsumed={(requestId) => setPendingLocate((current) => current?.requestId === requestId ? null : current)}
          onUpdateChapter={updateChapterById}
          onUpdateChapterAndSave={updateChapterByIdAndSave}
          onUpdateNovel={updateNovel}
          onRetrySave={() => void saveCurrentNovel()}
          onBackToProjects={() => {
            setInitialForeshadowPanel(false);
            setWorkbenchReturnTab(null);
            setView('projectList');
          }}
          onOpenProjectView={() => {
            setProjectViewTab(workbenchReturnTab ?? 'overview');
            setWorkbenchReturnTab(null);
            setExportMenuOpen(false);
            setView('projectView');
          }}
          initialForeshadowPanel={initialForeshadowPanel}
          onConsumeInitialPanel={() => setInitialForeshadowPanel(false)}
          onValidChapter={(chapterId) => lastValidChapterRef.current.set(currentNovel.id, chapterId)}
          ensureTextModel={(onIssue) => {
            const ready = ensureTextModelReady(onIssue);
            return ready ? { channelId: ready.channel.id, channelLabel: ready.channel.name, baseUrl: ready.baseUrl, apiKey: ready.apiKey, model: ready.model } : null;
          }}
        />
      )}
      {chapterPickerOpen && currentNovel && (
        <div className="novel-modal" role="dialog" aria-modal="true" aria-label="选择要分析的章节" onClick={() => setChapterPickerOpen(false)}>
          <div className="novel-chapter-picker" onClick={(event) => event.stopPropagation()}>
            <h2>选择要分析的章节</h2>
            <p className="novel-workbench__preview-sub">伏笔 AI 会分析所选章节的正文，识别新埋线索与可回收伏笔。</p>
            <div className="novel-chapter-picker__list">
              {chapters.map((chapter, index) => {
                const empty = chapterText(chapter).trim() === '';
                return (
                  <label className={empty ? 'novel-chapter-picker__item novel-chapter-picker__item--disabled' : 'novel-chapter-picker__item'} key={chapter.id}>
                    <input checked={chapter.id === analyzeChapterId} disabled={empty} name="analyze-chapter" onChange={() => setAnalyzeChapterId(chapter.id)} type="radio" value={chapter.id} />
                    <span className="novel-chapter-picker__index">{index + 1}</span>
                    <span className="novel-chapter-picker__title">{chapter.title || '未命名章节'}</span>
                    <span className="novel-chapter-picker__meta">{countWords(chapterText(chapter))} 字 · {CHAPTER_STATUS_LABEL[resolveChapterStatus(chapter)]}{empty ? ' · 暂无正文' : ''}</span>
                  </label>
                );
              })}
            </div>
            <footer>
              <button className="novel-flow__ghost" onClick={() => setChapterPickerOpen(false)} type="button">取消</button>
              <button className="novel-flow__primary novel-flow__primary--compact" disabled={!analyzeChapterId} onClick={() => {
                if (!analyzeChapterId) return;
                setChapterPickerOpen(false);
                void openProjectWorkbench(currentNovel.id, analyzeChapterId, { foreshadowPanel: true, returnTab: 'foreshadowing' });
              }} type="button">进入工作台分析</button>
            </footer>
          </div>
        </div>
      )}
      {modalMode && <div className="novel-modal" role="dialog" aria-modal="true" aria-label={modalMode === 'create' ? '新建小说' : '编辑小说信息'} onClick={() => setModalMode(null)}><div onClick={(event) => event.stopPropagation()}><h2>{modalMode === 'create' ? '新建小说' : '编辑小说信息'}</h2><label>标题<input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} /></label><label>简介<textarea value={form.summary} onChange={(event) => setForm((current) => ({ ...current, summary: event.target.value }))} /></label><label>备注<input value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} /></label><footer><button onClick={() => setModalMode(null)} type="button">取消</button><button onClick={() => void submitNovelForm()} type="button">保存</button></footer></div></div>}
    </main>
  );
}

function EmptyState({ title, text }: { title: string; text?: string }) {
  return <div className="novel-empty"><strong>{title}</strong>{text && <span>{text}</span>}</div>;
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
