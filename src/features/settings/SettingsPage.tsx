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

interface ModelPreferences {
  textModel: string;
  imageModel: string;
  videoModel: string;
  audioModel: string;
  availableModels: string[];
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

const settingsSections: Array<{ id: SettingsSectionId; label: string; description: string }> = [
  { id: 'appearance', label: '外观', description: '主题与界面显示偏好。' },
  { id: 'workspace', label: '工作区', description: '启动页与画布体验。' },
  { id: 'local', label: '本地创作', description: '草稿与本地项目偏好。' },
  { id: 'api', label: 'API配置', description: '渠道聚合、模型选择和同步偏好。' },
  { id: 'about', label: '关于', description: '版本、阶段与说明。' },
];

const apiConfigTabs: Array<{ id: ApiConfigTabId; label: string }> = [
  { id: 'channels', label: '渠道' },
  { id: 'models', label: '模型' },
  { id: 'preferences', label: '生成偏好' },
  { id: 'webdav', label: 'WebDAV' },
];

const defaultProviderConfig: ApiProviderConfig = {
  id: 'openai-compatible-default',
  label: 'OpenAI',
  type: 'openai-compatible',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  defaultModel: 'gpt-4o-mini',
  enabled: true,
  lastTestStatus: 'untested',
};

const defaultModelPreferences: ModelPreferences = {
  textModel: 'gpt-4o-mini',
  imageModel: 'gpt-image-1',
  videoModel: 'sora',
  audioModel: 'gpt-4o-mini-tts',
  availableModels: [],
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
  const [providerConfig, setProviderConfig] = useState<ApiProviderConfig>(() => readStorage(API_PROVIDER_STORAGE_KEY, defaultProviderConfig));
  const [modelPreferences, setModelPreferences] = useState<ModelPreferences>(() => readStorage(MODEL_PREFERENCES_STORAGE_KEY, defaultModelPreferences));
  const [generationPreferences, setGenerationPreferences] = useState<GenerationPreferences>(() => readStorage(GENERATION_PREFERENCES_STORAGE_KEY, defaultGenerationPreferences));
  const [workspacePreferences, setWorkspacePreferences] = useState<WorkspacePreferences>(() => readStorage(WORKSPACE_PREFERENCES_STORAGE_KEY, defaultWorkspacePreferences));
  const [localCreationPreferences, setLocalCreationPreferences] = useState<LocalCreationPreferences>(() => readStorage(LOCAL_CREATION_PREFERENCES_STORAGE_KEY, defaultLocalCreationPreferences));
  const [webdavConfig, setWebdavConfig] = useState<WebdavConfig>(() => readStorage(WEBDAV_CONFIG_STORAGE_KEY, defaultWebdavConfig));
  const [showApiKey, setShowApiKey] = useState(false);
  const [showWebdavPassword, setShowWebdavPassword] = useState(false);
  const [testResult, setTestResult] = useState<ApiConnectionTestResult | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const isTesting = providerConfig.lastTestStatus === 'testing';
  const activeSectionMeta = settingsSections.find((section) => section.id === activeSection) ?? settingsSections[0];
  const modelOptions = useMemo(() => uniqueModels([providerConfig.defaultModel, ...modelPreferences.availableModels]), [modelPreferences.availableModels, providerConfig.defaultModel]);

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(''), 1800);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }

    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  function updateProviderConfig(patch: Partial<ApiProviderConfig>) {
    setProviderConfig((current) => ({ ...current, ...patch }));
  }

  function saveProviderConfig(nextConfig = providerConfig, quiet = false) {
    writeStorage(API_PROVIDER_STORAGE_KEY, nextConfig);
    if (!quiet) setFeedback('渠道配置已保存。');
  }

  async function testConnection() {
    const testingConfig: ApiProviderConfig = { ...providerConfig, lastTestStatus: 'testing' };
    setProviderConfig(testingConfig);
    setTestResult({ ok: false, message: '正在测试连接…' });

    const result = await rendererBridge.testApiConnection(testingConfig);
    const nextProvider: ApiProviderConfig = {
      ...testingConfig,
      lastTestedAt: new Date().toLocaleString(),
      lastTestStatus: result.ok ? 'success' : 'failed',
    };
    const nextModels: ModelPreferences = result.models?.length
      ? { ...modelPreferences, availableModels: uniqueModels([...modelPreferences.availableModels, ...result.models]) }
      : modelPreferences;

    setProviderConfig(nextProvider);
    setModelPreferences(nextModels);
    setTestResult(result);
    writeStorage(API_PROVIDER_STORAGE_KEY, nextProvider);
    writeStorage(MODEL_PREFERENCES_STORAGE_KEY, nextModels);
  }

  function saveModelPreferences() {
    writeStorage(MODEL_PREFERENCES_STORAGE_KEY, modelPreferences);
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
              <h1 id="settings-title">{activeSectionMeta.label}</h1>
              <p className="settings-page__subtitle">{activeSectionMeta.description}</p>
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
                    <div className="settings-panel-toolbar">
                      <div>
                        <h2>渠道</h2>
                        <p>配置 OpenAI-compatible 接口并验证 API 可用性。</p>
                      </div>
                      <div className="settings-inline-actions">
                        <button className="settings-page__secondary" type="button" disabled={isTesting || !providerConfig.enabled} onClick={() => void testConnection()}>{isTesting ? '拉取中…' : '拉取全部'}</button>
                        <button className="settings-page__secondary" type="button" onClick={() => setFeedback('多渠道后续接入，当前先保留一个默认渠道。')}>新增渠道</button>
                      </div>
                    </div>

                    <article className="settings-card settings-card--api settings-channel-card">
                      <div className="settings-card__header">
                        <div>
                          <h2>{providerConfig.label || '未命名渠道'}</h2>
                          <p>{providerConfig.baseUrl || '未填写 Base URL'}</p>
                        </div>
                        <span className={providerConfig.enabled ? 'settings-card__badge settings-card__badge--success' : 'settings-card__badge settings-card__badge--untested'}>{providerConfig.enabled ? '已启用' : '未启用'}</span>
                      </div>

                      <div className="settings-channel-summary">
                        <span>API 格式：OpenAI-compatible</span>
                        <span>默认模型：{providerConfig.defaultModel || '未设置'}</span>
                        <span>测试状态：{statusTitle(providerConfig.lastTestStatus ?? 'untested')}</span>
                      </div>

                      <div className="settings-api-grid">
                        <label className="settings-field">
                          <span>渠道名称</span>
                          <input value={providerConfig.label} onChange={(event) => updateProviderConfig({ label: event.target.value })} placeholder="OpenAI" />
                        </label>
                        <label className="settings-field">
                          <span>API 格式</span>
                          <input value="OpenAI-compatible" readOnly />
                        </label>
                        <label className="settings-field settings-field--wide">
                          <span>Base URL</span>
                          <input value={providerConfig.baseUrl} onChange={(event) => updateProviderConfig({ baseUrl: event.target.value })} placeholder="https://api.openai.com/v1" />
                        </label>
                        <label className="settings-field settings-field--wide">
                          <span>API Key</span>
                          <span className="settings-secret-field">
                            <input value={providerConfig.apiKey} onChange={(event) => updateProviderConfig({ apiKey: event.target.value })} placeholder="sk-..." type={showApiKey ? 'text' : 'password'} />
                            <button type="button" onClick={() => setShowApiKey((current) => !current)}>{showApiKey ? '隐藏' : '显示'}</button>
                          </span>
                        </label>
                        <label className="settings-field settings-field--wide">
                          <span>默认模型</span>
                          <input value={providerConfig.defaultModel} onChange={(event) => updateProviderConfig({ defaultModel: event.target.value })} placeholder="gpt-4o-mini" />
                        </label>
                      </div>

                      <ToggleRow title="启用此渠道" description="关闭后，后续生成流程不会默认使用该配置。" checked={providerConfig.enabled} onChange={(enabled) => updateProviderConfig({ enabled })} />

                      <div className="settings-api-actions">
                        <button className="settings-page__primary" type="button" onClick={() => saveProviderConfig()}>保存配置</button>
                        <button className="settings-page__secondary" type="button" disabled={isTesting} onClick={() => void testConnection()}>{isTesting ? '测试中…' : '测试连接'}</button>
                        <button className="settings-page__secondary" type="button" onClick={() => setFeedback('至少保留一个渠道。')}>删除</button>
                      </div>

                      <div className={`settings-api-status settings-api-status--${providerConfig.lastTestStatus ?? 'untested'}`} role="status">
                        <strong>{statusTitle(providerConfig.lastTestStatus ?? 'untested')}</strong>
                        <span>{testResult?.message ?? statusDescription(providerConfig)}</span>
                        {modelPreferences.availableModels.length ? <em>模型示例：{modelPreferences.availableModels.slice(0, 6).join('、')}</em> : null}
                        <p className="settings-api-note">当前配置保存到本地开发存储，后续迁移到安全存储。不会在控制台打印 API Key。</p>
                      </div>
                    </article>
                  </section>
                )}

                {activeApiTab === 'models' && (
                  <section id="settings-api-panel-models" role="tabpanel" aria-labelledby="settings-api-tab-models" className="settings-panel">
                    <div className="settings-panel-toolbar">
                      <div>
                        <h2>模型</h2>
                        <p>为文本、生图、视频和音频流程设置默认模型。</p>
                      </div>
                      <button className="settings-page__primary" type="button" onClick={saveModelPreferences}>保存模型偏好</button>
                    </div>
                    <article className="settings-card">
                      <div className="settings-model-grid">
                        <ModelField label="默认文本模型" value={modelPreferences.textModel} options={modelOptions} onChange={(textModel) => setModelPreferences((current) => ({ ...current, textModel }))} />
                        <ModelField label="默认生图模型" value={modelPreferences.imageModel} options={modelOptions} onChange={(imageModel) => setModelPreferences((current) => ({ ...current, imageModel }))} />
                        <ModelField label="默认视频模型" value={modelPreferences.videoModel} options={modelOptions} onChange={(videoModel) => setModelPreferences((current) => ({ ...current, videoModel }))} />
                        <ModelField label="默认音频模型" value={modelPreferences.audioModel} options={modelOptions} onChange={(audioModel) => setModelPreferences((current) => ({ ...current, audioModel }))} />
                      </div>
                      <div className="settings-api-status">
                        <strong>可选模型列表</strong>
                        <span>{modelPreferences.availableModels.length ? modelPreferences.availableModels.join('、') : '暂无拉取结果，可直接手动输入模型名称。'}</span>
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
      <button className={checked ? 'settings-toggle settings-toggle--on' : 'settings-toggle'} type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}>
        <span aria-hidden="true" />
      </button>
    </div>
  );
}

