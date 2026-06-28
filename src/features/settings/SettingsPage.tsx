import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { rendererBridge } from '../../services/rendererBridge';
import type { ApiConnectionTestResult, ApiProviderConfig } from '../../types/apiProvider';
import type { ThemeMode } from '../../types/workspace';
import './SettingsPage.css';

interface SettingsPageProps {
  theme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
  onClose: () => void;
}

type SettingsSectionId = 'appearance' | 'workspace' | 'local' | 'api' | 'about';
type ApiConfigTabId = 'channels' | 'models' | 'preferences' | 'webdav';
type StartupPage = 'home' | 'projects' | 'last';
type ApiCallFormat = 'openai' | 'gemini';
type ModelCapability = 'image' | 'video' | 'text' | 'audio';
type ModelPreferenceDropdownId = `option:${ModelCapability}` | `default:${ModelCapability}`;

interface ModelChannel {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  apiFormat: ApiCallFormat;
  enabled: boolean;
  models: string[];
  extraHeaders: string;
  lastTestedAt?: string;
  lastTestStatus?: 'untested' | 'testing' | 'success' | 'failed';
}

interface ApiProviderStore {
  channels: ModelChannel[];
  activeChannelId: string;
}

interface ModelPreferences {
  textModel: string;
  imageModel: string;
  videoModel: string;
  audioModel: string;
  imageModels: string[];
  videoModels: string[];
  textModels: string[];
  audioModels: string[];
  availableModels: string[];
  modelOptionsInitialized: boolean;
}

interface ModelOption {
  value: string;
  model: string;
  label: string;
  channelName: string;
  capability: ModelCapability;
}

interface GenerationPreferences {
  imageQuality: 'auto' | 'low' | 'medium' | 'high';
  imageRatio: '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
  imageCount: '1' | '2' | '4';
  canvasImageCount: '1' | '2' | '3' | '4';
  videoSeconds: '5' | '6' | '8' | '10';
  videoQuality: '720' | '1080';
  audioFormat: 'mp3' | 'wav';
  audioSpeed: '0.8' | '1' | '1.2';
}

interface WorkspacePreferences {
  startupPage: StartupPage;
  compactCanvas: boolean;
}

interface LocalCreationPreferences {
  autoSave: boolean;
  defaultProjectDirectory: string;
}

interface WebdavConfig {
  enabled: boolean;
  url: string;
  username: string;
  password: string;
  directory: string;
  proxyMode: 'direct' | 'app-proxy';
  lastTestedAt?: string;
  lastStatus?: 'untested' | 'success' | 'failed';
}

export const API_PROVIDER_STORAGE_KEY = 'endless-creation.api-provider-config';
export const MODEL_PREFERENCES_STORAGE_KEY = 'endless-creation.model-preferences';
export const GENERATION_PREFERENCES_STORAGE_KEY = 'endless-creation.generation-preferences';
export const WEBDAV_CONFIG_STORAGE_KEY = 'endless-creation.webdav-config';
const WORKSPACE_PREFERENCES_STORAGE_KEY = 'endless-creation.workspace-preferences';
const LOCAL_CREATION_PREFERENCES_STORAGE_KEY = 'endless-creation.local-creation-preferences';

const OPENAI_BASE_URL = 'https://api.openai.com/v1';
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com';

const settingsSections: Array<{ id: SettingsSectionId; label: string; description: string }> = [
  { id: 'appearance', label: '外观', description: '主题与界面显示偏好。' },
  { id: 'workspace', label: '工作区', description: '启动页与画布体验。' },
  { id: 'local', label: '本地创作', description: '草稿与本地项目偏好。' },
  { id: 'api', label: 'API配置', description: '渠道聚合、模型选择和同步偏好。' },
  { id: 'about', label: '关于', description: '版本、阶段与说明。' },
];

const apiConfigTabs: Array<{ id: ApiConfigTabId; label: string }> = [
  { id: 'channels', label: '渠道' },
  { id: 'models', label: '模型偏好' },
  { id: 'preferences', label: '生成偏好' },
  { id: 'webdav', label: 'WebDAV' },
];

const defaultChannel: ModelChannel = {
  id: 'openai-default',
  name: 'OpenAI',
  baseUrl: OPENAI_BASE_URL,
  apiKey: '',
  apiFormat: 'openai',
  enabled: true,
  models: ['gpt-4o-mini'],
  extraHeaders: '',
  lastTestStatus: 'untested',
};

const defaultApiProviderStore: ApiProviderStore = {
  channels: [defaultChannel],
  activeChannelId: defaultChannel.id,
};

const defaultModelPreferences: ModelPreferences = {
  textModel: 'gpt-4o-mini',
  imageModel: 'gpt-image-1',
  videoModel: 'sora',
  audioModel: 'gpt-4o-mini-tts',
  imageModels: [],
  videoModels: [],
  textModels: [],
  audioModels: [],
  availableModels: [],
  modelOptionsInitialized: false,
};

const defaultGenerationPreferences: GenerationPreferences = {
  imageQuality: 'auto',
  imageRatio: '1:1',
  imageCount: '1',
  canvasImageCount: '3',
  videoSeconds: '6',
  videoQuality: '720',
  audioFormat: 'mp3',
  audioSpeed: '1',
};

const defaultWorkspacePreferences: WorkspacePreferences = {
  startupPage: 'home',
  compactCanvas: false,
};

const defaultLocalCreationPreferences: LocalCreationPreferences = {
  autoSave: true,
  defaultProjectDirectory: '本地项目目录（后续接入选择器）',
};

const defaultWebdavConfig: WebdavConfig = {
  enabled: false,
  url: '',
  username: '',
  password: '',
  directory: 'endless-creation',
  proxyMode: 'direct',
  lastStatus: 'untested',
};

