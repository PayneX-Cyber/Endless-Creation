import { useEffect, useState } from 'react';
import type { ThemeMode } from '../types/workspace';
import { rendererBridge } from '../services/rendererBridge';
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
              {theme === 'dark' ? '☀ 浅色' : '☾ 深色'}
            </button>
          </div>
          <div className="canvasflow-footer__row canvasflow-footer__row--muted">
            <span>本地存储</span>
            <span>1.2 KB</span>
          </div>
          <div className="canvasflow-storage" aria-hidden="true"><span /></div>
        </footer>
      </aside>

      <main className="blank-workspace" aria-label="空白工作区" />
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
