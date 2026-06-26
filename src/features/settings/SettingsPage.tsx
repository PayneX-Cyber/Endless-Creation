import { useEffect, useRef, useState } from 'react';
import type { ThemeMode } from '../../types/workspace';
import './SettingsPage.css';

interface SettingsPageProps {
  theme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
  onClose: () => void;
}

type StartupPage = 'home' | 'projects' | 'last';
type SettingsSectionId = 'appearance' | 'workspace' | 'local' | 'ai' | 'about';

const settingsSections: Array<{ id: SettingsSectionId; label: string; description: string }> = [
  { id: 'appearance', label: '外观', description: '主题与界面显示偏好。' },
  { id: 'workspace', label: '工作区', description: '启动页与画布体验。' },
  { id: 'local', label: '本地创作', description: '草稿与本地项目偏好。' },
  { id: 'ai', label: 'AI 与生成', description: 'Mock 生成能力与 provider 状态。' },
  { id: 'about', label: '关于', description: '版本、阶段与说明。' },
];

export function SettingsPage({ theme, onThemeChange, onClose }: SettingsPageProps) {
  const [activeSection, setActiveSection] = useState<SettingsSectionId>('appearance');
  const [autoSave, setAutoSave] = useState(true);
  const [compactCanvas, setCompactCanvas] = useState(false);
  const [startupPage, setStartupPage] = useState<StartupPage>('home');
  const [feedback, setFeedback] = useState('');
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const activeSectionMeta = settingsSections.find((section) => section.id === activeSection) ?? settingsSections[0];

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

  function mockSave() {
    setFeedback('设置已保存到本次会话');
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
              <button className="settings-page__primary" type="button" onClick={mockSave}>保存设置</button>
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
              <article className="settings-card">
                <div className="settings-card__header"><div><h2>AI 与生成</h2><p>第一版只展示配置入口，不读取 API Key，也不接真实 provider。</p></div><span className="settings-card__badge settings-card__badge--muted">Mock</span></div>
                <div className="settings-provider-list">
                  <div className="settings-provider"><span>生图工作台</span><strong>Mock Image Generator</strong><em>已使用本地模拟流程</em></div>
                  <div className="settings-provider"><span>画布工作区</span><strong>本地画布 Mock</strong><em>平移、缩放、节点与连线均为本地状态</em></div>
                </div>
              </article>
            )}

            {activeSection === 'about' && (
              <article className="settings-card">
                <div className="settings-card__header"><div><h2>关于 Endless Creation</h2><p>当前处于桌面端 MVP 阶段，优先验证本地创作工作流。</p></div><span className="settings-card__badge settings-card__badge--muted">MVP</span></div>
                <div className="settings-about-list">
                  <div><span>版本</span><strong>0.1.0 Mock Preview</strong></div>
                  <div><span>运行模式</span><strong>Electron + Vite + React</strong></div>
                  <div><span>数据说明</span><strong>当前不接真实 AI、不写入 API Key、不调用本地文件系统。</strong></div>
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