interface ModelFieldProps {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}

function ModelField({ label, value, options, onChange }: ModelFieldProps) {
  const hasOptions = options.length > 0;
  return (
    <label className="settings-field">
      <span>{label}</span>
      {hasOptions ? (
        <input value={value} list={`${label}-models`} onChange={(event) => onChange(event.target.value)} placeholder="输入或选择模型" />
      ) : (
        <input value={value} onChange={(event) => onChange(event.target.value)} placeholder="手动输入模型名称" />
      )}
      {hasOptions ? (
        <datalist id={`${label}-models`}>
          {options.map((option) => <option value={option} key={option} />)}
        </datalist>
      ) : null}
    </label>
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

function statusTitle(status: NonNullable<ApiProviderConfig['lastTestStatus']>) {
  if (status === 'testing') return '测试中';
  if (status === 'success') return '测试成功';
  if (status === 'failed') return '测试失败';
  return '未配置';
}

function statusDescription(config: ApiProviderConfig) {
  if (config.lastTestStatus === 'success' && config.lastTestedAt) return `上次测试：${config.lastTestedAt}`;
  if (config.lastTestStatus === 'failed' && config.lastTestedAt) return `上次失败：${config.lastTestedAt}`;
  return '填写 Base URL 与 API Key 后，可以测试 /models 接口是否可用。';
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
