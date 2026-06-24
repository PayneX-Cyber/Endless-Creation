import { useEffect, useState } from 'react';
import type { CreationMode, ThemeMode } from '../types/workspace';
import { rendererBridge } from '../services/rendererBridge';
import { Button } from '../components/Button';
import { CreationWorkbench } from '../features/creation-workbench';
import { NAV_ITEMS } from '../features/creation-workbench/data';
import './App.css';

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
      <div className="app-window" role="application" aria-label="Endless Creation 创作工作台">
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

        <div className="workspace-frame">
          <aside className="sidebar" aria-label="功能导航">
            <nav className="nav-list">
              {NAV_ITEMS.map((item) => {
                const isActive = item.id === activeMode;

                return (
                  <button
                    aria-current={isActive ? 'page' : undefined}
                    className={`nav-item ${isActive ? 'nav-item--active' : ''}`}
                    key={item.id}
                    onClick={() => setActiveMode(item.id)}
                    type="button"
                  >
                    <span>
                      <strong>{item.label}</strong>
                      <small>{item.description}</small>
                    </span>
                    <kbd>{item.shortcut}</kbd>
                  </button>
                );
              })}
            </nav>

            <footer className="sidebar-footer">
              <Button variant="ghost" type="button">设置</Button>
              <Button
                variant="soft"
                type="button"
                aria-pressed={theme === 'light'}
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              >
                {theme === 'dark' ? '切换浅色' : '切换深色'}
              </Button>
              <div className="user-status" aria-label="用户与状态">
                <span className="user-status__avatar">U</span>
                <span><strong>Creator</strong><small>本地草稿 · Mock AI</small></span>
              </div>
            </footer>
          </aside>

          <CreationWorkbench mode={activeMode} />
        </div>
      </div>
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


