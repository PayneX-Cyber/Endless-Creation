import { useEffect, useRef, useState } from 'react';
import type { ComponentType, SVGProps } from 'react';
import type { ThemeMode } from '../types/workspace';
import { rendererBridge } from '../services/rendererBridge';
import { ImageWorkbench } from '../features/image-workbench';
import { ProjectManagement } from '../features/project-management';
import { CanvasWorkbench } from '../features/canvas-workbench';
import {
  AddSquareIcon,
  BillingIcon,
  BookIcon,
  ChevronDownIcon,
  ChevronRightIcon,
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
  SceneIcon,
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
  | 'assets'
  | 'asset-role'
  | 'asset-scene'
  | 'asset-script'
  | 'asset-novel';

type PrimaryNavId = Exclude<ActiveNavId, 'asset-role' | 'asset-scene' | 'asset-script' | 'asset-novel'>;

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

const assetItems: Array<{ id: ActiveNavId; Icon: SidebarIcon; label: string; count: number }> = [
  { id: 'asset-role', Icon: UserIcon, label: '角色', count: 12 },
  { id: 'asset-scene', Icon: SceneIcon, label: '场景', count: 8 },
  { id: 'asset-script', Icon: ScriptIcon, label: '剧本', count: 5 },
  { id: 'asset-novel', Icon: BookIcon, label: '小说', count: 3 },
];

const mockUser = { name: 'John Doe', email: 'john@example.com', initials: 'JD' };

export function App() {
  const [theme, setTheme] = usePersistentTheme();
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeNavId, setActiveNavId] = useState<ActiveNavId>('home');
  const [activeCanvasId, setActiveCanvasId] = useState<string | null>(null);
  const [isAssetMenuExpanded, setAssetMenuExpanded] = useState(true);
  const [isUserMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const ThemeIcon = theme === 'dark' ? SunIcon : MoonIcon;
  const AssetChevronIcon = isAssetMenuExpanded ? ChevronDownIcon : ChevronRightIcon;
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

  useEffect(() => {
    if (isSidebarCollapsed) setUserMenuOpen(false);
  }, [isSidebarCollapsed]);

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
            const isAssetParent = item.id === 'assets';
            const isActive = activeNavId === item.id;

            return (
              <div className="canvasflow-nav__entry" key={item.id}>
                <button
                  aria-current={isActive ? 'page' : undefined}
                  aria-expanded={isAssetParent ? isAssetMenuExpanded : undefined}
                  aria-label={isSidebarVisuallyCollapsed ? item.label : undefined}
                  className={`canvasflow-nav__item ${isActive ? 'canvasflow-nav__item--active' : ''}`}
                  onClick={() => {
                    setActiveNavId(item.id);
                    if (item.id !== 'projects') setActiveCanvasId(null);
                    if (isAssetParent) {
                      setAssetMenuExpanded((current) => !current);
                    }
                  }}
                  type="button"
                >
                  <span className="canvasflow-nav__icon" aria-hidden="true"><Icon /></span>
                  <span className="canvasflow-nav__label">{item.label}</span>
                  {isAssetParent && (
                    <span className="canvasflow-nav__chevron" aria-hidden="true"><AssetChevronIcon /></span>
                  )}
                </button>

                {isAssetParent && isAssetMenuExpanded && (
                  <div className="canvasflow-subnav">
                    {assetItems.map(({ Icon: AssetIcon, ...assetItem }) => (
                      <button
                        aria-current={activeNavId === assetItem.id ? 'page' : undefined}
                        aria-label={isSidebarVisuallyCollapsed ? assetItem.label : undefined}
                        className={`canvasflow-subnav__item ${activeNavId === assetItem.id ? 'canvasflow-subnav__item--active' : ''}`}
                        key={assetItem.id}
                        onClick={() => {
                          setActiveNavId(assetItem.id);
                          setActiveCanvasId(null);
                          setAssetMenuExpanded(true);
                        }}
                        type="button"
                      >
                        <span className="canvasflow-nav__icon" aria-hidden="true"><AssetIcon /></span>
                        <span className="canvasflow-nav__label">{assetItem.label}</span>
                        <span className="canvasflow-badge" aria-label={`${assetItem.label} ${assetItem.count} 个`}>{assetItem.count}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <footer className="canvasflow-footer" ref={userMenuRef}>
          {isUserMenuOpen && !isSidebarCollapsed && (
            <div className="canvasflow-user-menu" role="menu" aria-label="User menu">
              <div className="canvasflow-user-menu__identity">
                <strong>{mockUser.name}</strong>
                <span>{mockUser.email}</span>
              </div>
              <div className="canvasflow-user-menu__divider" />
              <button className="canvasflow-user-menu__item" type="button" role="menuitem"><UserIcon />个人资料</button>
              <button className="canvasflow-user-menu__item" type="button" role="menuitem"><SettingsIcon />设置</button>
              <button className="canvasflow-user-menu__item" type="button" role="menuitem"><BillingIcon />账单</button>
              <div className="canvasflow-user-menu__divider" />
              <button className="canvasflow-user-menu__item" type="button" role="menuitem"><HelpIcon />帮助与支持</button>
              <div className="canvasflow-user-menu__divider" />
              <button className="canvasflow-user-menu__item canvasflow-user-menu__item--danger" type="button" role="menuitem"><LogoutIcon />退出登录</button>
            </div>
          )}

          <div className="canvasflow-user-row">
            <button
              aria-expanded={isSidebarCollapsed ? undefined : isUserMenuOpen}
              aria-label={mockUser.name}
              className="canvasflow-user-button"
              onClick={() => {
                if (isSidebarCollapsed) return;
                setUserMenuOpen((current) => !current);
              }}
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
      ) : activeNavId === 'projects' && activeCanvasId ? (
        <CanvasWorkbench canvasId={activeCanvasId} onBack={() => setActiveCanvasId(null)} />
      ) : activeNavId === 'projects' ? (
        <ProjectManagement onOpenCanvas={setActiveCanvasId} />
      ) : (
        <main className="blank-workspace" aria-label="空白工作区" />
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
