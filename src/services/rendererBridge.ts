import type {
  ApiConnectionTestResult,
  AiUsageListResult,
  AiUsageRecord,
  ApiImageGenerationCancelResult,
  ApiImageGenerationRequest,
  ApiImageGenerationResult,
  ApiProviderConfig,
  ApiTextGenerationCancelResult,
  ApiTextGenerationRequest,
  ApiTextGenerationResult,
  TextStreamEvent,
} from '../types/apiProvider';
import type { Chapter, CharacterGraph, ChapterVersion, EmotionArc, Novel, NovelListResult, NovelResult, Scene, Volume } from '../types/novel';
import type { ThemeMode } from '../types/workspace';

const THEME_STORAGE_KEY = 'ec-theme';
const WEB_NOVELS_STORAGE_KEY = 'endless-creation.novels';
const WEB_AI_USAGE_STORAGE_KEY = 'endless-creation.ai-usage-records';

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


  async loadImageGenerationHistory(projectId?: string): Promise<{ ok: boolean; items: unknown[] }> {
    return getElectronBridge()?.app.loadImageGenerationHistory(projectId) ?? Promise.resolve({ ok: true, items: [] });
  },

  async saveImageGenerationHistory(projectId: string | undefined, items: unknown[]): Promise<{ ok: boolean; message: string }> {
    return getElectronBridge()?.app.saveImageGenerationHistory(projectId, items) ?? Promise.resolve({ ok: true, message: 'web fallback' });
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

  async loadAiUsage(projectId?: string): Promise<AiUsageListResult> {
    const electronBridge = getElectronBridge();
    if (electronBridge) return electronBridge.api.loadAiUsage(projectId);
    const records = readWebAiUsage().filter((record) => !projectId || record.projectId === projectId);
    return { ok: true, message: 'web fallback', records };
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

  async saveTextFile(defaultName: string, content: string, format: 'md' | 'doc' = 'md'): Promise<{ ok: boolean; message: string }> {
    const electronBridge = getElectronBridge();
    if (electronBridge) {
      const result = await electronBridge.app.saveTextFile(defaultName, content, format);
      return { ok: result.ok, message: result.message };
    }
    // Web fallback: Blob 下载
    const document = globalThis.document;
    if (!document?.body) throw new Error('File export bridge is unavailable.');
    const fallbackName = format === 'doc' ? '未命名小说.doc' : '未命名小说.md';
    const safeName = defaultName.replace(/[/\\:*?"<>|]/g, '_').trim() || fallbackName;
    const mimeType = format === 'doc' ? 'application/msword;charset=utf-8' : 'text/markdown;charset=utf-8';
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = safeName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    return { ok: true, message: '已导出。' };
  },

  async saveBinaryFile(defaultName: string, data: Uint8Array, kind: 'zip' = 'zip'): Promise<{ ok: boolean; message: string }> {
    const electronBridge = getElectronBridge();
    if (electronBridge) {
      const result = await electronBridge.app.saveBinaryFile(defaultName, data, kind);
      return { ok: result.ok, message: result.message };
    }
    // Web fallback: Blob 下载
    const document = globalThis.document;
    if (!document?.body) throw new Error('File export bridge is unavailable.');
    const safeName = defaultName.replace(/[/\\:*?"<>|]/g, '_').trim() || '未命名小说.zip';
    const blob = new Blob([new Uint8Array(data)], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = safeName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    return { ok: true, message: '已导出。' };
  },

  async openTextFile(): Promise<{ ok: boolean; canceled?: boolean; message: string; fileName?: string; content?: string }> {
    const electronBridge = getElectronBridge();
    if (electronBridge?.app.openTextFile) return electronBridge.app.openTextFile();
    // Web fallback: 隐藏 <input type="file"> + FileReader
    const document = globalThis.document;
    if (!document?.body) return { ok: false, message: '当前环境不支持导入文件。' };
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.txt,.md,.markdown,text/plain,text/markdown';
      input.style.position = 'fixed';
      input.style.inset = '0 auto auto -9999px';
      let settled = false;
      const cleanup = () => {
        settled = true;
        input.remove();
      };
      input.addEventListener('change', () => {
        const file = input.files?.[0];
        if (!file) {
          cleanup();
          resolve({ ok: false, canceled: true, message: '已取消导入。' });
          return;
        }
        if (file.size > 10 * 1024 * 1024) {
          cleanup();
          resolve({ ok: false, message: '文件超过 10MB，请拆分后再导入。' });
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          cleanup();
          resolve({ ok: true, message: '已读取文件。', fileName: file.name, content: typeof reader.result === 'string' ? reader.result : '' });
        };
        reader.onerror = () => {
          cleanup();
          resolve({ ok: false, message: '读取文件失败。' });
        };
        reader.readAsText(file, 'utf-8');
      });
      // 兜底：窗口重新获得焦点但未选文件时视为取消（部分浏览器不触发 change）。
      globalThis.setTimeout(() => {
        window.addEventListener('focus', () => {
          globalThis.setTimeout(() => {
            if (!settled) {
              cleanup();
              resolve({ ok: false, canceled: true, message: '已取消导入。' });
            }
          }, 300);
        }, { once: true });
      }, 0);
      document.body.appendChild(input);
      input.click();
    });
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

  // \u8ba2\u9605\u6d41\u5f0f\u6587\u672c\u589e\u91cf\u4e8b\u4ef6\uff1b\u8fd4\u56de\u9000\u8ba2\u51fd\u6570\u3002Web \u9884\u89c8\u6a21\u5f0f\u65e0 electron bridge \u65f6\u8fd4\u56de\u7a7a\u9000\u8ba2\uff08\u6d41\u5f0f\u4e0d\u53ef\u7528\uff0cUI \u5e94\u56de\u843d\u4e00\u6b21\u6027\uff09\u3002
  onTextGenerationChunk(callback: (event: TextStreamEvent) => void): () => void {
    const electronBridge = getElectronBridge();
    if (!electronBridge?.api.onTextGenerationChunk) return () => {};
    return electronBridge.api.onTextGenerationChunk(callback);
  },

  async listNovels(projectId?: string): Promise<NovelListResult> {
    const electronBridge = getElectronBridge();
    if (electronBridge) return electronBridge.novel.listNovels(projectId);
    const filterId = projectId?.trim() || null;
    const all = readWebNovels();
    const scoped = filterId ? all.filter((novel) => (novel.projectId ?? 'default') === filterId) : all;
    return { ok: true, novels: scoped.map(toNovelSummary) };
  },

  async createNovel(input: { title: string; summary?: string; note?: string; projectId?: string }): Promise<NovelResult> {
    const electronBridge = getElectronBridge();
    if (electronBridge) return electronBridge.novel.createNovel(input);
    const now = new Date().toISOString();
    const novel: Novel = {
      id: createWebNovelId(),
      title: input.title.trim() || '\u672a\u547d\u540d\u5c0f\u8bf4',
      summary: input.summary?.trim() ?? '',
      note: input.note?.trim() ?? '',
      projectId: input.projectId?.trim() || 'default',
      volumes: [],
      chapters: [],
      foreshadowings: [],
      settings: [],
      pinnedSettingIds: [],
      pinnedForeshadowingIds: [],
      version: 8,
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

function readWebAiUsage(): AiUsageRecord[] {
  try {
    const raw = globalThis.localStorage?.getItem(WEB_AI_USAGE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) as { records?: unknown } : { records: [] };
    return Array.isArray(parsed.records) ? parsed.records.map(normalizeAiUsageRecord).filter((record): record is AiUsageRecord => record !== null) : [];
  } catch {
    return [];
  }
}

function normalizeAiUsageRecord(value: unknown): AiUsageRecord | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<AiUsageRecord>;
  if (typeof candidate.id !== 'string' || typeof candidate.projectId !== 'string') return null;
  return {
    id: candidate.id,
    projectId: candidate.projectId,
    provider: typeof candidate.provider === 'string' ? candidate.provider : '',
    model: typeof candidate.model === 'string' ? candidate.model : '',
    inputTokens: typeof candidate.inputTokens === 'number' && Number.isFinite(candidate.inputTokens) ? candidate.inputTokens : 0,
    outputTokens: typeof candidate.outputTokens === 'number' && Number.isFinite(candidate.outputTokens) ? candidate.outputTokens : 0,
    estimatedCost: typeof candidate.estimatedCost === 'number' && Number.isFinite(candidate.estimatedCost) ? candidate.estimatedCost : 0,
    requestType: typeof candidate.requestType === 'string' ? candidate.requestType : 'unknown',
    success: typeof candidate.success === 'boolean' ? candidate.success : false,
    createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : '',
  };
}

function readWebNovels(): Novel[] {
  try {
    const raw = globalThis.localStorage?.getItem(WEB_NOVELS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(normalizeWebNovel).filter((novel): novel is Novel => novel !== null) : [];
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

function normalizeEmotionArc(value: unknown): EmotionArc | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const arc = value as EmotionArc;
  return typeof arc.updatedAt === 'string'
    && Array.isArray(arc.points)
    && arc.points.every((point) => typeof point?.chapterId === 'string'
      && typeof point.score === 'number'
      && Number.isFinite(point.score)
      && point.score >= -100
      && point.score <= 100
      && typeof point.reason === 'string'
      && typeof point.updatedAt === 'string')
    ? arc
    : undefined;
}

function normalizeCharacterGraph(value: unknown): CharacterGraph | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const graph = value as CharacterGraph;
  return Array.isArray(graph.characters)
    && graph.characters.every((item) => typeof item?.name === 'string'
      && typeof item.role === 'string'
      && typeof item.description === 'string')
    && Array.isArray(graph.relationships)
    && graph.relationships.every((item) => typeof item?.from === 'string'
      && typeof item.to === 'string'
      && typeof item.label === 'string')
    ? graph
    : undefined;
}

// versions per-entry validation (symmetric with electron sanitizeChapterVersions): validate id/content/createdAt, keep latest 5.
function sanitizeWebChapterVersions(value: unknown, fallbackTime: string): ChapterVersion[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map((entry): ChapterVersion | null => {
    if (!entry || typeof entry !== 'object') return null;
    const item = entry as Partial<ChapterVersion>;
    if (typeof item.content !== 'string') return null;
    return {
      id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : crypto.randomUUID(),
      content: item.content,
      createdAt: typeof item.createdAt === 'string' ? item.createdAt : fallbackTime,
    };
  }).filter((entry): entry is ChapterVersion => entry !== null).slice(-5);
}

function sanitizeWebScene(value: unknown, index: number, now: string): Scene | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Partial<Scene>;
  if (typeof item.content !== 'string' && typeof item.title !== 'string') return null;
  return {
    id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : crypto.randomUUID(),
    title: typeof item.title === 'string' ? item.title : '',
    content: typeof item.content === 'string' ? item.content : '',
    order: Number.isFinite(item.order) ? Number(item.order) : index,
    versions: sanitizeWebChapterVersions(item.versions, now),
    selectedVersionId: typeof item.selectedVersionId === 'string' ? item.selectedVersionId : undefined,
  };
}

// v7->v8 chapter migration (symmetric with electron sanitizeChapterScenes): each chapter gets at least one scene (D3).
function normalizeWebChapterScenes(chapter: unknown, now: string): Scene[] {
  const item = (chapter && typeof chapter === 'object' ? chapter : {}) as {
    scenes?: unknown;
    content?: unknown;
    versions?: unknown;
    selectedVersionId?: unknown;
  };
  if (Array.isArray(item.scenes) && item.scenes.length > 0) {
    const scenes = item.scenes
      .map((scene, index) => sanitizeWebScene(scene, index, now))
      .filter((scene): scene is Scene => scene !== null)
      .sort((a, b) => a.order - b.order)
      .map((scene, order) => ({ ...scene, order }));
    if (scenes.length > 0) return scenes;
  }
  // v7 or corrupted: migrate legacy chapter body into a single default scene.
  return [{
    id: crypto.randomUUID(),
    title: '',
    content: typeof item.content === 'string' ? item.content : '',
    order: 0,
    versions: sanitizeWebChapterVersions(item.versions, now),
    selectedVersionId: typeof item.selectedVersionId === 'string' ? item.selectedVersionId : undefined,
  }];
}

// D1 scene-content aggregation (symmetric with electron aggregateChapterContent).
function aggregateWebChapterContent(chapter: Chapter): string {
  return [...chapter.scenes]
    .sort((a, b) => a.order - b.order)
    .map((scene) => scene.content)
    .filter((content) => content.trim() !== '')
    .join('\n\n');
}

function sanitizeWebVolumes(value: unknown[]): Volume[] {
  const now = new Date().toISOString();
  return value
    .map((entry): Volume | null => {
      if (!entry || typeof entry !== 'object') return null;
      const item = entry as Partial<Volume>;
      if (typeof item.title !== 'string') return null;
      return {
        id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : crypto.randomUUID(),
        title: item.title,
        order: Number.isFinite(item.order) ? Number(item.order) : 0,
        createdAt: typeof item.createdAt === 'string' ? item.createdAt : now,
        updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : now,
      };
    })
    .filter((volume): volume is Volume => volume !== null)
    .sort((a, b) => a.order - b.order)
    .map((volume, order) => ({ ...volume, order }));
}

function normalizeWebChapterGroupOrder<T extends { volumeId?: string; order: number }>(
  chapters: T[],
  volumes: Volume[],
): T[] {
  const volumeOrder = new Map(volumes.map((volume) => [volume.id, volume.order]));
  const withPos = chapters.map((chapter, position) => ({ chapter, position }));
  const groups = new Map<string, { chapter: T; position: number }[]>();
  for (const item of withPos) {
    const key = item.chapter.volumeId && volumeOrder.has(item.chapter.volumeId) ? item.chapter.volumeId : '__unassigned__';
    const bucket = groups.get(key) ?? [];
    bucket.push(item);
    groups.set(key, bucket);
  }
  const result: T[] = [];
  for (const bucket of groups.values()) {
    bucket
      .sort((a, b) => (a.chapter.order - b.chapter.order) || (a.position - b.position))
      .forEach((item, order) => result.push({ ...item.chapter, order }));
  }
  return result;
}

function normalizeWebNovel(value: unknown): Novel | null {
  if (!isNovel(value)) return null;
  const now = new Date().toISOString();
  const volumes = Array.isArray(value.volumes) ? sanitizeWebVolumes(value.volumes) : [];
  const volumeIds = new Set(volumes.map((volume) => volume.id));
  // v7->v8 chapter rebuild via field whitelist (symmetric with electron sanitizeNovel chapter map):
  // never spread the raw chapter, so legacy content/versions/selectedVersionId are dropped (D3).
  const remappedChapters = (Array.isArray(value.chapters) ? value.chapters : []).map((chapter, index): Chapter => {
    const item = chapter as Partial<Chapter>;
    const volumeId = typeof item.volumeId === 'string' && item.volumeId.trim() && volumeIds.has(item.volumeId.trim())
      ? item.volumeId.trim()
      : undefined;
    return {
      id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : crypto.randomUUID(),
      title: typeof item.title === 'string' ? item.title : '',
      scenes: normalizeWebChapterScenes(chapter, now),
      outline: typeof item.outline === 'string' ? item.outline : undefined,
      status: item.status === 'draft' || item.status === 'inProgress' || item.status === 'done' ? item.status : undefined,
      wordTarget: typeof item.wordTarget === 'number' && Number.isFinite(item.wordTarget) && item.wordTarget > 0 ? item.wordTarget : undefined,
      volumeId,
      order: Number.isFinite(item.order) ? Number(item.order) : index,
      createdAt: typeof item.createdAt === 'string' ? item.createdAt : now,
      updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : now,
    };
  });
  const chapters = normalizeWebChapterGroupOrder(remappedChapters, volumes);
  return {
    ...value,
    volumes,
    chapters,
    foreshadowings: Array.isArray(value.foreshadowings) ? value.foreshadowings : [],
    settings: Array.isArray(value.settings) ? value.settings : [],
    pinnedSettingIds: Array.isArray(value.pinnedSettingIds) ? value.pinnedSettingIds : [],
    pinnedForeshadowingIds: Array.isArray(value.pinnedForeshadowingIds) ? value.pinnedForeshadowingIds : [],
    emotionArc: normalizeEmotionArc(value.emotionArc),
    characterGraph: normalizeCharacterGraph(value.characterGraph),
    version: 8,
  };
}

function toNovelSummary(novel: Novel) {
  return {
    id: novel.id,
    title: novel.title,
    summary: novel.summary,
    createdAt: novel.createdAt,
    updatedAt: novel.updatedAt,
    chapterCount: novel.chapters.length,
    wordCount: novel.chapters.reduce((sum, chapter) => sum + countWords(aggregateWebChapterContent(chapter)), 0),
    filledChapterCount: novel.chapters.filter((chapter) => aggregateWebChapterContent(chapter).trim() !== '').length,
  };
}

function countWords(text: string): number {
  return Array.from(text.replace(/\s+/g, '')).length;
}

function createWebNovelId(): string {
  return `novel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
