import { useEffect, useRef, useState } from 'react';
import type { ComponentType, SVGProps } from 'react';
import type { ThemeMode } from '../types/workspace';
import { rendererBridge } from '../services/rendererBridge';
import appLogoUrl from '../assets/endless-creation-logo.png';
import { AssetManagement } from '../features/asset-management';
import { ImageWorkbench } from '../features/image-workbench';
import { NovelCreation } from '../features/novel-creation';
import { ScriptWorkbench } from '../features/script-workbench';
import { CanvasLibrary, CanvasWorkbench } from '../features/canvas-workbench';
import { SettingsPage } from '../features/settings';
import {
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
import {
  mockProjects,
  getProjectById,
  promoteRecentProject,
  DEFAULT_ACTIVE_PROJECT_ID,
  INITIAL_RECENT_PROJECT_IDS,
} from './projectShellData';
import { ProjectCenterModal } from './ProjectCenterModal';
import './App.css';

type SidebarIcon = ComponentType<SVGProps<SVGSVGElement>>;
type ActiveNavId =
  | 'home'
  | 'canvas'
  | 'novel'
  | 'script-workbench'
  | 'image-workbench'
  | 'video-workbench'
  | 'prompts'
  | 'assets';

type PrimaryNavId = ActiveNavId;

const sidebarNavItems: Array<{ id: PrimaryNavId; Icon: SidebarIcon; label: string }> = [
  { id: 'home', Icon: HomeIcon, label: '首页' },
  { id: 'canvas', Icon: ProjectIcon, label: '无限画布' },
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
  const [activeCanvasIdsByProject, setActiveCanvasIdsByProject] = useState<Record<string, string>>({});
  const [isUserMenuOpen, setUserMenuOpen] = useState(false);
  const [isSettingsOpen, setSettingsOpen] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(DEFAULT_ACTIVE_PROJECT_ID);
  const [recentProjectIds, setRecentProjectIds] = useState<string[]>(INITIAL_RECENT_PROJECT_IDS);
  const [isProjectMenuOpen, setProjectMenuOpen] = useState(false);
  const [isProjectCenterOpen, setProjectCenterOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const projectMenuRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    if (!isProjectMenuOpen) return;

    function closeOnOutsideClick(event: MouseEvent) {
      if (!projectMenuRef.current?.contains(event.target as Node)) {
        setProjectMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, [isProjectMenuOpen]);

  function switchProject(projectId: string) {
    setActiveProjectId(projectId);
    setRecentProjectIds((ids) => promoteRecentProject(ids, projectId));
  }

  function enterWorkbench(projectId: string, navId: ActiveNavId) {
    switchProject(projectId);
    setProjectCenterOpen(false);
    setProjectMenuOpen(false);
    if (navId === 'canvas') setActiveCanvasIdsByProject((ids) => ({ ...ids, [projectId]: ids[projectId] ?? 'canvas-2' }));
    setActiveNavId(navId);
  }

  function openCanvas(canvasId: string) {
    const projectId = activeProjectId ?? 'default';
    setActiveCanvasIdsByProject((ids) => ({ ...ids, [projectId]: canvasId }));
  }

  function closeCanvas() {
    const projectId = activeProjectId ?? 'default';
    setActiveCanvasIdsByProject((ids) => {
      const { [projectId]: _current, ...rest } = ids;
      return rest;
    });
  }

  const activeProject = getProjectById(activeProjectId);
  const activeCanvasId = activeProjectId ? activeCanvasIdsByProject[activeProjectId] ?? null : null;
  const recentProjects = recentProjectIds
    .map((id) => getProjectById(id))
    .filter((project): project is NonNullable<typeof project> => Boolean(project));

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
            <img src={appLogoUrl} alt="" />
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
                    if (item.id === 'canvas' && !activeProjectId) {
                      setProjectCenterOpen(true);
                      return;
                    }
                    setActiveNavId(item.id);
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

          <div className="canvasflow-project-switch" ref={projectMenuRef}>
            {isProjectMenuOpen && (
              <div className="canvasflow-project-menu" role="menu" aria-label="最近项目">
                {recentProjects.map((project) => {
                  const isActive = project.id === activeProjectId;
                  return (
                    <button
                      className={`canvasflow-project-menu__item ${isActive ? 'canvasflow-project-menu__item--active' : ''}`}
                      key={project.id}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        switchProject(project.id);
                        setProjectMenuOpen(false);
                      }}
                    >
                      <span className="canvasflow-project-menu__check" aria-hidden="true">{isActive ? '✓' : ''}</span>
                      <span className="canvasflow-project-menu__name">{project.name}</span>
                    </button>
                  );
                })}
                <div className="canvasflow-project-menu__divider" />
                <button
                  className="canvasflow-project-menu__item"
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setProjectCenterOpen(true);
                    setProjectMenuOpen(false);
                  }}
                >
                  <span className="canvasflow-project-menu__check" aria-hidden="true" />
                  <span className="canvasflow-project-menu__name">项目中心…</span>
                </button>
                <button className="canvasflow-project-menu__item" type="button" role="menuitem" onClick={() => window.alert('第一版暂未接入：新建项目')}>
                  <span className="canvasflow-project-menu__check" aria-hidden="true" />
                  <span className="canvasflow-project-menu__name">新建项目</span>
                </button>
                <button className="canvasflow-project-menu__item" type="button" role="menuitem" onClick={() => window.alert('第一版暂未接入：打开本地项目')}>
                  <span className="canvasflow-project-menu__check" aria-hidden="true" />
                  <span className="canvasflow-project-menu__name">打开本地项目</span>
                </button>
              </div>
            )}
            <span className="canvasflow-project-switch__caption">当前项目</span>
            <button
              aria-expanded={isProjectMenuOpen}
              className="canvasflow-project-switch__button"
              onClick={() => setProjectMenuOpen((current) => !current)}
              type="button"
            >
              <span className="canvasflow-project-switch__name">{activeProject?.name ?? '未选择项目'}</span>
              <span className="canvasflow-project-switch__chevron" aria-hidden="true"><ChevronDownIcon /></span>
            </button>
          </div>

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
        <ImageWorkbench projectId={activeProjectId ?? 'default'} />
      ) : activeNavId === 'novel' ? (
        <NovelCreation projectId={activeProjectId ?? 'default'} />
      ) : activeNavId === 'script-workbench' ? (
        <ScriptWorkbench projectId={activeProjectId ?? 'default'} />
      ) : activeNavId === 'assets' || activeNavId.startsWith('asset-') ? (
        <AssetManagement projectId={activeProjectId ?? 'default'} />
      ) : activeNavId === 'canvas' ? (
        activeCanvasId ? (
          <CanvasWorkbench key={`${activeProjectId ?? 'default'}:${activeCanvasId}`} projectId={activeProjectId ?? 'default'} projectName={activeProject?.name} canvasId={activeCanvasId} onBack={closeCanvas} keyboardDisabled={isSettingsOpen} />
        ) : (
          <CanvasLibrary canvasCount={activeProject?.stats.canvasCount ?? 0} projectName={activeProject?.name} onOpenCanvas={openCanvas} onCreateCanvas={() => openCanvas('new-canvas')} onImportCanvas={() => window.alert('第一版暂未接入：导入画布')} onClearAll={() => window.alert('第一版暂未接入：删除全部画布')} />
        )
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

      <ProjectCenterModal
        open={isProjectCenterOpen}
        projects={mockProjects}
        activeProjectId={activeProjectId}
        recentProjectIds={recentProjectIds}
        onClose={() => setProjectCenterOpen(false)}
        onSwitchProject={switchProject}
        onEnterCanvas={(projectId) => enterWorkbench(projectId, 'canvas')}
        onWriteNovel={(projectId) => enterWorkbench(projectId, 'novel')}
      />
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