export function SettingsPage({ theme, onThemeChange, onClose }: SettingsPageProps) {
  const [activeSection, setActiveSection] = useState<SettingsSectionId>('appearance');
  const [activeApiTab, setActiveApiTab] = useState<ApiConfigTabId>('channels');
  const [feedback, setFeedback] = useState('');
  const [apiStore, setApiStore] = useState<ApiProviderStore>(() => readApiProviderStore());
  const [editingChannelId, setEditingChannelId] = useState<string | null>(null);
  const [editingChannelDraft, setEditingChannelDraft] = useState<ModelChannel | null>(null);
  const [candidateModels, setCandidateModels] = useState<string[]>([]);
  const [modelPreferences, setModelPreferences] = useState<ModelPreferences>(() => readStorage(MODEL_PREFERENCES_STORAGE_KEY, defaultModelPreferences));
  const [generationPreferences, setGenerationPreferences] = useState<GenerationPreferences>(() => readStorage(GENERATION_PREFERENCES_STORAGE_KEY, defaultGenerationPreferences));
  const [workspacePreferences, setWorkspacePreferences] = useState<WorkspacePreferences>(() => readStorage(WORKSPACE_PREFERENCES_STORAGE_KEY, defaultWorkspacePreferences));
  const [localCreationPreferences, setLocalCreationPreferences] = useState<LocalCreationPreferences>(() => readStorage(LOCAL_CREATION_PREFERENCES_STORAGE_KEY, defaultLocalCreationPreferences));
  const [webdavConfig, setWebdavConfig] = useState<WebdavConfig>(() => readStorage(WEBDAV_CONFIG_STORAGE_KEY, defaultWebdavConfig));
  const [showApiKey, setShowApiKey] = useState(false);
  const [showWebdavPassword, setShowWebdavPassword] = useState(false);
  const [testResult, setTestResult] = useState<ApiConnectionTestResult | null>(null);
  const [openModelPreferenceDropdown, setOpenModelPreferenceDropdown] = useState<ModelPreferenceDropdownId | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const modelPreferencesDropdownRef = useRef<HTMLElement>(null);

  const activeSectionMeta = settingsSections.find((section) => section.id === activeSection) ?? settingsSections[0];
  const editingChannel = editingChannelDraft;
  const allModelOptions = useMemo(() => modelOptionsFromChannels(apiStore.channels), [apiStore.channels]);
  const imageModelValues = useMemo(() => selectedModelValues('image', modelPreferences.imageModels, allModelOptions, modelPreferences.availableModels, modelPreferences.modelOptionsInitialized), [allModelOptions, modelPreferences.availableModels, modelPreferences.imageModels, modelPreferences.modelOptionsInitialized]);
  const videoModelValues = useMemo(() => selectedModelValues('video', modelPreferences.videoModels, allModelOptions, modelPreferences.availableModels, modelPreferences.modelOptionsInitialized), [allModelOptions, modelPreferences.availableModels, modelPreferences.modelOptionsInitialized, modelPreferences.videoModels]);
  const textModelValues = useMemo(() => selectedModelValues('text', modelPreferences.textModels, allModelOptions, modelPreferences.availableModels, modelPreferences.modelOptionsInitialized), [allModelOptions, modelPreferences.availableModels, modelPreferences.modelOptionsInitialized, modelPreferences.textModels]);
  const audioModelValues = useMemo(() => selectedModelValues('audio', modelPreferences.audioModels, allModelOptions, modelPreferences.availableModels, modelPreferences.modelOptionsInitialized), [allModelOptions, modelPreferences.audioModels, modelPreferences.availableModels, modelPreferences.modelOptionsInitialized]);
  const isTesting = apiStore.channels.some((channel) => channel.lastTestStatus === 'testing');

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(''), 1800);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  useEffect(() => {
    if (!openModelPreferenceDropdown) return;

    function closeOnOutsideClick(event: MouseEvent) {
      if (!modelPreferencesDropdownRef.current?.contains(event.target as Node)) {
        setOpenModelPreferenceDropdown(null);
      }
    }

    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, [openModelPreferenceDropdown]);

  useEffect(() => {
    if (activeApiTab !== 'models') setOpenModelPreferenceDropdown(null);
  }, [activeApiTab]);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      if (editingChannelDraft) {
        closeChannelEditor();
        return;
      }
      onClose();
    }

    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [editingChannelDraft, onClose]);

  function persistApiStore(nextStore: ApiProviderStore, quiet = false) {
    const normalized = normalizeApiProviderStore(nextStore);
    setApiStore(normalized);
    writeStorage(API_PROVIDER_STORAGE_KEY, normalized);
    if (!quiet) setFeedback('渠道配置已保存。');
  }

  function updateChannel(channelId: string, patch: Partial<ModelChannel>) {
    const nextStore = {
      ...apiStore,
      channels: apiStore.channels.map((channel) => {
        if (channel.id !== channelId) return channel;
        const apiFormat = patch.apiFormat ?? channel.apiFormat;
        const shouldResetBaseUrl = patch.apiFormat && patch.apiFormat !== channel.apiFormat;
        return {
          ...channel,
          ...patch,
          apiFormat,
          baseUrl: shouldResetBaseUrl ? defaultBaseUrlForApiFormat(apiFormat) : patch.baseUrl ?? channel.baseUrl,
        };
      }),
    };
    setApiStore(nextStore);
  }

  function addChannel() {
    const nextChannel = createChannel({
      name: `渠道 ${apiStore.channels.length + 1}`,
      apiFormat: 'openai',
      models: [],
    });
    persistApiStore({
      channels: [...apiStore.channels, nextChannel],
      activeChannelId: nextChannel.id,
    }, true);
    openChannelEditor(nextChannel.id, nextChannel);
    setFeedback('已新增渠道，请补充 API Key 和模型。');
  }

  function deleteChannel(channelId: string) {
    if (apiStore.channels.length <= 1) {
      setFeedback('至少保留一个渠道。');
      return;
    }
    const channels = apiStore.channels.filter((channel) => channel.id !== channelId);
    const activeChannelId = apiStore.activeChannelId === channelId ? channels[0].id : apiStore.activeChannelId;
    persistApiStore({ channels, activeChannelId });
    if (editingChannelId === channelId) closeChannelEditor();
  }

  function openChannelEditor(channelId: string, fallback?: ModelChannel) {
    const channel = fallback ?? apiStore.channels.find((item) => item.id === channelId);
    if (!channel) return;
    setEditingChannelId(channelId);
    setEditingChannelDraft({ ...channel, models: [...channel.models] });
    setCandidateModels([...channel.models]);
    setShowApiKey(false);
  }

  function closeChannelEditor() {
    setEditingChannelId(null);
    setEditingChannelDraft(null);
    setCandidateModels([]);
    setShowApiKey(false);
  }

  function updateEditingChannelDraft(patch: Partial<ModelChannel>) {
    setEditingChannelDraft((current) => {
      if (!current) return current;
      const apiFormat = patch.apiFormat ?? current.apiFormat;
      const shouldResetBaseUrl = patch.apiFormat && patch.apiFormat !== current.apiFormat;
      return {
        ...current,
        ...patch,
        apiFormat,
        baseUrl: shouldResetBaseUrl ? defaultBaseUrlForApiFormat(apiFormat) : patch.baseUrl ?? current.baseUrl,
      };
    });
  }

  function saveEditingChannel() {
    if (!editingChannelDraft) return;
    const channelToSave = { ...editingChannelDraft, models: uniqueModels(editingChannelDraft.models) };
    const nextStore = {
      ...apiStore,
      activeChannelId: channelToSave.id,
      channels: apiStore.channels.map((channel) => channel.id === channelToSave.id ? channelToSave : channel),
    };
    syncModelPreferencesWithChannels(nextStore.channels);
    persistApiStore(nextStore);
    closeChannelEditor();
  }

  function syncModelPreferencesWithChannels(channels: ModelChannel[]) {
    const options = modelOptionsFromChannels(channels);
    const availableModels = uniqueModels([
      ...channels.flatMap((channel) => channel.models),
      ...options.map((option) => option.value),
      ...modelPreferences.availableModels,
      modelPreferences.imageModel,
      modelPreferences.videoModel,
      modelPreferences.textModel,
      modelPreferences.audioModel,
    ]);
    const nextPreferences = normalizeModelPreferencesForOptions({ ...modelPreferences, availableModels }, options);
    setModelPreferences(nextPreferences);
    writeStorage(MODEL_PREFERENCES_STORAGE_KEY, nextPreferences);
    return nextPreferences;
  }

  function toggleCandidateModel(model: string, checked: boolean) {
    setEditingChannelDraft((current) => {
      if (!current) return current;
      const models = checked
        ? uniqueModels([...current.models, model])
        : current.models.filter((item) => item !== model);
      return { ...current, models };
    });
  }

  function selectAllCandidateModels() {
    if (!editingChannelDraft) return;
    setEditingChannelDraft({ ...editingChannelDraft, models: uniqueModels(candidateModels) });
  }

  function clearSelectedModels() {
    if (!editingChannelDraft) return;
    setEditingChannelDraft({ ...editingChannelDraft, models: [] });
  }

  function updateManualModels(value: string) {
    const models = splitLines(value);
    setCandidateModels((current) => uniqueModels([...current, ...models]));
    updateEditingChannelDraft({ models });
  }

  async function testEditingChannel() {
    if (!editingChannelDraft) return;
    const nextStore = {
      ...apiStore,
      activeChannelId: editingChannelDraft.id,
      channels: apiStore.channels.map((channel) => channel.id === editingChannelDraft.id ? editingChannelDraft : channel),
    };
    persistApiStore(nextStore, true);

    if (editingChannelDraft.apiFormat === 'gemini') {
      const failedDraft = { ...editingChannelDraft, lastTestStatus: 'failed' as const, lastTestedAt: new Date().toLocaleString() };
      setEditingChannelDraft(failedDraft);
      persistApiStore({
        ...nextStore,
        channels: nextStore.channels.map((channel) => channel.id === failedDraft.id ? failedDraft : channel),
      }, true);
      setFeedback('Gemini 模型拉取后续完善。');
      return;
    }

    setEditingChannelDraft({ ...editingChannelDraft, lastTestStatus: 'testing' });
    setTestResult({ ok: false, message: '正在测试连接…' });
    const result = await rendererBridge.testApiConnection(channelToProviderConfig(editingChannelDraft));
    const testedDraft = {
      ...editingChannelDraft,
      models: result.models?.length ? uniqueModels([...editingChannelDraft.models, ...result.models]) : editingChannelDraft.models,
      lastTestedAt: new Date().toLocaleString(),
      lastTestStatus: result.ok ? 'success' as const : 'failed' as const,
    };
    if (result.models?.length) {
      setCandidateModels((current) => uniqueModels([...current, ...result.models!]));
    }
    const testedStore = {
      ...nextStore,
      channels: nextStore.channels.map((channel) => channel.id === testedDraft.id ? testedDraft : channel),
    };
    const testedOptions = modelOptionsFromChannels(testedStore.channels);
    const mergedModels = uniqueModels([
      ...modelPreferences.availableModels,
      ...testedDraft.models,
      ...testedOptions.map((option) => option.value),
    ]);
    setEditingChannelDraft(testedDraft);
    setTestResult(result);
    const nextPreferences = normalizeModelPreferencesForOptions({ ...modelPreferences, availableModels: mergedModels }, testedOptions);
    setModelPreferences(nextPreferences);
    persistApiStore(testedStore, true);
    writeStorage(MODEL_PREFERENCES_STORAGE_KEY, nextPreferences);
  }

  function saveModelPreferences() {
    const nextPreferences = normalizeModelPreferencesForOptions(modelPreferences, allModelOptions);
    setModelPreferences(nextPreferences);
    writeStorage(MODEL_PREFERENCES_STORAGE_KEY, nextPreferences);
    setFeedback('模型偏好已保存。');
  }

  function saveGenerationPreferences() {
    writeStorage(GENERATION_PREFERENCES_STORAGE_KEY, generationPreferences);
    setFeedback('生成偏好已保存。');
  }

  function saveWorkspacePreferences() {
    writeStorage(WORKSPACE_PREFERENCES_STORAGE_KEY, workspacePreferences);
    setFeedback('工作区偏好已保存。');
  }

  function saveLocalCreationPreferences() {
    writeStorage(LOCAL_CREATION_PREFERENCES_STORAGE_KEY, localCreationPreferences);
    setFeedback('本地创作偏好已保存。');
  }

  function saveWebdavConfig(nextConfig = webdavConfig, quiet = false) {
    writeStorage(WEBDAV_CONFIG_STORAGE_KEY, nextConfig);
    if (!quiet) setFeedback('WebDAV 配置已保存。');
  }

  function testWebdavConfig() {
    const nextConfig: WebdavConfig = {
      ...webdavConfig,
      lastTestedAt: new Date().toLocaleString(),
      lastStatus: webdavConfig.url.trim() ? 'success' : 'failed',
    };
    setWebdavConfig(nextConfig);
    saveWebdavConfig(nextConfig, true);
    setFeedback(webdavConfig.url.trim() ? 'WebDAV 配置已保存，真实连接后续接入。' : '请先填写 WebDAV 地址。');
  }

  async function testChannel(channelId: string) {
    const channel = apiStore.channels.find((item) => item.id === channelId);
    if (!channel) return;

    if (channel.apiFormat === 'gemini') {
      updateChannel(channelId, { lastTestStatus: 'failed', lastTestedAt: new Date().toLocaleString() });
      persistApiStore({
        ...apiStore,
        channels: apiStore.channels.map((item) => item.id === channelId ? { ...item, lastTestStatus: 'failed', lastTestedAt: new Date().toLocaleString() } : item),
      }, true);
      setFeedback('Gemini 模型拉取后续完善。');
      return;
    }

    const testingChannels = apiStore.channels.map((item) => item.id === channelId ? { ...item, lastTestStatus: 'testing' as const } : item);
    setApiStore({ ...apiStore, channels: testingChannels });
    setTestResult({ ok: false, message: '正在测试连接…' });

    const result = await rendererBridge.testApiConnection(channelToProviderConfig(channel));
    const nextModels = result.models?.length ? uniqueModels(result.models) : channel.models;
    const nextChannels = apiStore.channels.map((item) => item.id === channelId
      ? {
          ...item,
          models: nextModels,
          lastTestedAt: new Date().toLocaleString(),
          lastTestStatus: result.ok ? 'success' as const : 'failed' as const,
        }
      : item);
    const nextStore = { ...apiStore, channels: nextChannels, activeChannelId: channelId };
    const testedStore = { ...apiStore, channels: nextChannels, activeChannelId: channelId };
    const testedOptions = modelOptionsFromChannels(testedStore.channels);
    const mergedModels = uniqueModels([...modelPreferences.availableModels, ...nextModels, ...testedOptions.map((option) => option.value)]);
    const nextPreferences = normalizeModelPreferencesForOptions({ ...modelPreferences, availableModels: mergedModels }, testedOptions);

    setApiStore(testedStore);
    setModelPreferences(nextPreferences);
    setTestResult(result);
    writeStorage(API_PROVIDER_STORAGE_KEY, testedStore);
    writeStorage(MODEL_PREFERENCES_STORAGE_KEY, nextPreferences);
  }

  async function testAllChannels() {
    const enabled = apiStore.channels.filter((channel) => channel.enabled);
    if (!enabled.length) {
      setFeedback('请先启用至少一个渠道。');
      return;
    }
    for (const channel of enabled) {
      await testChannel(channel.id);
    }
  }

  function handleApiTabKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>, tabId: ApiConfigTabId) {
    const currentIndex = apiConfigTabs.findIndex((tab) => tab.id === tabId);
    if (currentIndex < 0) return;
    const nextIndex = event.key === 'ArrowRight'
      ? (currentIndex + 1) % apiConfigTabs.length
      : event.key === 'ArrowLeft'
        ? (currentIndex - 1 + apiConfigTabs.length) % apiConfigTabs.length
        : event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? apiConfigTabs.length - 1
            : -1;

    if (nextIndex < 0) return;
    event.preventDefault();
    const nextTab = apiConfigTabs[nextIndex].id;
    setActiveApiTab(nextTab);
    window.requestAnimationFrame(() => document.getElementById(`settings-api-tab-${nextTab}`)?.focus());
  }

  return (
    <div className="settings-modal" role="presentation" onMouseDown={onClose}>
      <section
        className="settings-modal__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button ref={closeButtonRef} className="settings-modal__close" type="button" aria-label="关闭设置" title="关闭设置" onClick={onClose}>
          <span aria-hidden="true">×</span>
        </button>

        <aside className="settings-modal__nav" aria-label="设置导航">
          <div className="settings-modal__brand">
            <p>设置</p>
            <span>Endless Creation</span>
          </div>
          <nav className="settings-nav-list">
            {settingsSections.map((section) => {
              const selected = activeSection === section.id;
              return (
                <button
                  key={section.id}
                  type="button"
                  className={selected ? 'settings-nav-item settings-nav-item--active' : 'settings-nav-item'}
                  aria-current={selected ? 'page' : undefined}
                  onClick={() => setActiveSection(section.id)}
                >
                  <span className="settings-nav-item__dot" aria-hidden="true" />
                  <span>{section.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        <main className="settings-modal__content">
          <header className="settings-content-header">
            <div>
              <p className="settings-page__eyebrow">本地偏好设置</p>
              <h1 id="settings-title">{activeSection === 'api' ? '配置与用户偏好' : activeSectionMeta.label}</h1>
              <p className="settings-page__subtitle">{activeSection === 'api' ? '渠道聚合、模型选择和同步偏好' : activeSectionMeta.description}</p>
            </div>
            {feedback ? <span className="settings-page__feedback" role="status">{feedback}</span> : null}
          </header>

          <section className="settings-content-scroll">
            {activeSection === 'appearance' && (
              <div className="settings-section">
                <article className="settings-card">
                  <div className="settings-card__header">
                    <div>
                      <h2>主题模式</h2>
                      <p>选择深色或浅色界面，立即应用到整个桌面端。</p>
                    </div>
                    <span className="settings-card__badge">{theme === 'dark' ? '深色模式' : '浅色模式'}</span>
                  </div>
                  <div className="settings-segmented" role="group" aria-label="主题模式">
                    <button className={theme === 'dark' ? 'settings-segmented__item settings-segmented__item--active' : 'settings-segmented__item'} type="button" onClick={() => onThemeChange('dark')}>深色模式</button>
                    <button className={theme === 'light' ? 'settings-segmented__item settings-segmented__item--active' : 'settings-segmented__item'} type="button" onClick={() => onThemeChange('light')}>浅色模式</button>
                  </div>
                </article>
              </div>
            )}

            {activeSection === 'workspace' && (
              <div className="settings-section">
                <article className="settings-card">
                  <div className="settings-card__header">
                    <div>
                      <h2>工作区偏好</h2>
                      <p>配置启动页和画布展示密度，当前为本地开发保存。</p>
                    </div>
                    <button className="settings-page__primary" type="button" onClick={saveWorkspacePreferences}>保存设置</button>
                  </div>
                  <SelectField
                    label="启动后打开"
                    value={workspacePreferences.startupPage}
                    options={['home', 'projects', 'last']}
                    optionLabels={{ home: '首页', projects: '项目管理', last: '上次工作区' }}
                    onChange={(startupPage) => setWorkspacePreferences((current) => ({ ...current, startupPage: startupPage as StartupPage }))}
                  />
                  <ToggleRow
                    title="画布紧凑模式"
                    description="减少画布节点和浮层间距，适合小屏或复杂画布。"
                    checked={workspacePreferences.compactCanvas}
                    onChange={(compactCanvas) => setWorkspacePreferences((current) => ({ ...current, compactCanvas }))}
                  />
                </article>
              </div>
            )}

            {activeSection === 'local' && (
              <div className="settings-section">
                <article className="settings-card">
                  <div className="settings-card__header">
                    <div>
                      <h2>本地创作</h2>
                      <p>管理草稿保存和默认项目目录占位。本阶段不接真实文件系统。</p>
                    </div>
                    <button className="settings-page__primary" type="button" onClick={saveLocalCreationPreferences}>保存设置</button>
                  </div>
                  <ToggleRow
                    title="自动保存草稿"
                    description="在本地开发存储中保存草稿状态，后续迁移到更安全的桌面端存储。"
                    checked={localCreationPreferences.autoSave}
                    onChange={(autoSave) => setLocalCreationPreferences((current) => ({ ...current, autoSave }))}
                  />
                  <div className="settings-path">
                    <span>默认项目目录</span>
                    <strong>{localCreationPreferences.defaultProjectDirectory}</strong>
                    <button type="button" onClick={() => setFeedback('目录选择后续接入。')}>更改</button>
                  </div>
                </article>
              </div>
            )}

            {activeSection === 'api' && (
              <div className="settings-section settings-section--api">
                <div className="settings-config-tabs" role="tablist" aria-label="API配置分类">
                  {apiConfigTabs.map((tab) => {
                    const selected = activeApiTab === tab.id;
                    return (
                      <button
                        id={`settings-api-tab-${tab.id}`}
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        aria-controls={`settings-api-panel-${tab.id}`}
                        tabIndex={selected ? 0 : -1}
                        className={selected ? 'settings-config-tab settings-config-tab--active' : 'settings-config-tab'}
                        onClick={() => setActiveApiTab(tab.id)}
                        onKeyDown={(event) => handleApiTabKeyDown(event, tab.id)}
                      >
                        {tab.label}
                      </button>
                    );
                  })}
                </div>

                {activeApiTab === 'channels' && (
                  <section id="settings-api-panel-channels" role="tabpanel" aria-labelledby="settings-api-tab-channels" className="settings-panel">
                    <div className="settings-channel-topbar">
                      <div className="settings-channel-notice">
                        <strong>重要：</strong>
                        <span>新增或拉取模型后，需要到“模型”Tab 选择可选项才会显示。</span>
                        <button type="button" onClick={() => setActiveApiTab('models')}>去模型设置</button>
                        <button type="button" onClick={() => setFeedback('已了解模型选择提示。')}>我知道了</button>
                      </div>
                      <div className="settings-inline-actions">
                        <button className="settings-page__secondary" type="button" disabled={isTesting} onClick={() => void testAllChannels()}>{isTesting ? '拉取中…' : '拉取全部'}</button>
                        <button className="settings-page__primary" type="button" onClick={addChannel}>+ 新增渠道</button>
                      </div>
                    </div>

                    <div className="settings-channel-grid">
                      {apiStore.channels.map((channel) => (
                        <article className={editingChannelId === channel.id ? 'settings-channel-tile settings-channel-tile--active' : 'settings-channel-tile'} key={channel.id}>
                          <div className="settings-channel-tile__head">
                            <div className="settings-channel-tile__title">
                              <span className={channel.enabled ? 'settings-channel-dot settings-channel-dot--on' : 'settings-channel-dot'} aria-hidden="true" />
                              <strong title={channel.name}>{channel.name || '未命名渠道'}</strong>
                              <em>· {apiFormatLabel(channel.apiFormat)}</em>
                            </div>
                            <ToggleSwitch checked={channel.enabled} label={channel.enabled ? '禁用渠道' : '启用渠道'} onChange={(enabled) => updateChannel(channel.id, { enabled })} />
                          </div>
                          <span className={channel.enabled ? 'settings-card__badge settings-card__badge--success' : 'settings-card__badge settings-card__badge--untested'}>{channel.enabled ? '已启用' : '未启用'}</span>
                          <div className="settings-channel-tile__body">
                            <div>
                              <span className="settings-channel-server-icon" aria-hidden="true">▦</span>
                              <span title={primaryModel(channel)}>{primaryModel(channel)}</span>
                              {channel.models.length > 1 ? <em>+{channel.models.length - 1}</em> : null}
                            </div>
                            <code title={channel.baseUrl}>{compactUrl(channel.baseUrl)}</code>
                          </div>
                          <div className="settings-channel-tile__actions">
                            <button type="button" title="拉取/测试" aria-label={`拉取或测试 ${channel.name}`} onClick={() => void testChannel(channel.id)}>↻</button>
                            <button type="button" title="编辑" aria-label={`编辑 ${channel.name}`} onClick={() => openChannelEditor(channel.id)}>✎</button>
                            <button type="button" title="删除" aria-label={`删除 ${channel.name}`} className="settings-channel-delete" onClick={() => deleteChannel(channel.id)}>⌫</button>
                          </div>
                        </article>
                      ))}
                    </div>

                  </section>
                )}

                {activeApiTab === 'models' && (
                  <section id="settings-api-panel-models" role="tabpanel" aria-labelledby="settings-api-tab-models" className="settings-panel">
                    <div className="settings-panel-toolbar">
                      <div>
                        <h2>模型偏好</h2>
                        <p>默认模型可从所有渠道已拉取的模型中选择，也可以手动输入。</p>
                      </div>
                      <button className="settings-page__primary" type="button" onClick={saveModelPreferences}>保存模型偏好</button>
                    </div>
                    <article className="settings-card" ref={modelPreferencesDropdownRef}>
                      <div className="settings-model-card-intro">
                        <h3>默认模型和可选项</h3>
                        <p>可选项决定各处下拉框展示哪些模型；同名模型会以括号里的渠道名区分。</p>
                      </div>
                      <div className="settings-model-option-grid">
                        <ModelOptionGroup title="生图模型可选项" values={imageModelValues} options={allModelOptions.filter((option) => option.capability === 'image')} isOpen={openModelPreferenceDropdown === 'option:image'} onOpenChange={(open) => setOpenModelPreferenceDropdown(open ? 'option:image' : null)} onChange={(imageModels) => setModelPreferences((current) => ({ ...current, imageModels, modelOptionsInitialized: true }))} />
                        <ModelOptionGroup title="视频模型可选项" values={videoModelValues} options={allModelOptions.filter((option) => option.capability === 'video')} isOpen={openModelPreferenceDropdown === 'option:video'} onOpenChange={(open) => setOpenModelPreferenceDropdown(open ? 'option:video' : null)} onChange={(videoModels) => setModelPreferences((current) => ({ ...current, videoModels, modelOptionsInitialized: true }))} />
                        <ModelOptionGroup title="文本模型可选项" values={textModelValues} options={allModelOptions.filter((option) => option.capability === 'text')} isOpen={openModelPreferenceDropdown === 'option:text'} onOpenChange={(open) => setOpenModelPreferenceDropdown(open ? 'option:text' : null)} onChange={(textModels) => setModelPreferences((current) => ({ ...current, textModels, modelOptionsInitialized: true }))} />
                        <ModelOptionGroup title="音频模型可选项" values={audioModelValues} options={allModelOptions.filter((option) => option.capability === 'audio')} isOpen={openModelPreferenceDropdown === 'option:audio'} onOpenChange={(open) => setOpenModelPreferenceDropdown(open ? 'option:audio' : null)} onChange={(audioModels) => setModelPreferences((current) => ({ ...current, audioModels, modelOptionsInitialized: true }))} />
                      </div>
                      <div className="settings-model-default-grid">
                        <ModelField label="默认生图模型" value={normalizeSingleModelValue(modelPreferences.imageModel, allModelOptions)} options={optionsByValues(imageModelValues, allModelOptions)} isOpen={openModelPreferenceDropdown === 'default:image'} onOpenChange={(open) => setOpenModelPreferenceDropdown(open ? 'default:image' : null)} onChange={(imageModel) => setModelPreferences((current) => ({ ...current, imageModel }))} />
                        <ModelField label="默认视频模型" value={normalizeSingleModelValue(modelPreferences.videoModel, allModelOptions)} options={optionsByValues(videoModelValues, allModelOptions)} isOpen={openModelPreferenceDropdown === 'default:video'} onOpenChange={(open) => setOpenModelPreferenceDropdown(open ? 'default:video' : null)} onChange={(videoModel) => setModelPreferences((current) => ({ ...current, videoModel }))} />
                        <ModelField label="默认文本模型" value={normalizeSingleModelValue(modelPreferences.textModel, allModelOptions)} options={optionsByValues(textModelValues, allModelOptions)} isOpen={openModelPreferenceDropdown === 'default:text'} onOpenChange={(open) => setOpenModelPreferenceDropdown(open ? 'default:text' : null)} onChange={(textModel) => setModelPreferences((current) => ({ ...current, textModel }))} />
                        <ModelField label="默认音频模型" value={normalizeSingleModelValue(modelPreferences.audioModel, allModelOptions)} options={optionsByValues(audioModelValues, allModelOptions)} isOpen={openModelPreferenceDropdown === 'default:audio'} onOpenChange={(open) => setOpenModelPreferenceDropdown(open ? 'default:audio' : null)} onChange={(audioModel) => setModelPreferences((current) => ({ ...current, audioModel }))} />
                      </div>
                      <div className="settings-api-status">
                        <strong>可选模型列表</strong>
                        <span>{allModelOptions.length ? allModelOptions.map((option) => option.label).join('、') : '暂无拉取结果，请先在渠道中获取模型，或手动输入模型名称。'}</span>
                      </div>
                    </article>
                  </section>
                )}

                {activeApiTab === 'preferences' && (
                  <section id="settings-api-panel-preferences" role="tabpanel" aria-labelledby="settings-api-tab-preferences" className="settings-panel">
                    <div className="settings-panel-toolbar">
                      <div>
                        <h2>生成偏好</h2>
                        <p>设置默认生成参数，供后续生图、视频、音频和画布节点复用。</p>
                      </div>
                      <button className="settings-page__primary" type="button" onClick={saveGenerationPreferences}>保存生成偏好</button>
                    </div>
                    <article className="settings-card">
                      <div className="settings-preference-grid">
                        <SelectField label="生图质量" value={generationPreferences.imageQuality} options={['auto', 'low', 'medium', 'high']} onChange={(imageQuality) => setGenerationPreferences((current) => ({ ...current, imageQuality: imageQuality as GenerationPreferences['imageQuality'] }))} />
                        <SelectField label="图片比例" value={generationPreferences.imageRatio} options={['1:1', '16:9', '9:16', '4:3', '3:4']} onChange={(imageRatio) => setGenerationPreferences((current) => ({ ...current, imageRatio: imageRatio as GenerationPreferences['imageRatio'] }))} />
                        <SelectField label="生成张数" value={generationPreferences.imageCount} options={['1', '2', '4']} onChange={(imageCount) => setGenerationPreferences((current) => ({ ...current, imageCount: imageCount as GenerationPreferences['imageCount'] }))} />
                        <SelectField label="画布节点默认生成数量" value={generationPreferences.canvasImageCount} options={['1', '2', '3', '4']} onChange={(canvasImageCount) => setGenerationPreferences((current) => ({ ...current, canvasImageCount: canvasImageCount as GenerationPreferences['canvasImageCount'] }))} />
                        <SelectField label="视频秒数" value={generationPreferences.videoSeconds} options={['5', '6', '8', '10']} onChange={(videoSeconds) => setGenerationPreferences((current) => ({ ...current, videoSeconds: videoSeconds as GenerationPreferences['videoSeconds'] }))} />
                        <SelectField label="视频质量" value={generationPreferences.videoQuality} options={['720', '1080']} onChange={(videoQuality) => setGenerationPreferences((current) => ({ ...current, videoQuality: videoQuality as GenerationPreferences['videoQuality'] }))} />
                        <SelectField label="音频格式" value={generationPreferences.audioFormat} options={['mp3', 'wav']} onChange={(audioFormat) => setGenerationPreferences((current) => ({ ...current, audioFormat: audioFormat as GenerationPreferences['audioFormat'] }))} />
                        <SelectField label="音频语速" value={generationPreferences.audioSpeed} options={['0.8', '1', '1.2']} onChange={(audioSpeed) => setGenerationPreferences((current) => ({ ...current, audioSpeed: audioSpeed as GenerationPreferences['audioSpeed'] }))} />
                      </div>
                    </article>
                  </section>
                )}

                {activeApiTab === 'webdav' && (
                  <section id="settings-api-panel-webdav" role="tabpanel" aria-labelledby="settings-api-tab-webdav" className="settings-panel">
                    <div className="settings-panel-toolbar">
                      <div>
                        <h2>WebDAV</h2>
                        <p>保存同步参数。本阶段只做本地配置和占位测试，不发起真实 WebDAV 请求。</p>
                      </div>
                      <button className="settings-page__primary" type="button" onClick={() => saveWebdavConfig()}>保存 WebDAV</button>
                    </div>
                    <article className="settings-card settings-card--api">
                      <ToggleRow title="启用 WebDAV 同步" description="开启后，后续版本可将项目数据同步到你的 WebDAV 服务。" checked={webdavConfig.enabled} onChange={(enabled) => setWebdavConfig((current) => ({ ...current, enabled }))} />
                      <div className="settings-api-grid">
                        <label className="settings-field settings-field--wide">
                          <span>WebDAV 地址</span>
                          <input value={webdavConfig.url} onChange={(event) => setWebdavConfig((current) => ({ ...current, url: event.target.value }))} placeholder="https://example.com/dav" />
                        </label>
                        <label className="settings-field">
                          <span>用户名</span>
                          <input value={webdavConfig.username} onChange={(event) => setWebdavConfig((current) => ({ ...current, username: event.target.value }))} placeholder="username" />
                        </label>
                        <label className="settings-field">
                          <span>密码</span>
                          <span className="settings-secret-field">
                            <input value={webdavConfig.password} onChange={(event) => setWebdavConfig((current) => ({ ...current, password: event.target.value }))} type={showWebdavPassword ? 'text' : 'password'} placeholder="••••••••" />
                            <button type="button" onClick={() => setShowWebdavPassword((current) => !current)}>{showWebdavPassword ? '隐藏' : '显示'}</button>
                          </span>
                        </label>
                        <label className="settings-field">
                          <span>目录</span>
                          <input value={webdavConfig.directory} onChange={(event) => setWebdavConfig((current) => ({ ...current, directory: event.target.value }))} placeholder="endless-creation" />
                        </label>
                        <SelectField label="代理模式" value={webdavConfig.proxyMode} options={['direct', 'app-proxy']} optionLabels={{ direct: 'direct', 'app-proxy': 'app-proxy' }} onChange={(proxyMode) => setWebdavConfig((current) => ({ ...current, proxyMode: proxyMode as WebdavConfig['proxyMode'] }))} />
                      </div>
                      <div className="settings-api-actions">
                        <button className="settings-page__secondary" type="button" onClick={testWebdavConfig}>测试连接</button>
                        <button className="settings-page__secondary" type="button" onClick={() => setFeedback('同步功能后续接入。')}>同步</button>
                      </div>
                      <div className={`settings-api-status settings-api-status--${webdavConfig.lastStatus ?? 'untested'}`} role="status">
                        <strong>{webdavConfig.lastStatus === 'success' ? '配置可用' : webdavConfig.lastStatus === 'failed' ? '配置不完整' : '未测试'}</strong>
                        <span>{webdavConfig.lastTestedAt ? `上次测试：${webdavConfig.lastTestedAt}` : '填写地址后可进行占位测试。'}</span>
                      </div>
                    </article>
                  </section>
                )}
              </div>
            )}

            {activeSection === 'about' && (
              <div className="settings-section">
                <article className="settings-card">
                  <div className="settings-card__header">
                    <div>
                      <h2>关于 Endless Creation</h2>
                      <p>当前处于桌面端 MVP 阶段，设置会优先保存在本地。</p>
                    </div>
                    <span className="settings-card__badge">MVP</span>
                  </div>
                  <div className="settings-about-list">
                    <div><span>版本</span><strong>0.1.0</strong></div>
                    <div><span>运行模式</span><strong>Electron + Vite + React</strong></div>
                    <div><span>数据说明</span><strong>本阶段不接账号、云同步和真实文件系统。</strong></div>
                  </div>
                </article>
              </div>
            )}
          </section>

          {editingChannel ? (
            <div className="settings-submodal" role="presentation" onMouseDown={closeChannelEditor}>
              <article
                className="settings-submodal__dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="settings-channel-editor-title"
                onMouseDown={(event) => event.stopPropagation()}
              >
                <button className="settings-submodal__close" type="button" aria-label="关闭编辑渠道" title="关闭编辑渠道" onClick={closeChannelEditor}>×</button>
                <div className="settings-card__header">
                  <div>
                    <h2 id="settings-channel-editor-title">编辑渠道</h2>
                    <p>支持 OpenAI-compatible 与 Gemini 格式。Gemini 模型拉取将在后续完善。</p>
                  </div>
                  <span className={`settings-card__badge settings-card__badge--${editingChannel.lastTestStatus ?? 'untested'}`}>{statusTitle(editingChannel.lastTestStatus ?? 'untested')}</span>
                </div>

                <div className="settings-submodal__body">
                  <div className="settings-api-grid">
                    <label className="settings-field">
                      <span>渠道名称</span>
                      <input value={editingChannel.name} onChange={(event) => updateEditingChannelDraft({ name: event.target.value })} placeholder="OpenAI" />
                    </label>
                    <SelectField
                      label="API 格式"
                      value={editingChannel.apiFormat}
                      options={['openai', 'gemini']}
                      optionLabels={{ openai: 'OpenAI', gemini: 'Gemini' }}
                      onChange={(apiFormat) => updateEditingChannelDraft({ apiFormat: apiFormat as ApiCallFormat })}
                    />
                    <label className="settings-field settings-field--wide">
                      <span>Base URL</span>
                      <input value={editingChannel.baseUrl} onChange={(event) => updateEditingChannelDraft({ baseUrl: event.target.value })} placeholder={defaultBaseUrlForApiFormat(editingChannel.apiFormat)} />
                    </label>
                    <label className="settings-field settings-field--wide">
                      <span>API Key</span>
                      <span className="settings-secret-field">
                        <input value={editingChannel.apiKey} onChange={(event) => updateEditingChannelDraft({ apiKey: event.target.value })} placeholder="sk-..." type={showApiKey ? 'text' : 'password'} />
                        <button type="button" onClick={() => setShowApiKey((current) => !current)}>{showApiKey ? '隐藏' : '显示'}</button>
                      </span>
                    </label>
                    <ToggleRow title="启用此渠道" description="关闭后，后续生成流程不会默认使用该配置。" checked={editingChannel.enabled} onChange={(enabled) => updateEditingChannelDraft({ enabled })} />
                    <div className="settings-field settings-field--wide">
                      <div className="settings-field__label-row">
                        <span>模型列表</span>
                        <span className="settings-field__actions">
                          <button className="settings-field__ghost-action" type="button" disabled={!candidateModels.length} onClick={selectAllCandidateModels}>全选</button>
                          <button className="settings-field__ghost-action" type="button" disabled={!candidateModels.length} onClick={clearSelectedModels}>清空</button>
                        </span>
                        <button
                          className="settings-field__action"
                          type="button"
                          disabled={editingChannel.lastTestStatus === 'testing'}
                          onClick={testEditingChannel}
                        >
                          {editingChannel.lastTestStatus === 'testing' ? '获取中…' : '获取模型'}
                        </button>
                      </div>
                      {candidateModels.length ? (
                        <div className="settings-model-candidates" role="group" aria-label="可选模型列表">
                          {candidateModels.map((model) => {
                            const checked = editingChannel.models.includes(model);
                            return (
                              <label className="settings-model-candidate" key={model}>
                                <input type="checkbox" checked={checked} onChange={(event) => toggleCandidateModel(model, event.target.checked)} />
                                <span title={model}>{model}</span>
                              </label>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="settings-empty-hint">暂无模型，请点击获取模型，或手动输入模型名称。</p>
                      )}
                      <details className="settings-manual-models">
                        <summary>手动添加模型（每行一个）</summary>
                        <textarea value={editingChannel.models.join('\n')} onChange={(event) => updateManualModels(event.target.value)} placeholder="每行一个模型，例如 gpt-4o-mini" />
                      </details>
                    </div>
                    <label className="settings-field settings-field--wide">
                      <span>额外 Headers（JSON，占位）</span>
                      <textarea value={editingChannel.extraHeaders} onChange={(event) => updateEditingChannelDraft({ extraHeaders: event.target.value })} placeholder='{"x-custom-header":"value"}' />
                    </label>
                  </div>

                  <div className={`settings-api-status settings-api-status--${editingChannel.lastTestStatus ?? 'untested'}`} role="status">
                    <strong>{statusTitle(editingChannel.lastTestStatus ?? 'untested')}</strong>
                    <span>{testResult?.message ?? statusDescription(editingChannel)}</span>
                    {editingChannel.models.length ? <em>模型示例：{editingChannel.models.slice(0, 6).join('、')}</em> : null}
                  </div>
                </div>

                <div className="settings-submodal__footer">
                  <button className="settings-page__secondary" type="button" onClick={closeChannelEditor}>取消</button>
                  <button className="settings-page__secondary" type="button" disabled={editingChannel.lastTestStatus === 'testing'} onClick={testEditingChannel}>{editingChannel.lastTestStatus === 'testing' ? '测试中…' : '测试连接'}</button>
                  <button className="settings-page__primary" type="button" onClick={saveEditingChannel}>保存</button>
                </div>
              </article>
            </div>
          ) : null}
        </main>
      </section>
    </div>
  );
}

interface ToggleRowProps {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function ToggleRow({ title, description, checked, onChange }: ToggleRowProps) {
  return (
    <div className="settings-toggle-row">
      <div>
        <strong>{title}</strong>
        <span>{description}</span>
      </div>
      <ToggleSwitch checked={checked} onChange={onChange} label={title} />
    </div>
  );
}

function ToggleSwitch({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return (
    <button className={checked ? 'settings-toggle settings-toggle--on' : 'settings-toggle'} type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}>
      <span aria-hidden="true" />
    </button>
  );
}

interface ModelFieldProps {
  label: string;
  value: string;
  options: ModelOption[];
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (value: string) => void;
}

function ModelField({ label, value, options, isOpen, onOpenChange, onChange }: ModelFieldProps) {
  const selectedOption = options.find((option) => option.value === value);
  const icon = selectedOption?.model.toLowerCase().includes('gpt') || value.toLowerCase().includes('gpt') ? '◎' : '▣';
  const selectedLabel = selectedOption?.label ?? (value.trim() ? `自定义：${value}` : '选择模型');
  const hasOptions = options.length > 0;

  return (
    <div className="settings-field settings-model-default-field">
      <span>{label}</span>
      <button
        className={isOpen ? 'settings-model-pill settings-model-pill--open' : 'settings-model-pill'}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={hasOptions && isOpen}
        disabled={!hasOptions}
        title={hasOptions ? undefined : '请先在上方配置可选模型'}
        onClick={() => {
          if (hasOptions) onOpenChange(!isOpen);
        }}
      >
        <span className="settings-model-pill__icon" aria-hidden="true">{icon}</span>
        <span className={value ? 'settings-model-pill__label' : 'settings-model-pill__label settings-model-pill__label--placeholder'}>{selectedLabel}</span>
        <span className="settings-model-pill__chevron" aria-hidden="true">⌄</span>
      </button>
      {isOpen && hasOptions ? (
        <div className="settings-model-default-dropdown" role="listbox" aria-label={label}>
          {options.map((option) => {
            const isSelected = option.value === value;
            const optionIcon = option.model.toLowerCase().includes('gpt') ? '◎' : '▣';
            return (
              <button
                className={isSelected ? 'settings-model-default-option settings-model-default-option--selected' : 'settings-model-default-option'}
                type="button"
                role="option"
                aria-selected={isSelected}
                key={option.value}
                onClick={() => {
                  onChange(option.value);
                  onOpenChange(false);
                }}
              >
                <span className="settings-model-default-option__icon" aria-hidden="true">{optionIcon}</span>
                <span className="settings-model-default-option__label">{option.label}</span>
                {isSelected ? <span className="settings-model-default-option__check" aria-hidden="true">✓</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

interface ModelOptionGroupProps {
  title: string;
  values: string[];
  options: ModelOption[];
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (values: string[]) => void;
}

function ModelOptionGroup({ title, values, options, isOpen, onOpenChange, onChange }: ModelOptionGroupProps) {
  const selected = values.filter((value) => options.some((option) => option.value === value));
  const selectedOptions = optionsByValues(selected, options);
  const visibleSelectedOptions = selectedOptions.slice(0, 2);
  const hiddenSelectedCount = Math.max(selectedOptions.length - visibleSelectedOptions.length, 0);

  function toggleOption(value: string, checked: boolean) {
    onChange(checked ? uniqueModels([...selected, value]) : selected.filter((item) => item !== value));
  }

  return (
    <section className="settings-model-option-group">
      <div className="settings-model-option-group__header">
        <strong>{title}</strong>
        <span>{selected.length}/{options.length}</span>
      </div>
      <button className={isOpen ? 'settings-model-select settings-model-select--open' : 'settings-model-select'} type="button" aria-expanded={isOpen} onClick={() => onOpenChange(!isOpen)}>
        <span className="settings-model-selected-tags">
          {selectedOptions.length ? visibleSelectedOptions.map((option) => (
            <span className="settings-model-tag" key={option.value} title={option.label}>
              <span>{option.label}</span>
              <em
                aria-hidden="true"
                onClick={(event) => {
                  event.stopPropagation();
                  toggleOption(option.value, false);
                }}
              >
                ×
              </em>
            </span>
          )) : <span className="settings-model-select__placeholder">请选择或输入模型可选项</span>}
          {hiddenSelectedCount > 0 ? <span className="settings-model-more-badge">+{hiddenSelectedCount}</span> : null}
        </span>
        <span className="settings-model-select__chevron" aria-hidden="true">⌄</span>
      </button>
      <div className={isOpen ? 'settings-model-option-dropdown settings-model-option-dropdown--open' : 'settings-model-option-dropdown'}>
        <div className="settings-model-option-actions">
          <button type="button" disabled={!options.length} onClick={() => onChange(options.map((option) => option.value))}>全选</button>
          <button type="button" disabled={!selected.length} onClick={() => onChange([])}>清空</button>
        </div>
        <div className="settings-model-option-list">
          {options.length ? options.map((option) => (
            <label key={option.value}>
              <input type="checkbox" checked={selected.includes(option.value)} onChange={(event) => toggleOption(option.value, event.target.checked)} />
              <span title={option.label}>{option.label}</span>
            </label>
          )) : <p>暂无模型，请先在渠道中获取模型。</p>}
        </div>
      </div>
    </section>
  );
}

interface SelectFieldProps {
  label: string;
  value: string;
  options: string[];
  optionLabels?: Record<string, string>;
  onChange: (value: string) => void;
}

function SelectField({ label, value, options, optionLabels, onChange }: SelectFieldProps) {
  return (
    <label className="settings-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option value={option} key={option}>{optionLabels?.[option] ?? option}</option>)}
      </select>
    </label>
  );
}

function createChannel(channel?: Partial<ModelChannel>): ModelChannel {
  const apiFormat = normalizeApiFormat(channel?.apiFormat);
  return {
    id: channel?.id?.trim() || `channel-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: channel?.name?.trim() || '新渠道',
    baseUrl: channel?.baseUrl?.trim() || defaultBaseUrlForApiFormat(apiFormat),
    apiKey: channel?.apiKey || '',
    apiFormat,
    enabled: channel?.enabled !== false,
    models: uniqueModels(channel?.models || []),
    extraHeaders: channel?.extraHeaders || '',
    lastTestedAt: channel?.lastTestedAt,
    lastTestStatus: channel?.lastTestStatus || 'untested',
  };
}

function normalizeApiProviderStore(value?: unknown): ApiProviderStore {
  const raw = value && typeof value === 'object' ? value as Partial<ApiProviderStore> & Partial<ApiProviderConfig> : {};
  let channels: ModelChannel[] = [];

  if (Array.isArray(raw.channels)) {
    channels = raw.channels.map((channel, index) => createChannel({
      ...channel,
      id: channel.id || (index === 0 ? 'openai-default' : `channel-${index + 1}`),
    }));
  } else if ('baseUrl' in raw || 'apiKey' in raw || 'defaultModel' in raw) {
    channels = [createChannel({
      id: raw.id || 'openai-default',
      name: raw.label || 'OpenAI',
      baseUrl: raw.baseUrl || OPENAI_BASE_URL,
      apiKey: raw.apiKey || '',
      apiFormat: 'openai',
      enabled: raw.enabled !== false,
      models: uniqueModels([raw.defaultModel || '', ...(Array.isArray((raw as { models?: string[] }).models) ? (raw as { models: string[] }).models : [])]),
      lastTestedAt: raw.lastTestedAt,
      lastTestStatus: raw.lastTestStatus || 'untested',
    })];
  }

  if (!channels.length) channels = [createChannel(defaultChannel)];
  const activeChannelId = raw.activeChannelId && channels.some((channel) => channel.id === raw.activeChannelId)
    ? raw.activeChannelId
    : channels[0].id;
  return { channels, activeChannelId };
}

function readApiProviderStore() {
  try {
    const stored = localStorage.getItem(API_PROVIDER_STORAGE_KEY);
    if (!stored) return defaultApiProviderStore;
    return normalizeApiProviderStore(JSON.parse(stored));
  } catch {
    return defaultApiProviderStore;
  }
}

function channelToProviderConfig(channel: ModelChannel): ApiProviderConfig {
  return {
    id: channel.id,
    label: channel.name,
    type: 'openai-compatible',
    baseUrl: channel.baseUrl,
    apiKey: channel.apiKey,
    defaultModel: channel.models[0] || 'gpt-4o-mini',
    enabled: channel.enabled,
    lastTestedAt: channel.lastTestedAt,
    lastTestStatus: channel.lastTestStatus,
  };
}

function statusTitle(status: NonNullable<ModelChannel['lastTestStatus']>) {
  if (status === 'testing') return '测试中';
  if (status === 'success') return '测试成功';
  if (status === 'failed') return '测试失败';
  return '未测试';
}

function statusDescription(channel: ModelChannel) {
  if (channel.apiFormat === 'gemini') return 'Gemini 模型拉取后续完善。';
  if (channel.lastTestStatus === 'success' && channel.lastTestedAt) return `上次测试：${channel.lastTestedAt}`;
  if (channel.lastTestStatus === 'failed' && channel.lastTestedAt) return `上次失败：${channel.lastTestedAt}`;
  return '填写 Base URL 与 API Key 后，可以测试 /models 接口是否可用。';
}

function apiFormatLabel(apiFormat: ApiCallFormat) {
  return apiFormat === 'gemini' ? 'Gemini' : 'OpenAI';
}

function normalizeApiFormat(apiFormat: unknown): ApiCallFormat {
  return apiFormat === 'gemini' ? 'gemini' : 'openai';
}

function defaultBaseUrlForApiFormat(apiFormat: ApiCallFormat) {
  return apiFormat === 'gemini' ? GEMINI_BASE_URL : OPENAI_BASE_URL;
}

function primaryModel(channel: ModelChannel) {
  return channel.models[0] || '未设置模型';
}

function compactUrl(value: string) {
  try {
    const url = new URL(value);
    return `${url.host}${url.pathname}`.replace(/\/$/, '');
  } catch {
    return value || '未填写 Base URL';
  }
}

function splitLines(value: string) {
  return uniqueModels(value.split(/\r?\n|,/));
}

function readStorage<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return fallback;
    return { ...fallback, ...JSON.parse(stored) } as T;
  } catch {
    return fallback;
  }
}

function writeStorage<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
}

function uniqueModels(models: string[]) {
  return Array.from(new Set(models.map((model) => model.trim()).filter(Boolean)));
}

function encodeChannelModel(channelId: string, model: string) {
  return `${channelId}::${model.trim()}`;
}

function decodeChannelModel(value: string) {
  const index = value.indexOf('::');
  if (index < 0) return null;
  return { channelId: value.slice(0, index), model: value.slice(index + 2) };
}

function modelOptionName(value: string) {
  return decodeChannelModel(value)?.model || value;
}

function modelOptionsFromChannels(channels: ModelChannel[]): ModelOption[] {
  return channels.flatMap((channel) => uniqueModels(channel.models).map((model) => ({
    value: encodeChannelModel(channel.id, model),
    model,
    label: `${model}（${channel.name || '未命名渠道'}）`,
    channelName: channel.name || '未命名渠道',
    capability: modelCapability(model),
  })));
}

function selectedModelValues(capability: ModelCapability, values: string[], options: ModelOption[], legacyModels: string[], initialized: boolean) {
  const normalized = normalizeModelValues(values, options);
  if (normalized.length || initialized) return normalized;

  const legacyMatched = normalizeModelValues(legacyModels.filter((model) => modelCapability(modelOptionName(model)) === capability), options);
  if (legacyMatched.length) return legacyMatched;

  return options.filter((option) => option.capability === capability).map((option) => option.value);
}

function optionsByValues(values: string[], options: ModelOption[]) {
  const valueSet = new Set(values);
  return options.filter((option) => valueSet.has(option.value));
}

function normalizeModelValues(values: string[], options: ModelOption[]) {
  return uniqueModels(values).map((value) => normalizeSingleModelValue(value, options)).filter(Boolean);
}

function normalizeSingleModelValue(value: string, options: ModelOption[]) {
  const model = value.trim();
  if (!model) return '';
  if (options.some((option) => option.value === model)) return model;
  const matched = options.find((option) => option.model === model);
  return matched?.value || model;
}

function normalizeModelPreferencesForOptions(preferences: ModelPreferences, options: ModelOption[]): ModelPreferences {
  return {
    ...preferences,
    imageModel: normalizeSingleModelValue(preferences.imageModel, options),
    videoModel: normalizeSingleModelValue(preferences.videoModel, options),
    textModel: normalizeSingleModelValue(preferences.textModel, options),
    audioModel: normalizeSingleModelValue(preferences.audioModel, options),
    imageModels: selectedModelValues('image', preferences.imageModels, options, preferences.availableModels, preferences.modelOptionsInitialized),
    videoModels: selectedModelValues('video', preferences.videoModels, options, preferences.availableModels, preferences.modelOptionsInitialized),
    textModels: selectedModelValues('text', preferences.textModels, options, preferences.availableModels, preferences.modelOptionsInitialized),
    audioModels: selectedModelValues('audio', preferences.audioModels, options, preferences.availableModels, preferences.modelOptionsInitialized),
    availableModels: uniqueModels([...preferences.availableModels, ...options.map((option) => option.value)]),
    modelOptionsInitialized: true,
  };
}

function modelCapability(model: string): ModelCapability {
  const value = model.toLowerCase();
  if (value.includes('audio') || value.includes('tts') || value.includes('speech') || value.includes('voice') || value.includes('music') || value.includes('sound')) return 'audio';
  if (value.includes('video') || value.includes('sora') || value.includes('veo') || value.includes('kling') || value.includes('wan') || value.includes('seedance')) return 'video';
  if (value.includes('image') || value.includes('img') || value.includes('dall-e') || value.includes('dalle') || value.includes('imagen') || value.includes('flux') || value.includes('seedream')) return 'image';
  return 'text';
}
