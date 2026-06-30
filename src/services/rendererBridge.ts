import type {
  ApiConnectionTestResult,
  ApiImageGenerationCancelResult,
  ApiImageGenerationRequest,
  ApiImageGenerationResult,
  ApiProviderConfig,
} from '../types/apiProvider';
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


  async loadImageGenerationHistory(): Promise<{ ok: boolean; items: unknown[] }> {
    return getElectronBridge()?.app.loadImageGenerationHistory() ?? Promise.resolve({ ok: true, items: [] });
  },

  async saveImageGenerationHistory(items: unknown[]): Promise<{ ok: boolean; message: string }> {
    return getElectronBridge()?.app.saveImageGenerationHistory(items) ?? Promise.resolve({ ok: true, message: 'web fallback' });
  },

  async openGeneratedImageLocation(localPath?: string): Promise<{ ok: boolean; message: string }> {
    const electronBridge = getElectronBridge();
    if (!electronBridge) return { ok: false, message: '当前浏览器预览模式无法打开图片位置，请在 Electron 桌面端中重试。' };
    return electronBridge.app.openGeneratedImageLocation(localPath);
  },

  async selectGeneratedImagesDirectory(currentPath?: string): Promise<{ ok: boolean; message: string; path?: string }> {
    const electronBridge = getElectronBridge();
    if (!electronBridge) return { ok: false, message: '当前浏览器预览模式无法选择保存位置，请在 Electron 桌面端中重试。' };
    return electronBridge.app.selectGeneratedImagesDirectory(currentPath);
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

  async testApiConnection(config: ApiProviderConfig): Promise<ApiConnectionTestResult> {
    const electronBridge = getElectronBridge();

    if (!electronBridge) {
      return {
        ok: false,
        message: '当前浏览器预览模式无法测试 API 连接，请在 Electron 桌面端中重试。',
      };
    }

    return electronBridge.api.testConnection(config);
  },

  async generateImage(request: ApiImageGenerationRequest): Promise<ApiImageGenerationResult> {
    const electronBridge = getElectronBridge();

    if (!electronBridge) {
      return {
        ok: false,
        message: '当前浏览器预览模式无法调用真实生图 API，请在 Electron 桌面端中重试。',
      };
    }

    return electronBridge.api.generateImage(request);
  },

  async cancelImageGeneration(requestId: string): Promise<ApiImageGenerationCancelResult> {
    const electronBridge = getElectronBridge();

    if (!electronBridge?.api.cancelImageGeneration) {
      return {
        ok: false,
        message: '当前版本尚未接入远端取消，已停止等待，远端请求可能仍在执行。',
      };
    }

    return electronBridge.api.cancelImageGeneration(requestId);
  },
};

function getElectronBridge() {
  return globalThis.window?.endlessCreationBridge;
}
