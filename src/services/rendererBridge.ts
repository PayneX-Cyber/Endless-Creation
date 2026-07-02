import type {
  ApiConnectionTestResult,
  ApiImageGenerationCancelResult,
  ApiImageGenerationRequest,
  ApiImageGenerationResult,
  ApiProviderConfig,
  ApiTextGenerationCancelResult,
  ApiTextGenerationRequest,
  ApiTextGenerationResult,
} from '../types/apiProvider';
import type { Novel, NovelListResult, NovelResult } from '../types/novel';
import type { ThemeMode } from '../types/workspace';

const THEME_STORAGE_KEY = 'ec-theme';
const WEB_NOVELS_STORAGE_KEY = 'endless-creation.novels';

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

  async readGeneratedImageDataUrl(localPath: string): Promise<{ ok: boolean; message: string; dataUrl?: string }> {
    return getElectronBridge()?.app.readGeneratedImageDataUrl(localPath) ?? Promise.resolve({ ok: false, message: '当前环境不支持读取本地图片。' });
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

  async loadProjectAssets(projectId: string): Promise<{ ok: boolean; message: string; collection?: unknown }> {
    const electronBridge = getElectronBridge();
    if (electronBridge) return electronBridge.app.loadProjectAssets(projectId);
    return { ok: true, message: 'web fallback', collection: readWebProjectAssets(projectId) };
  },

  async saveProjectAssets(projectId: string, collection: unknown): Promise<{ ok: boolean; message: string }> {
    const electronBridge = getElectronBridge();
    if (electronBridge) return electronBridge.app.saveProjectAssets(projectId, collection);
    writeWebProjectAssets(projectId, collection);
    return { ok: true, message: 'web fallback' };
  },

  async deleteProjectAssetFile(projectId: string, relativePath: string): Promise<{ ok: boolean; message: string }> {
    const electronBridge = getElectronBridge();
    if (electronBridge) return electronBridge.app.deleteProjectAssetFile(projectId, relativePath);
    return { ok: true, message: 'web fallback' };
  },


  async importProjectImageAsset(projectId: string, input: { fileName: string; mimeType: string; dataUrl: string }): Promise<{ ok: boolean; message: string; assetData?: { fileName: string; relativePath: string; mimeType: string; bytes: number } }> {
    const electronBridge = getElectronBridge();
    if (electronBridge) return electronBridge.app.importProjectImageAsset(projectId, input);
    return { ok: false, message: '\u5f53\u524d\u6d4f\u89c8\u5668\u9884\u89c8\u6a21\u5f0f\u65e0\u6cd5\u5bfc\u5165\u672c\u5730\u56fe\u7247\uff0c\u8bf7\u5728 Electron \u684c\u9762\u7aef\u4e2d\u91cd\u8bd5\u3002' };
  },

  async readProjectAssetImageDataUrl(projectId: string, relativePath: string): Promise<{ ok: boolean; message: string; dataUrl?: string }> {
    const electronBridge = getElectronBridge();
    if (electronBridge) return electronBridge.app.readProjectAssetImageDataUrl(projectId, relativePath);
    return { ok: false, message: '\u5f53\u524d\u6d4f\u89c8\u5668\u9884\u89c8\u6a21\u5f0f\u65e0\u6cd5\u8bfb\u53d6\u672c\u5730\u56fe\u7247\uff0c\u8bf7\u5728 Electron \u684c\u9762\u7aef\u4e2d\u91cd\u8bd5\u3002' };
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

  async generateText(request: ApiTextGenerationRequest): Promise<ApiTextGenerationResult> {
    const electronBridge = getElectronBridge();
    if (!electronBridge) return { ok: false, message: '\u5f53\u524d\u6d4f\u89c8\u5668\u9884\u89c8\u6a21\u5f0f\u65e0\u6cd5\u8c03\u7528\u6587\u672c\u751f\u6210 API\uff0c\u8bf7\u5728 Electron \u684c\u9762\u7aef\u4e2d\u91cd\u8bd5\u3002' };
    return electronBridge.api.generateText(request);
  },

  async cancelTextGeneration(requestId: string): Promise<ApiTextGenerationCancelResult> {
    const electronBridge = getElectronBridge();
    if (!electronBridge?.api.cancelTextGeneration) return { ok: false, message: '\u5f53\u524d\u7248\u672c\u5c1a\u672a\u63a5\u5165\u6587\u672c\u751f\u6210\u53d6\u6d88\u3002' };
    return electronBridge.api.cancelTextGeneration(requestId);
  },

  async listNovels(): Promise<NovelListResult> {
    const electronBridge = getElectronBridge();
    if (electronBridge) return electronBridge.novel.listNovels();
    return { ok: true, novels: readWebNovels().map(toNovelSummary) };
  },

  async createNovel(input: { title: string; summary?: string; note?: string }): Promise<NovelResult> {
    const electronBridge = getElectronBridge();
    if (electronBridge) return electronBridge.novel.createNovel(input);
    const now = new Date().toISOString();
    const novel: Novel = {
      id: createWebNovelId(),
      title: input.title.trim() || '\u672a\u547d\u540d\u5c0f\u8bf4',
      summary: input.summary?.trim() ?? '',
      note: input.note?.trim() ?? '',
      chapters: [],
      version: 2,
      createdAt: now,
      updatedAt: now,
    };
    writeWebNovels([novel, ...readWebNovels()]);
    return { ok: true, message: 'web fallback', novel };
  },

  async loadNovel(id: string): Promise<NovelResult> {
    const electronBridge = getElectronBridge();
    if (electronBridge) return electronBridge.novel.loadNovel(id);
    const novel = readWebNovels().find((item) => item.id === id);
    return novel ? { ok: true, message: 'web fallback', novel } : { ok: false, message: '\u5c0f\u8bf4\u4e0d\u5b58\u5728\u3002' };
  },

  async saveNovel(novel: Novel): Promise<NovelResult> {
    const electronBridge = getElectronBridge();
    if (electronBridge) return electronBridge.novel.saveNovel(novel);
    const novels = readWebNovels();
    const index = novels.findIndex((item) => item.id === novel.id);
    const next = index >= 0 ? novels.map((item) => item.id === novel.id ? novel : item) : [novel, ...novels];
    writeWebNovels(next);
    return { ok: true, message: 'web fallback', novel };
  },


  onNovelFlushBeforeClose(callback: () => Promise<void> | void): (() => void) | undefined {
    return getElectronBridge()?.novel.onFlushBeforeClose?.(callback);
  },

  async finishNovelFlushBeforeClose(): Promise<void> {
    await getElectronBridge()?.novel.finishFlushBeforeClose?.();
  },

  async deleteNovel(id: string): Promise<{ ok: boolean; message: string }> {
    const electronBridge = getElectronBridge();
    if (electronBridge) return electronBridge.novel.deleteNovel(id);
    writeWebNovels(readWebNovels().filter((novel) => novel.id !== id));
    return { ok: true, message: 'web fallback' };
  },
};

function getElectronBridge() {
  return globalThis.window?.endlessCreationBridge;
}

function projectAssetsStorageKey(projectId: string): string {
  return `endless-creation.project-assets.${projectId || 'default'}`;
}

function readWebProjectAssets(projectId: string): unknown {
  try {
    const raw = globalThis.localStorage?.getItem(projectAssetsStorageKey(projectId));
    return raw ? JSON.parse(raw) : { version: 1, assets: [] };
  } catch {
    return { version: 1, assets: [] };
  }
}

function writeWebProjectAssets(projectId: string, collection: unknown): void {
  try {
    globalThis.localStorage?.setItem(projectAssetsStorageKey(projectId), JSON.stringify(collection));
  } catch {
    // Ignore storage failures in restricted renderer contexts.
  }
}

function readWebNovels(): Novel[] {
  try {
    const raw = globalThis.localStorage?.getItem(WEB_NOVELS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(isNovel) : [];
  } catch {
    return [];
  }
}

function writeWebNovels(novels: Novel[]): void {
  try {
    globalThis.localStorage?.setItem(WEB_NOVELS_STORAGE_KEY, JSON.stringify(novels));
  } catch {
    // Ignore storage failures in restricted renderer contexts.
  }
}

function isNovel(value: unknown): value is Novel {
  return Boolean(value && typeof value === 'object' && typeof (value as Novel).id === 'string' && typeof (value as Novel).title === 'string');
}

function toNovelSummary(novel: Novel) {
  return {
    id: novel.id,
    title: novel.title,
    summary: novel.summary,
    createdAt: novel.createdAt,
    updatedAt: novel.updatedAt,
    chapterCount: novel.chapters.length,
    wordCount: novel.chapters.reduce((sum, chapter) => sum + countWords(chapter.content), 0),
  };
}

function countWords(text: string): number {
  return Array.from(text.replace(/\s+/g, '')).length;
}

function createWebNovelId(): string {
  return `novel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
