import { useEffect, useState } from 'react';
import type { ComponentType, SVGProps } from 'react';
import type { ThemeMode } from '../types/workspace';
import { rendererBridge } from '../services/rendererBridge';
import {
  AddSquareIcon,
  BookIcon,
  ChevronDownIcon,
  CollapseIcon,
  FolderIcon,
  MoonIcon,
  ProjectIcon,
  PromptIcon,
  SceneIcon,
  ScriptIcon,
  SunIcon,
  UserIcon,
} from './icons';
import './App.css';

type SidebarIcon = ComponentType<SVGProps<SVGSVGElement>>;

const sidebarNavItems: Array<{ id: string; Icon: SidebarIcon; label: string; active: boolean }> = [
  { id: 'projects', Icon: ProjectIcon, label: '项目管理', active: true },
  { id: 'prompts', Icon: PromptIcon, label: '提示词库', active: false },
];

const assetItems: Array<{ Icon: SidebarIcon; label: string; count: number }> = [
  { Icon: UserIcon, label: '角色', count: 12 },
  { Icon: SceneIcon, label: '场景', count: 8 },
  { Icon: ScriptIcon, label: '剧本', count: 5 },
  { Icon: BookIcon, label: '小说', count: 3 },
];

export function App() {
  const [theme, setTheme] = usePersistentTheme();
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);
  const ThemeIcon = theme === 'dark' ? SunIcon : MoonIcon;

  return (
    <div className={`app-shell ${isSidebarCollapsed ? 'app-shell--sidebar-collapsed' : ''}`} data-theme={theme}>
      <aside
        className={`canvasflow-sidebar ${isSidebarCollapsed ? 'canvasflow-sidebar--collapsed' : ''}`}
        aria-label="CanvasFlow 侧边栏"
      >
        <header className="canvasflow-brand">
          <span className="canvasflow-brand__mark" aria-hidden="true">
            <AddSquareIcon />
          </span>
          <span className="canvasflow-brand__name" aria-label="Endless Creation">
            <span>Endless</span>
            <span>Creation</span>
          </span>
          <button
            aria-expanded={!isSidebarCollapsed}
            className="canvasflow-collapse glass-icon-btn"
            aria-label={isSidebarCollapsed ? '展开侧边栏' : '折叠侧边栏'}
            onClick={() => setSidebarCollapsed((current) => !current)}
            type="button"
          >
            <span className="glass-icon-btn__back" aria-hidden="true" />
            <span className="glass-icon-btn__front">
              <span className="glass-icon-btn__icon" aria-hidden="true">
                <CollapseIcon />
              </span>
            </span>
          </button>
        </header>

        <nav className="canvasflow-nav" aria-label="CanvasFlow 导航">
          {sidebarNavItems.map(({ Icon, ...item }) => (
            <button
              aria-current={item.active ? 'page' : undefined}
              aria-label={isSidebarCollapsed ? item.label : undefined}
              className={`canvasflow-nav__item ${item.active ? 'canvasflow-nav__item--active' : ''}`}
              key={item.id}
              type="button"
            >
              <span className="canvasflow-nav__icon" aria-hidden="true"><Icon /></span>
              <span className="canvasflow-nav__label">{item.label}</span>
            </button>
          ))}

          <section className="canvasflow-nav__group" aria-label="资产管理">
            <button aria-label={isSidebarCollapsed ? '资产管理' : undefined} className="canvasflow-nav__item" type="button">
              <span className="canvasflow-nav__icon" aria-hidden="true"><FolderIcon /></span>
              <span className="canvasflow-nav__label">资产管理</span>
              <span className="canvasflow-nav__chevron" aria-hidden="true"><ChevronDownIcon /></span>
            </button>

            <div className="canvasflow-subnav">
              {assetItems.map(({ Icon, ...item }) => (
                <button className="canvasflow-subnav__item" key={item.label} type="button">
                  <span className="canvasflow-nav__icon" aria-hidden="true"><Icon /></span>
                  <span className="canvasflow-nav__label">{item.label}</span>
                  <span className="canvasflow-badge" aria-label={`${item.label} ${item.count} 个`}>{item.count}</span>
                </button>
              ))}
            </div>
          </section>
        </nav>

        <footer className="canvasflow-footer">
          <div className="canvasflow-footer__row">
            <span className="canvasflow-footer__label">主题</span>
            <button
              aria-pressed={theme === 'light'}
              className="canvasflow-theme-button"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              type="button"
            >
              <ThemeIcon />
              <span className="canvasflow-theme-button__label">{theme === 'dark' ? '浅色' : '深色'}</span>
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
