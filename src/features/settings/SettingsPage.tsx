import { useEffect, useRef, useState } from 'react';
import { rendererBridge } from '../../services/rendererBridge';
import type { ApiConnectionTestResult, ApiProviderConfig } from '../../types/apiProvider';
import type { ThemeMode } from '../../types/workspace';
import './SettingsPage.css';

interface SettingsPageProps {
  theme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
  onClose: () => void;
}

type StartupPage = 'home' | 'projects' | 'last';
type SettingsSectionId = 'appearance' | 'workspace' | 'local' | 'ai' | 'about';

export const API_PROVIDER_STORAGE_KEY = 'endless-creation.api-provider-config';

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

const settingsSections: Array<{ id: SettingsSectionId; label: string; description: string }> = [
  { id: 'appearance', label: '外观', description: '主题与界面显示偏好。' },
  { id: 'workspace', label: '工作区', description: '启动页与画布体验。' },
  { id: 'local', label: '本地创作', description: '草稿与本地项目偏好。' },
  { id: 'ai', label: 'API配置', description: '配置 OpenAI-compatible 接口并验证 API 可用性。' },
  { id: 'about', label: '关于', description: '版本、阶段与说明。' },
];

export function SettingsPage({ theme, onThemeChange, onClose }: SettingsPageProps) {
  const [activeSection, setActiveSection] = useState<SettingsSectionId>('appearance');
  const [autoSave, setAutoSave] = useState(true);
  const [compactCanvas, setCompactCanvas] = useState(false);
  const [startupPage, setStartupPage] = useState<StartupPage>('home');
  const [feedback, setFeedback] = useState('');
  const [providerConfig, setProviderConfig] = useState<ApiProviderConfig>(() => readProviderConfig());
  const [showApiKey, setShowApiKey] = useState(false);
  const [testResult, setTestResult] = useState<ApiConnectionTestResult | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const activeSectionMeta = settingsSections.find((section) => section.id === activeSection) ?? settingsSections[0];
  const isTesting = providerConfig.lastTestStatus === 'testing';

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

  function saveProviderConfig(nextConfig = providerConfig) {
    try {
      localStorage.setItem(API_PROVIDER_STORAGE_KEY, JSON.stringify(nextConfig));
      setFeedback('配置已保存到本地开发存储。');
    } catch {
      setFeedback('保存失败，请检查浏览器本地存储权限。');
    }
  }

  function saveSettings() {
    if (activeSection === 'ai') {
      saveProviderConfig();
      return;
    }

    setFeedback('设置已保存到本次会话。');
  }

  async function testConnection() {
    const testingConfig: ApiProviderConfig = {
      ...providerConfig,
      lastTestStatus: 'testing',
    };

    setProviderConfig(testingConfig);
    setTestResult({ ok: false, message: '正在测试连接…' });

    const result = await rendererBridge.testApiConnection(testingConfig);
    const testedConfig: ApiProviderConfig = {
      ...testingConfig,
      lastTestedAt: new Date().toLocaleString(),
      lastTestStatus: result.ok ? 'success' : 'failed',
    };

    setProviderConfig(testedConfig);
    setTestResult(result);
    saveProviderConfig(testedConfig);
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

        <aside className="settings-modal__nav" aria-label="设置分类">
          <div className="settings-modal__brand">
            <p>设置</p>
            <span>Endless Creation</span>
          </div>

          <nav className="settings-nav-list">
            {settingsSections.map((section) => (
              <button
                key={section.id}
                type="button"
                className={section.id === activeSection ? 'settings-nav-item settings-nav-item--active' : 'settings-nav-item'}
                aria-current={section.id === activeSection ? 'page' : undefined}
                onClick={() => setActiveSection(section.id)}
              >
                <span className="settings-nav-item__dot" aria-hidden="true" />
                <span>{section.label}</span>
              </button>
            ))}
          </nav>
        </aside>

        <main className="settings-modal__content">
          <header className="settings-content-header">
            <div>
              <p className="settings-page__eyebrow">本地偏好设置</p>
              <h1 id="settings-title">{activeSectionMeta.label}</h1>
              <p className="settings-page__subtitle">{activeSectionMeta.description}</p>
            </div>
            <div className="settings-page__actions">
              {feedback ? <span className="settings-page__feedback" role="status">{feedback}</span> : null}
              <button className="settings-page__primary" type="button" onClick={saveSettings}>保存设置</button>
            </div>
          </header>

          <section className="settings-content-scroll" aria-label={`${activeSectionMeta.label}设置内容`}>
            {activeSection === 'appearance' && (
              <article className="settings-card">
                <div className="settings-card__header">
                  <div>
                    <h2>主题模式</h2>
                    <p>选择应用主题，当前会立即生效。</p>
                  </div>
                  <span className="settings-card__badge">已启用</span>
                </div>

                <div className="settings-segmented" role="group" aria-label="主题模式">
                  <button className={theme === 'dark' ? 'settings-segmented__item settings-segmented__item--active' : 'settings-segmented__item'} type="button" aria-pressed={theme === 'dark'} onClick={() => onThemeChange('dark')}>深色模式</button>
                  <button className={theme === 'light' ? 'settings-segmented__item settings-segmented__item--active' : 'settings-segmented__item'} type="button" aria-pressed={theme === 'light'} onClick={() => onThemeChange('light')}>浅色模式</button>
                </div>
              </article>
            )}

            {activeSection === 'workspace' && (
              <article className="settings-card">
                <div className="settings-card__header"><div><h2>工作区偏好</h2><p>控制启动页和画布操作体验。</p></div></div>
                <label className="settings-field">
                  <span>启动后打开</span>
                  <select value={startupPage} onChange={(event) => setStartupPage(event.target.value as StartupPage)}>
                    <option value="home">首页</option>
                    <option value="projects">项目管理</option>
                    <option value="last">上次工作区</option>
                  </select>
                </label>
                <ToggleRow title="画布紧凑模式" description="降低工具栏和节点间距，适合小屏工作。" checked={compactCanvas} onChange={setCompactCanvas} />
              </article>
            )}

            {activeSection === 'local' && (
              <article className="settings-card">
                <div className="settings-card__header"><div><h2>本地创作</h2><p>当前仅保存 Mock 偏好，不接真实文件系统。</p></div></div>
                <ToggleRow title="自动保存草稿" description="编辑 Prompt、画布节点时显示自动保存状态。" checked={autoSave} onChange={setAutoSave} />
                <div className="settings-path" aria-label="本地项目目录">
                  <span>默认项目目录</span>
                  <strong>本地项目 / Endless Creation</strong>
                  <button type="button" onClick={() => setFeedback('本地目录选择后续接入')}>更改</button>
                </div>
              </article>
            )}

            {activeSection === 'ai' && (
              <article className="settings-card settings-card--api">
                <div className="settings-card__header">
                  <div>
                    <h2>API Provider 配置</h2>
                    <p>配置 OpenAI-compatible 接口，用于后续生图、视频、Agent 与提示词验证。</p>
                  </div>
                  <StatusBadge status={providerConfig.lastTestStatus ?? 'untested'} />
                </div>

                <div className="settings-api-grid">
                  <label className="settings-field">
                    <span>Provider 名称</span>
                    <input value={providerConfig.label} onChange={(event) => updateProviderConfig({ label: event.target.value })} placeholder="OpenAI" />
                  </label>
                  <label className="settings-field">
                    <span>默认模型</span>
                    <input value={providerConfig.defaultModel} onChange={(event) => updateProviderConfig({ defaultModel: event.target.value })} placeholder="gpt-4o-mini" />
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
                </div>

                <ToggleRow title="启用此 Provider" description="关闭后后续生成流程不会默认使用该配置。" checked={providerConfig.enabled} onChange={(enabled) => updateProviderConfig({ enabled })} />

                <div className="settings-api-actions">
                  <button className="settings-page__primary" type="button" onClick={() => saveProviderConfig()}>保存配置</button>
                  <button className="settings-page__secondary" type="button" disabled={isTesting} onClick={() => void testConnection()}>{isTesting ? '测试中…' : '测试连接'}</button>
                </div>

                <div className={`settings-api-status settings-api-status--${providerConfig.lastTestStatus ?? 'untested'}`} role="status">
                  <strong>{statusTitle(providerConfig.lastTestStatus ?? 'untested')}</strong>
                  <span>{testResult?.message ?? statusDescription(providerConfig)}</span>
                  {testResult?.models?.length ? <em>模型示例：{testResult.models.join('、')}</em> : null}
                </div>

                <p className="settings-api-note">当前配置保存在本地开发存储，后续会迁移到安全存储。不做账号、云同步或密钥加密。</p>
              </article>
            )}

            {activeSection === 'about' && (
              <article className="settings-card">
                <div className="settings-card__header"><div><h2>关于 Endless Creation</h2><p>当前处于桌面端 MVP 阶段，优先验证本地创作工作流。</p></div><span className="settings-card__badge settings-card__badge--muted">MVP</span></div>
                <div className="settings-about-list">
                  <div><span>版本</span><strong>0.1.0 Mock Preview</strong></div>
                  <div><span>运行模式</span><strong>Electron + Vite + React</strong></div>
                  <div><span>数据说明</span><strong>当前不接账号、不做云同步、不写入真实 API Key 到代码。</strong></div>
                </div>
              </article>
            )}
          </section>
        </main>
      </section>
    </div>
  );
}

function ToggleRow({ title, description, checked, onChange }: { title: string; description: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <div className="settings-toggle-row">
      <div>
        <strong>{title}</strong>
        <span>{description}</span>
      </div>
      <button className={checked ? 'settings-toggle settings-toggle--on' : 'settings-toggle'} type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}>
        <span />
      </button>
    </div>
  );
}

function StatusBadge({ status }: { status: NonNullable<ApiProviderConfig['lastTestStatus']> }) {
  return <span className={`settings-card__badge settings-card__badge--${status}`}>{statusTitle(status)}</span>;
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

function readProviderConfig(): ApiProviderConfig {
  try {
    const stored = localStorage.getItem(API_PROVIDER_STORAGE_KEY);
    if (!stored) return defaultProviderConfig;

    const parsed = JSON.parse(stored) as Partial<ApiProviderConfig>;
    return {
      ...defaultProviderConfig,
      ...parsed,
      type: 'openai-compatible',
      apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : '',
    };
  } catch {
    return defaultProviderConfig;
  }
}
