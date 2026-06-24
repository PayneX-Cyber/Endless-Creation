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
  { id: 'projects', Icon: ProjectIcon, label: '\u9879\u76ee\u7ba1\u7406', active: true },
  { id: 'prompts', Icon: PromptIcon, label: '\u63d0\u793a\u8bcd\u5e93', active: false },
];

const assetItems: Array<{ Icon: SidebarIcon; label: string; count: number }> = [
  { Icon: UserIcon, label: '\u89d2\u8272', count: 12 },
  { Icon: SceneIcon, label: '\u573a\u666f', count: 8 },
  { Icon: ScriptIcon, label: '\u5267\u672c', count: 5 },
  { Icon: BookIcon, label: '\u5c0f\u8bf4', count: 3 },
];

export function App() {
  const [theme, setTheme] = usePersistentTheme();
  const ThemeIcon = theme === 'dark' ? SunIcon : MoonIcon;

  return (
    <div className="app-shell" data-theme={theme}>
      <aside className="canvasflow-sidebar" aria-label="CanvasFlow \u4fa7\u8fb9\u680f">
        <header className="canvasflow-brand">
          <span className="canvasflow-brand__mark" aria-hidden="true">
            <AddSquareIcon />
          </span>
          <span className="canvasflow-brand__name">CanvasFlow</span>
          <button className="canvasflow-collapse" aria-label="\u6298\u53e0\u4fa7\u8fb9\u680f" type="button">
            <CollapseIcon />
          </button>
        </header>

        <nav className="canvasflow-nav" aria-label="CanvasFlow \u5bfc\u822a">
          {sidebarNavItems.map(({ Icon, ...item }) => (
            <button
              aria-current={item.active ? 'page' : undefined}
              className={`canvasflow-nav__item ${item.active ? 'canvasflow-nav__item--active' : ''}`}
              key={item.id}
              type="button"
            >
              <span className="canvasflow-nav__icon" aria-hidden="true"><Icon /></span>
              <span>{item.label}</span>
            </button>
          ))}

          <section className="canvasflow-nav__group" aria-label="\u8d44\u4ea7\u7ba1\u7406">
            <button className="canvasflow-nav__item" type="button">
              <span className="canvasflow-nav__icon" aria-hidden="true"><FolderIcon /></span>
              <span>\u8d44\u4ea7\u7ba1\u7406</span>
              <span className="canvasflow-nav__chevron" aria-hidden="true"><ChevronDownIcon /></span>
            </button>

            <div className="canvasflow-subnav">
              {assetItems.map(({ Icon, ...item }) => (
                <button className="canvasflow-subnav__item" key={item.label} type="button">
                  <span className="canvasflow-nav__icon" aria-hidden="true"><Icon /></span>
                  <span>{item.label}</span>
                  <span className="canvasflow-badge" aria-label={`${item.label} ${item.count} \u4e2a`}>{item.count}</span>
                </button>
              ))}
            </div>
          </section>
        </nav>

        <footer className="canvasflow-footer">
          <div className="canvasflow-footer__row">
            <span>\u4e3b\u9898</span>
            <button
              aria-pressed={theme === 'light'}
              className="canvasflow-theme-button"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              type="button"
            >
              <ThemeIcon />
              <span>{theme === 'dark' ? '\u6d45\u8272' : '\u6df1\u8272'}</span>
            </button>
          </div>
          <div className="canvasflow-footer__row canvasflow-footer__row--muted">
            <span>\u672c\u5730\u5b58\u50a8</span>
            <span>1.2 KB</span>
          </div>
          <div className="canvasflow-storage" aria-hidden="true"><span /></div>
        </footer>
      </aside>

      <main className="blank-workspace" aria-label="\u7a7a\u767d\u5de5\u4f5c\u533a" />
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
