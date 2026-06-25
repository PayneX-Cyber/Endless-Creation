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
type ActiveNavId = 'projects' | 'prompts' | 'assets' | 'asset-role' | 'asset-scene' | 'asset-script' | 'asset-novel';

const sidebarNavItems: Array<{ id: ActiveNavId; Icon: SidebarIcon; label: string }> = [
  { id: 'projects', Icon: ProjectIcon, label: '项目管理' },
  { id: 'prompts', Icon: PromptIcon, label: '提示词库' },
];

const assetItems: Array<{ id: ActiveNavId; Icon: SidebarIcon; label: string; count: number }> = [
  { id: 'asset-role', Icon: UserIcon, label: '角色', count: 12 },
  { id: 'asset-scene', Icon: SceneIcon, label: '场景', count: 8 },
  { id: 'asset-script', Icon: ScriptIcon, label: '剧本', count: 5 },
  { id: 'asset-novel', Icon: BookIcon, label: '小说', count: 3 },
];

const mockUser = { name: '未登录用户', status: '点击登录' };

export function App() {
  const [theme, setTheme] = usePersistentTheme();
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isSidebarPreviewed, setSidebarPreviewed] = useState(false);
  const [activeNavId, setActiveNavId] = useState<ActiveNavId>('projects');
  const ThemeIcon = theme === 'dark' ? SunIcon : MoonIcon;
  const isSidebarVisuallyCollapsed = isSidebarCollapsed && !isSidebarPreviewed;

  return (
    <div
      className={`app-shell ${isSidebarCollapsed ? 'app-shell--sidebar-collapsed' : ''} ${isSidebarPreviewed ? 'app-shell--sidebar-previewed' : ''}`}
      data-theme={theme}
    >
      <aside
        className={`canvasflow-sidebar ${isSidebarCollapsed ? 'canvasflow-sidebar--collapsed' : ''} ${isSidebarPreviewed ? 'canvasflow-sidebar--previewed' : ''}`}
        aria-label="Endless Creation 侧边栏"
        onMouseEnter={() => {
          if (isSidebarCollapsed) setSidebarPreviewed(true);
        }}
        onMouseLeave={() => setSidebarPreviewed(false)}
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
            onClick={() => {
              setSidebarCollapsed((current) => !current);
              setSidebarPreviewed(false);
            }}
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

        <nav className="canvasflow-nav" aria-label="Endless Creation 导航">
          {sidebarNavItems.map(({ Icon, ...item }) => (
            <button
              aria-current={activeNavId === item.id ? 'page' : undefined}
              aria-label={isSidebarVisuallyCollapsed ? item.label : undefined}
              className={`canvasflow-nav__item ${activeNavId === item.id ? 'canvasflow-nav__item--active' : ''}`}
              key={item.id}
              onClick={() => setActiveNavId(item.id)}
              type="button"
            >
              <span className="canvasflow-nav__icon" aria-hidden="true"><Icon /></span>
              <span className="canvasflow-nav__label">{item.label}</span>
            </button>
          ))}

          <section className="canvasflow-nav__group" aria-label="资产管理">
            <button
              aria-current={activeNavId === 'assets' ? 'page' : undefined}
              aria-label={isSidebarVisuallyCollapsed ? '资产管理' : undefined}
              className={`canvasflow-nav__item ${activeNavId === 'assets' ? 'canvasflow-nav__item--active' : ''}`}
              onClick={() => setActiveNavId('assets')}
              type="button"
            >
              <span className="canvasflow-nav__icon" aria-hidden="true"><FolderIcon /></span>
              <span className="canvasflow-nav__label">资产管理</span>
              <span className="canvasflow-nav__chevron" aria-hidden="true"><ChevronDownIcon /></span>
            </button>

            <div className="canvasflow-subnav">
              {assetItems.map(({ Icon, ...item }) => (
                <button
                  aria-current={activeNavId === item.id ? 'page' : undefined}
                  aria-label={isSidebarVisuallyCollapsed ? item.label : undefined}
                  className={`canvasflow-subnav__item ${activeNavId === item.id ? 'canvasflow-subnav__item--active' : ''}`}
                  key={item.id}
                  onClick={() => setActiveNavId(item.id)}
                  type="button"
                >
                  <span className="canvasflow-nav__icon" aria-hidden="true"><Icon /></span>
                  <span className="canvasflow-nav__label">{item.label}</span>
                  <span className="canvasflow-badge" aria-label={`${item.label} ${item.count} 个`}>{item.count}</span>
                </button>
              ))}
            </div>
          </section>
        </nav>

        <footer className="canvasflow-footer">
          <div className="canvasflow-user-row">
            <button className="canvasflow-user-button" type="button" aria-label={`${mockUser.name}，${mockUser.status}`}>
              <span className="canvasflow-user-avatar" aria-hidden="true">
                <UserIcon />
              </span>
              <span className="canvasflow-user-copy">
                <span className="canvasflow-user-name">{mockUser.name}</span>
                <span className="canvasflow-user-status">{mockUser.status}</span>
              </span>
            </button>
            <button
              aria-label={theme === 'dark' ? '切换到浅色主题' : '切换到深色主题'}
              aria-pressed={theme === 'light'}
              className="canvasflow-theme-button"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              type="button"
            >
              <ThemeIcon />
            </button>
          </div>
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
