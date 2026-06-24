import type { ThemeMode } from '../types/workspace';

const THEME_STORAGE_KEY = 'ec-theme';

/**
 * Renderer boundary for browser/Electron-renderer capabilities.
 * Prefer the Electron preload bridge when available, and keep Web fallbacks so
 * `npm run dev` remains a pure renderer workflow.
 */
export const rendererBridge = {
  async getAppVersion(): Promise<string> {
    return getElectronBridge()?.app.getVersion() ?? Promise.resolve('web-dev');
  },

  async getPlatform(): Promise<string> {
    return getElectronBridge()?.app.getPlatform() ?? Promise.resolve('web');
  },

  async minimizeWindow(): Promise<void> {
    await getElectronBridge()?.window.minimize();
  },

  async maximizeWindow(): Promise<void> {
    await getElectronBridge()?.window.maximize();
  },

  async closeWindow(): Promise<void> {
    await getElectronBridge()?.window.close();
  },

  readTheme(): ThemeMode | null {
    try {
      const stored = globalThis.localStorage?.getItem(THEME_STORAGE_KEY);
      return stored === 'light' || stored === 'dark' ? stored : null;
    } catch {
      return null;
    }
  },

  writeTheme(theme: ThemeMode): void {
    try {
      globalThis.localStorage?.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage failures in restricted renderer contexts.
    }
  },

  applyTheme(theme: ThemeMode): void {
    globalThis.document?.documentElement.setAttribute('data-theme', theme);
  },

  async copyText(text: string): Promise<void> {
    const electronBridge = getElectronBridge();

    if (electronBridge) {
      await electronBridge.clipboard.writeText(text);
      return;
    }

    const clipboard = globalThis.navigator?.clipboard;

    if (clipboard?.writeText) {
      await clipboard.writeText(text);
      return;
    }

    const document = globalThis.document;

    if (!document?.body) {
      throw new Error('Clipboard bridge is unavailable.');
    }

    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.setAttribute('readonly', 'true');
    textArea.style.position = 'fixed';
    textArea.style.inset = '0 auto auto -9999px';
    document.body.append(textArea);
    textArea.select();

    try {
      const copied = document.execCommand('copy');
      if (!copied) {
        throw new Error('Copy command was rejected.');
      }
    } finally {
      textArea.remove();
    }
  },
};

function getElectronBridge() {
  return globalThis.window?.endlessCreationBridge;
}
