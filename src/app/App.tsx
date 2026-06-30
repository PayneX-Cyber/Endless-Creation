import { useEffect, useRef, useState } from 'react';
import type { ComponentType, SVGProps } from 'react';
import type { ThemeMode } from '../types/workspace';
import { rendererBridge } from '../services/rendererBridge';
import { AssetManagement } from '../features/asset-management';
import { ImageWorkbench } from '../features/image-workbench';
import { NovelCreation } from '../features/novel-creation';
import { ProjectManagement } from '../features/project-management';
import { CanvasWorkbench } from '../features/canvas-workbench';
import { SettingsPage } from '../features/settings';
import {
  AddSquareIcon,
  BillingIcon,
  ChevronDownIcon,
  CollapseIcon,
  FolderIcon,
  HelpIcon,
  HomeIcon,
  ImageWorkbenchIcon,
  LogoutIcon,
  MoonIcon,
  PenBookIcon,
  ProjectIcon,
  PromptIcon,
  ScriptIcon,
  SettingsIcon,
  SunIcon,
  UserIcon,
  VideoIcon,
} from './icons';
import './App.css';

type SidebarIcon = ComponentType<SVGProps<SVGSVGElement>>;
type ActiveNavId =
  | 'home'
  | 'projects'
  | 'novel'
  | 'script-workbench'
  | 'image-workbench'
  | 'video-workbench'
  | 'prompts'
  | 'assets';

type PrimaryNavId = ActiveNavId;

const sidebarNavItems: Array<{ id: PrimaryNavId; Icon: SidebarIcon; label: string }> = [
  { id: 'home', Icon: HomeIcon, label: '首页' },
  { id: 'projects', Icon: ProjectIcon, label: '项目管理' },
  { id: 'novel', Icon: PenBookIcon, label: '小说创作' },
  { id: 'script-workbench', Icon: ScriptIcon, label: '剧本工作台' },
  { id: 'image-workbench', Icon: ImageWorkbenchIcon, label: '生图工作台' },
  { id: 'video-workbench', Icon: VideoIcon, label: '视频工作台' },
  { id: 'prompts', Icon: PromptIcon, label: '提示词库' },
  { id: 'assets', Icon: FolderIcon, label: '资产管理' },
];


const mockUser = { name: 'John Doe', email: 'john@example.com', initials: 'JD' };

export function App() {
  const [theme, setTheme] = usePersistentTheme();
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeNavId, setActiveNavId] = useState<ActiveNavId>('home');
  const [activeCanvasId, setActiveCanvasId] = useState<string | null>(null);
  const [isUserMenuOpen, setUserMenuOpen] = useState(false);
  const [isSettingsOpen, setSettingsOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const ThemeIcon = theme === 'dark' ? SunIcon : MoonIcon;
  const isSidebarVisuallyCollapsed = isSidebarCollapsed;

  useEffect(() => {
    if (!isUserMenuOpen) return;

    function closeOnOutsideClick(event: MouseEvent) {
      if (!userMenuRef.current?.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, [isUserMenuOpen]);

  return (
    <div
      className={`app-shell ${isSidebarCollapsed ? 'app-shell--sidebar-collapsed' : ''}`}
      data-theme={theme}
    >
      <aside
        className={`canvasflow-sidebar ${isSidebarCollapsed ? 'canvasflow-sidebar--collapsed' : ''}`}
        aria-label="Endless Creation 侧边栏"
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
          {sidebarNavItems.map(({ Icon, ...item }) => {
            const isActive = activeNavId === item.id;

            return (
              <div className="canvasflow-nav__entry" key={item.id}>
                <button
                  aria-current={isActive ? 'page' : undefined}
                  aria-label={isSidebarVisuallyCollapsed ? item.label : undefined}
                  className={`canvasflow-nav__item ${isActive ? 'canvasflow-nav__item--active' : ''}`}
                  onClick={() => {
                    setActiveNavId(item.id);
                    if (item.id !== 'projects') setActiveCanvasId(null);
                  }}
                  type="button"
                >
                  <span className="canvasflow-nav__icon" aria-hidden="true"><Icon /></span>
                  <span className="canvasflow-nav__label">{item.label}</span>
                </button>
              </div>
            );
          })}
        </nav>

        <footer className="canvasflow-footer" ref={userMenuRef}>
          {isUserMenuOpen && (
            <div className="canvasflow-user-menu" role="menu" aria-label="用户菜单">
              <div className="canvasflow-user-menu__identity">
                <strong>{mockUser.name}</strong>
                <span>{mockUser.email}</span>
              </div>
              <div className="canvasflow-user-menu__divider" />
              <button className="canvasflow-user-menu__item" type="button" role="menuitem"><UserIcon />个人资料</button>
              <button
                className="canvasflow-user-menu__item"
                type="button"
                role="menuitem"
                onClick={() => {
                  setSettingsOpen(true);
                  setUserMenuOpen(false);
                }}
              >
                <SettingsIcon />设置
              </button>
              <button className="canvasflow-user-menu__item" type="button" role="menuitem"><BillingIcon />账单</button>
              <div className="canvasflow-user-menu__divider" />
              <button className="canvasflow-user-menu__item" type="button" role="menuitem"><HelpIcon />帮助与支持</button>
              <div className="canvasflow-user-menu__divider" />
              <button className="canvasflow-user-menu__item canvasflow-user-menu__item--danger" type="button" role="menuitem"><LogoutIcon />退出登录</button>
            </div>
          )}

          <div className="canvasflow-user-row">
            <button
              aria-expanded={isUserMenuOpen}
              aria-label={mockUser.name}
              className="canvasflow-user-button"
              onClick={() => setUserMenuOpen((current) => !current)}
              type="button"
            >
              <span className="canvasflow-user-avatar" aria-hidden="true">{mockUser.initials}</span>
              <span className="canvasflow-user-copy">
                <span className="canvasflow-user-name">{mockUser.name}</span>
              </span>
              <span className="canvasflow-user-chevron" aria-hidden="true"><ChevronDownIcon /></span>
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
            <button
              aria-label="固定展开侧边栏"
              title="固定展开侧边栏"
              className="canvasflow-pin-button"
              onClick={() => setSidebarCollapsed(false)}
              type="button"
            >
              <CollapseIcon />
            </button>
          </div>
        </footer>
      </aside>

      {activeNavId === 'image-workbench' ? (
        <ImageWorkbench />
      ) : activeNavId === 'novel' ? (
        <NovelCreation />
      ) : activeNavId === 'assets' || activeNavId.startsWith('asset-') ? (
        <AssetManagement />
      ) : activeNavId === 'projects' && activeCanvasId ? (
        <CanvasWorkbench canvasId={activeCanvasId} onBack={() => setActiveCanvasId(null)} keyboardDisabled={isSettingsOpen} />
      ) : activeNavId === 'projects' ? (
        <ProjectManagement onOpenCanvas={setActiveCanvasId} />
      ) : (
        <main className="blank-workspace" aria-label="空白工作区" />
      )}

      {isSettingsOpen && (
        <SettingsPage
          theme={theme}
          onThemeChange={setTheme}
          onClose={() => setSettingsOpen(false)}
        />
      )}
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
