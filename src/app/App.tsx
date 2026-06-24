import { useEffect, useState } from 'react';
import type { CreationMode, ThemeMode } from '../types/workspace';
import { rendererBridge } from '../services/rendererBridge';
import { CreationWorkbench } from '../features/creation-workbench';
import './App.css';

const sidebarNavItems = [
  { id: 'projects', icon: '▦', label: '项目管理', active: true },
  { id: 'prompts', icon: '▤', label: '提示词库', active: false },
];

const assetItems = [
  { icon: '♙', label: '角色', count: 12 },
  { icon: '△', label: '场景', count: 8 },
  { icon: '▧', label: '剧本', count: 5 },
  { icon: '▥', label: '小说', count: 3 },
];

export function App() {
  const [theme, setTheme] = usePersistentTheme();
  const [activeMode, setActiveMode] = useState<CreationMode>('text');

  useEffect(() => {
    const shortcutModes: Record<string, CreationMode> = {
      '1': 'text',
      '2': 'image',
      '3': 'video',
      '4': 'library',
    };

    function handleKeyDown(event: KeyboardEvent) {
      if (!event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;

      const nextMode = shortcutModes[event.key];
      if (!nextMode) return;

      event.preventDefault();
      setActiveMode(nextMode);
    }

    globalThis.window.addEventListener('keydown', handleKeyDown);
    return () => globalThis.window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="app-shell" data-theme={theme}>
      <aside className="canvasflow-sidebar" aria-label="CanvasFlow 侧边栏">
        <header className="canvasflow-brand">
          <span className="canvasflow-brand__mark" aria-hidden="true">+</span>
          <span className="canvasflow-brand__name">CanvasFlow</span>
          <button className="canvasflow-collapse" aria-label="折叠侧边栏" type="button">▱</button>
        </header>

        <nav className="canvasflow-nav" aria-label="CanvasFlow 导航">
          {sidebarNavItems.map((item) => (
            <button
              aria-current={item.active ? 'page' : undefined}
              className={`canvasflow-nav__item ${item.active ? 'canvasflow-nav__item--active' : ''}`}
              key={item.id}
              type="button"
            >
              <span className="canvasflow-nav__icon" aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}

          <section className="canvasflow-nav__group" aria-label="资产管理">
            <button className="canvasflow-nav__item" type="button">
              <span className="canvasflow-nav__icon" aria-hidden="true">▱</span>
              <span>资产管理</span>
              <span className="canvasflow-nav__chevron" aria-hidden="true">⌄</span>
            </button>

            <div className="canvasflow-subnav">
              {assetItems.map((item) => (
                <button className="canvasflow-subnav__item" key={item.label} type="button">
                  <span className="canvasflow-nav__icon" aria-hidden="true">{item.icon}</span>
                  <span>{item.label}</span>
                  <span className="canvasflow-badge" aria-label={`${item.label} ${item.count} 个`}>{item.count}</span>
                </button>
              ))}
            </div>
          </section>
        </nav>

        <footer className="canvasflow-footer">
          <div className="canvasflow-footer__row">
            <span>主题</span>
            <button
              aria-pressed={theme === 'light'}
              className="canvasflow-theme-button"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              type="button"
            >
              ☀ 浅色
            </button>
          </div>
          <div className="canvasflow-footer__row canvasflow-footer__row--muted">
            <span>本地存储</span>
            <span>1.2 KB</span>
          </div>
          <div className="canvasflow-storage" aria-hidden="true"><span /></div>
        </footer>
      </aside>

      <section className="app-main" aria-label="Endless Creation 创作工作区">
        <header className="titlebar">
          <div className="brand" aria-label="应用标识">
            <span className="brand__mark">EC</span>
            <span className="brand__name">Endless Creation</span>
          </div>
          <div className="titlebar__center">
            <span>AI 创作平台</span>
            <small>Workspace Shell v0.2</small>
          </div>
          <div className="window-controls" aria-label="窗口控制">
            <button aria-label="最小化窗口" className="window-controls__dot" onClick={() => void rendererBridge.minimizeWindow()} type="button" />
            <button aria-label="最大化或还原窗口" className="window-controls__dot" onClick={() => void rendererBridge.maximizeWindow()} type="button" />
            <button aria-label="关闭窗口" className="window-controls__dot window-controls__dot--close" onClick={() => void rendererBridge.closeWindow()} type="button" />
          </div>
        </header>

        <CreationWorkbench mode={activeMode} />
      </section>
    </div>
  );
}

function usePersistentTheme(): [ThemeMode, (theme: ThemeMode) => void] {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    return rendererBridge.readTheme() ?? 'dark';
  });

  useEffect(() => {
    rendererBridge.writeTheme(theme);
    rendererBridge.applyTheme(theme);
  }, [theme]);

  return [theme, setThemeState];
}
