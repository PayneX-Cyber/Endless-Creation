import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron';
import type { OpenDialogOptions } from 'electron';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
app.setName('Endless Creation');
let mainWindow: BrowserWindow | null = null;
const imageGenerationControllers = new Map<string, AbortController>();
const timedOutImageGenerationRequests = new Set<string>();

interface ApiProviderConfig {
  type: 'openai-compatible';
  baseUrl: string;
  apiKey: string;
}

interface ApiConnectionTestResult {
  ok: boolean;
  status?: number;
  message: string;
  models?: string[];
}

interface ApiImageReferenceImage {
  id: string;
  name?: string;
  dataUrl: string;
}

interface ApiImageGenerationRequest {
  requestId: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  negativePrompt?: string;
  size: string;
  quality: string;
  count?: number;
  n?: number;
  saveDirectory?: string;
  referenceImages?: ApiImageReferenceImage[];
}

interface ApiGeneratedImage {
  b64Json?: string;
  url?: string;
  revisedPrompt?: string;
  localPath?: string;
  fileName?: string;
  mimeType?: string;
}

interface ApiImageGenerationResult {
  ok: boolean;
  status?: number;
  message: string;
  images?: ApiGeneratedImage[];
}

interface ApiImageGenerationCancelResult {
  ok: boolean;
  message: string;
}

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#0f131a',
    title: 'Endless Creation',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  if (DEV_SERVER_URL) {
    void mainWindow.loadURL(DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function migrateLegacyElectronUserData(): Promise<void> {
  const legacyDir = path.join(app.getPath('appData'), 'Electron');
  const currentDir = app.getPath('userData');
  if (legacyDir === currentDir) return;

  await copyLegacyDirIfCurrentMissing(legacyDir, currentDir, 'Local Storage');
  await copyLegacyDirIfCurrentMissing(legacyDir, currentDir, 'IndexedDB');
  await copyLegacyDirIfCurrentMissing(legacyDir, currentDir, 'generated');
}

async function copyLegacyDirIfCurrentMissing(legacyRoot: string, currentRoot: string, name: string): Promise<void> {
  const source = path.join(legacyRoot, name);
  const target = path.join(currentRoot, name);
  try {
    const sourceStat = await fs.stat(source);
    if (!sourceStat.isDirectory()) return;

    const targetHasData = name === 'Local Storage' ? await hasMeaningfulLocalStorage(target) : await hasFiles(target);
    if (targetHasData) return;

    await fs.mkdir(currentRoot, { recursive: true });
    await fs.cp(source, target, { recursive: true, force: true });
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return;
    console.warn(`Failed to migrate legacy ${name}:`, error);
  }
}

async function hasFiles(dir: string): Promise<boolean> {
  try {
    const entries = await fs.readdir(dir);
    return entries.some((entry) => entry !== 'LOCK');
  } catch {
    return false;
  }
}

async function hasMeaningfulLocalStorage(dir: string): Promise<boolean> {
  try {
    const levelDbDir = path.join(dir, 'leveldb');
    const entries = await fs.readdir(levelDbDir);
    const stats = await Promise.all(entries.map(async (entry) => fs.stat(path.join(levelDbDir, entry))));
    return stats.some((stat) => stat.isFile() && stat.size > 1024);
  } catch {
    return false;
  }
}


function getImageGenerationHistoryPath(): string {
  return path.join(app.getPath('userData'), 'image-generation-history.json');
}

async function loadImageGenerationHistory(): Promise<{ ok: boolean; items: unknown[] }> {
  try {
    const raw = await fs.readFile(getImageGenerationHistoryPath(), 'utf-8');
    const parsed = JSON.parse(raw) as { items?: unknown };
    return { ok: true, items: Array.isArray(parsed.items) ? parsed.items.slice(0, 20) : [] };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') console.warn('Failed to load image generation history:', error);
    return { ok: true, items: [] };
  }
}

async function saveImageGenerationHistory(items: unknown): Promise<{ ok: boolean; message: string }> {
  try {
    const nextItems = Array.isArray(items) ? items.slice(0, 20) : [];
    const historyPath = getImageGenerationHistoryPath();
    await fs.mkdir(path.dirname(historyPath), { recursive: true });
    await fs.writeFile(historyPath, JSON.stringify({ version: 1, items: nextItems }, null, 2), 'utf-8');
    return { ok: true, message: '生成历史已保存。' };
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    return { ok: false, message: `保存生成历史失败：${message}` };
  }
}


function getImageMimeType(filePath: string): string | null {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  return null;
}

function isPathInsideRoot(targetPath: string, rootPath: string): boolean {
  const target = path.resolve(targetPath);
  const root = path.resolve(rootPath);
  return target === root || target.startsWith(root + path.sep);
}

async function getAllowedGeneratedImageRoots(): Promise<string[]> {
  const roots = new Set<string>([getGeneratedImagesDir()]);
  try {
    const raw = await fs.readFile(getImageGenerationHistoryPath(), 'utf-8');
    const parsed = JSON.parse(raw) as { items?: Array<{ results?: Array<{ localPath?: unknown }> }> };
    if (Array.isArray(parsed.items)) {
      for (const item of parsed.items) {
        if (!Array.isArray(item?.results)) continue;
        for (const result of item.results) {
          if (typeof result.localPath === 'string' && result.localPath.trim()) roots.add(path.dirname(result.localPath));
        }
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') console.warn('Failed to read history image roots:', error);
  }
  return Array.from(roots);
}

async function readGeneratedImageDataUrl(localPath: unknown): Promise<{ ok: boolean; message: string; dataUrl?: string }> {
  if (typeof localPath !== 'string' || !localPath.trim()) return { ok: false, message: '图片路径缺失。' };
  const targetPath = path.resolve(localPath);
  const mimeType = getImageMimeType(targetPath);
  if (!mimeType) return { ok: false, message: '仅支持读取 PNG/JPEG/WebP 图片。' };
  const allowedRoots = await getAllowedGeneratedImageRoots();
  if (!allowedRoots.some((root) => isPathInsideRoot(targetPath, root))) return { ok: false, message: '图片路径不在允许读取范围内。' };
  try {
    const stat = await fs.stat(targetPath);
    if (!stat.isFile()) return { ok: false, message: '图片路径不是文件。' };
    const buffer = await fs.readFile(targetPath);
    return { ok: true, message: '图片已读取。', dataUrl: `data:${mimeType};base64,${buffer.toString('base64')}` };
  } catch {
    return { ok: false, message: '读取本地图片失败。' };
  }
}

function safeProjectId(projectId: unknown): string {
  return typeof projectId === 'string' && projectId.trim()
    ? projectId.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 80)
    : 'default';
}

function getProjectAssetsDir(projectId: unknown): string {
  return path.join(app.getPath('userData'), 'projects', safeProjectId(projectId));
}

function getProjectAssetsPath(projectId: unknown): string {
  return path.join(getProjectAssetsDir(projectId), 'project-assets.json');
}

async function loadProjectAssets(projectId: unknown): Promise<{ ok: boolean; message: string; collection?: unknown }> {
  try {
    const raw = await fs.readFile(getProjectAssetsPath(projectId), 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    return { ok: true, message: '资产已加载。', collection: parsed };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') console.warn('Failed to load project assets:', error);
    return { ok: true, message: '资产已加载。', collection: { version: 1, assets: [] } };
  }
}

async function saveProjectAssets(projectId: unknown, collection: unknown): Promise<{ ok: boolean; message: string }> {
  try {
    const filePath = getProjectAssetsPath(projectId);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(collection, null, 2), 'utf-8');
    return { ok: true, message: '资产已保存。' };
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    return { ok: false, message: `保存资产失败：${message}` };
  }
}

async function deleteProjectAssetFile(projectId: unknown, relativePath: unknown): Promise<{ ok: boolean; message: string }> {
  if (typeof relativePath !== 'string' || !relativePath.trim()) return { ok: true, message: '没有需要删除的文件。' };
  const root = getProjectAssetsDir(projectId);
  const target = path.resolve(root, relativePath);
  if (!isPathInsideRoot(target, root)) return { ok: false, message: '资产文件路径不在项目目录内。' };
  try {
    await fs.unlink(target);
    return { ok: true, message: '资产文件已删除。' };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { ok: true, message: '资产文件不存在，已忽略。' };
    const message = error instanceof Error ? error.message : '未知错误';
    return { ok: false, message: `删除资产文件失败：${message}` };
  }
}

function imageExtensionFromMime(mimeType: string): string | null {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/webp') return 'webp';
  return null;
}

function parseAssetImageDataUrl(dataUrl: unknown): { mimeType: string; buffer: Buffer } | null {
  if (typeof dataUrl !== 'string') return null;
  const match = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/i.exec(dataUrl);
  if (!match?.[1] || !match[2]) return null;
  const buffer = Buffer.from(match[2], 'base64');
  return buffer.length ? { mimeType: match[1].toLowerCase(), buffer } : null;
}

function safeOriginalFileName(fileName: unknown): string {
  const name = typeof fileName === 'string' ? path.basename(fileName).replace(/[\u0000-\u001f<>:"/\\|?*]+/g, '-').trim() : '';
  return name || 'image';
}

async function importProjectImageAsset(projectId: unknown, input: unknown): Promise<{ ok: boolean; message: string; assetData?: { fileName: string; relativePath: string; mimeType: string; bytes: number } }> {
  const candidate = input && typeof input === 'object' ? input as { fileName?: unknown; dataUrl?: unknown } : {};
  const parsed = parseAssetImageDataUrl(candidate.dataUrl);
  if (!parsed) return { ok: false, message: '\u4ec5\u652f\u6301\u5bfc\u5165 PNG/JPEG/WebP \u56fe\u7247\u3002' };
  if (parsed.buffer.byteLength > 10 * 1024 * 1024) return { ok: false, message: '\u56fe\u7247\u4e0d\u80fd\u8d85\u8fc7 10MB\u3002' };

  const ext = imageExtensionFromMime(parsed.mimeType);
  if (!ext) return { ok: false, message: '\u4ec5\u652f\u6301\u5bfc\u5165 PNG/JPEG/WebP \u56fe\u7247\u3002' };

  const imagesDir = path.join(getProjectAssetsDir(projectId), 'assets', 'images');
  const id = randomUUID();
  const relativePath = path.join('assets', 'images', `${id}.${ext}`).replaceAll(path.sep, '/');
  const target = path.join(imagesDir, `${id}.${ext}`);
  const temp = path.join(imagesDir, `${id}.tmp`);

  try {
    await fs.mkdir(imagesDir, { recursive: true });
    await fs.writeFile(temp, parsed.buffer);
    await fs.rename(temp, target);
    return { ok: true, message: '\u56fe\u7247\u8d44\u4ea7\u5df2\u5bfc\u5165\u3002', assetData: { fileName: safeOriginalFileName(candidate.fileName), relativePath, mimeType: parsed.mimeType, bytes: parsed.buffer.byteLength } };
  } catch (error) {
    await fs.unlink(temp).catch(() => undefined);
    const message = error instanceof Error ? error.message : '\u672a\u77e5\u9519\u8bef';
    return { ok: false, message: `\u5bfc\u5165\u56fe\u7247\u8d44\u4ea7\u5931\u8d25\uff1a${message}` };
  }
}

async function readProjectAssetImageDataUrl(projectId: unknown, relativePath: unknown): Promise<{ ok: boolean; message: string; dataUrl?: string }> {
  if (typeof relativePath !== 'string' || !relativePath.trim()) return { ok: false, message: '\u56fe\u7247\u8def\u5f84\u7f3a\u5931\u3002' };
  const root = getProjectAssetsDir(projectId);
  const target = path.resolve(root, relativePath);
  if (!isPathInsideRoot(target, root)) return { ok: false, message: '\u56fe\u7247\u8def\u5f84\u4e0d\u5728\u9879\u76ee\u76ee\u5f55\u5185\u3002' };
  const mimeType = getImageMimeType(target);
  if (!mimeType) return { ok: false, message: '\u4ec5\u652f\u6301\u8bfb\u53d6 PNG/JPEG/WebP \u56fe\u7247\u3002' };
  try {
    const stat = await fs.stat(target);
    if (!stat.isFile()) return { ok: false, message: '\u56fe\u7247\u8def\u5f84\u4e0d\u662f\u6587\u4ef6\u3002' };
    const buffer = await fs.readFile(target);
    return { ok: true, message: '\u56fe\u7247\u5df2\u8bfb\u53d6\u3002', dataUrl: `data:${mimeType};base64,${buffer.toString('base64')}` };
  } catch {
    return { ok: false, message: '\u8d44\u4ea7\u6587\u4ef6\u4e22\u5931\uff0c\u65e0\u6cd5\u4f7f\u7528' };
  }
}

function registerIpcHandlers(): void {
  ipcMain.handle('app:get-version', () => app.getVersion());
  ipcMain.handle('app:get-platform', () => process.platform);
  ipcMain.handle('app:load-image-generation-history', () => loadImageGenerationHistory());
  ipcMain.handle('app:save-image-generation-history', (_event, items: unknown) => saveImageGenerationHistory(items));
  ipcMain.handle('app:read-generated-image-data-url', (_event, localPath: unknown) => readGeneratedImageDataUrl(localPath));
  ipcMain.handle('app:open-generated-image-location', async (_event, localPath: unknown): Promise<{ ok: boolean; message: string }> => {
    if (typeof localPath === 'string' && localPath.trim()) {
      shell.showItemInFolder(localPath);
      return { ok: true, message: '已打开图片所在文件夹。' };
    }

    const saveDir = getGeneratedImagesDir();
    await fs.mkdir(saveDir, { recursive: true });
    const errorMessage = await shell.openPath(saveDir);
    return errorMessage ? { ok: false, message: `打开保存目录失败：${errorMessage}` } : { ok: true, message: '已打开图片保存目录。' };
  });
  ipcMain.handle('app:load-project-assets', (_event, projectId: unknown) => loadProjectAssets(projectId));
  ipcMain.handle('app:save-project-assets', (_event, projectId: unknown, collection: unknown) => saveProjectAssets(projectId, collection));
  ipcMain.handle('app:delete-project-asset-file', (_event, projectId: unknown, relativePath: unknown) => deleteProjectAssetFile(projectId, relativePath));
  ipcMain.handle('app:import-project-image-asset', (_event, projectId: unknown, input: unknown) => importProjectImageAsset(projectId, input));
  ipcMain.handle('app:read-project-asset-image-data-url', (_event, projectId: unknown, relativePath: unknown) => readProjectAssetImageDataUrl(projectId, relativePath));
  ipcMain.handle('app:select-generated-images-directory', async (_event, currentPath: unknown): Promise<{ ok: boolean; message: string; path?: string }> => {
    const options: OpenDialogOptions = {
      title: '选择图片保存位置',
      defaultPath: typeof currentPath === 'string' && currentPath.trim() ? currentPath : getGeneratedImagesDir(),
      properties: ['openDirectory', 'createDirectory'],
    };
    const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options);

    if (result.canceled || !result.filePaths[0]) return { ok: false, message: '已取消选择。' };
    return { ok: true, message: '已更新保存位置。', path: result.filePaths[0] };
  });

  ipcMain.handle('window:minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });

  ipcMain.handle('window:maximize', (event) => {
    const targetWindow = BrowserWindow.fromWebContents(event.sender);
    if (!targetWindow) return;

    if (targetWindow.isMaximized()) {
      targetWindow.unmaximize();
      return;
    }

    targetWindow.maximize();
  });

  ipcMain.handle('window:close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });

  ipcMain.handle('clipboard:write-text', (_event, text: unknown) => {
    if (typeof text !== 'string') {
      throw new Error('clipboard.writeText expects a string.');
    }

    clipboard.writeText(text);
  });

  ipcMain.handle('api:test-connection', async (_event, config: unknown): Promise<ApiConnectionTestResult> => {
    return testOpenAiCompatibleConnection(config);
  });

  ipcMain.handle('api:generate-image', async (_event, request: unknown): Promise<ApiImageGenerationResult> => {
    return generateOpenAiCompatibleImage(request);
  });

  ipcMain.handle('api:cancel-image-generation', (_event, requestId: unknown): { ok: boolean; message: string } => {
    if (typeof requestId !== 'string' || !requestId.trim()) {
      return { ok: false, message: '取消请求缺少 requestId。' };
    }

    const controller = imageGenerationControllers.get(requestId);
    if (!controller) {
      return { ok: false, message: '未找到正在执行的生图请求。' };
    }

    controller.abort();
    imageGenerationControllers.delete(requestId);
    return { ok: true, message: '已取消生图请求。' };
  });
}

function isApiProviderConfig(config: unknown): config is ApiProviderConfig {
  if (!config || typeof config !== 'object') return false;

  const candidate = config as Record<string, unknown>;
  return candidate.type === 'openai-compatible'
    && typeof candidate.baseUrl === 'string'
    && typeof candidate.apiKey === 'string';
}

async function testOpenAiCompatibleConnection(config: unknown): Promise<ApiConnectionTestResult> {
  if (!isApiProviderConfig(config)) {
    return { ok: false, message: 'API 配置格式无效。' };
  }

  const baseUrl = config.baseUrl.trim();
  const apiKey = config.apiKey.trim();

  if (!baseUrl) return { ok: false, message: '请填写 Base URL。' };
  if (!apiKey) return { ok: false, message: '请填写 API Key。' };

  let modelsUrl: URL;

  try {
    modelsUrl = new URL(`${baseUrl.replace(/\/+$/, '')}/models`);
  } catch {
    return { ok: false, message: 'Base URL 格式无效。' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  try {
    const response = await fetch(modelsUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
    const models = await readModelIds(response);

    if (response.ok) {
      return {
        ok: true,
        status: response.status,
        message: `连接成功，获取到 ${models.length} 个模型。`,
        models,
      };
    }

    return {
      ok: false,
      status: response.status,
      message: `连接失败：HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}。`,
      models,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { ok: false, message: '连接超时，请检查网络或 Base URL。' };
    }

    return { ok: false, message: error instanceof Error ? `连接失败：${error.message}` : '连接失败：未知错误。' };
  } finally {
    clearTimeout(timeout);
  }
}

function isApiImageReferenceImage(value: unknown): value is ApiImageReferenceImage {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.id === 'string'
    && (candidate.name === undefined || typeof candidate.name === 'string')
    && typeof candidate.dataUrl === 'string';
}

function isApiImageGenerationRequest(request: unknown): request is ApiImageGenerationRequest {
  if (!request || typeof request !== 'object') return false;

  const candidate = request as Record<string, unknown>;
  return typeof candidate.requestId === 'string'
    && typeof candidate.baseUrl === 'string'
    && typeof candidate.apiKey === 'string'
    && typeof candidate.model === 'string'
    && typeof candidate.prompt === 'string'
    && typeof candidate.size === 'string'
    && typeof candidate.quality === 'string'
    && (candidate.saveDirectory === undefined || typeof candidate.saveDirectory === 'string')
    && (candidate.negativePrompt === undefined || typeof candidate.negativePrompt === 'string')
    && (candidate.count === undefined || typeof candidate.count === 'number')
    && (candidate.n === undefined || typeof candidate.n === 'number')
    && (candidate.referenceImages === undefined || (Array.isArray(candidate.referenceImages) && candidate.referenceImages.every(isApiImageReferenceImage)));
}

async function generateOpenAiCompatibleImage(request: unknown): Promise<ApiImageGenerationResult> {
  if (!isApiImageGenerationRequest(request)) {
    return { ok: false, message: '生图请求格式无效。' };
  }

  const requestId = request.requestId.trim();
  const baseUrl = request.baseUrl.trim();
  const apiKey = request.apiKey.trim();
  const model = request.model.trim();
  const prompt = request.prompt.trim();
  const negativePrompt = request.negativePrompt?.trim();
  const size = request.size.trim();
  const quality = request.quality.trim();
  const count = normalizeImageCount(request.n ?? request.count);
  const referenceImages = request.referenceImages ?? [];

  if (!requestId) return { ok: false, message: '生图请求 ID 缺失。' };
  if (!baseUrl) return { ok: false, message: '请填写 Base URL。' };
  if (!apiKey) return { ok: false, message: '请填写 API Key。' };
  if (!model) return { ok: false, message: '请选择生图模型。' };
  if (!prompt) return { ok: false, message: '请输入图片提示词。' };
  if (!size) return { ok: false, message: '请选择图片尺寸。' };
  if (!quality) return { ok: false, message: '请选择图片质量。' };
  if (!count) return { ok: false, message: '图片数量必须大于 0。' };

  let generationUrl: URL;
  let editUrl: URL | null = null;

  try {
    const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
    generationUrl = new URL(`${normalizedBaseUrl}/images/generations`);
    if (referenceImages.length) editUrl = new URL(`${normalizedBaseUrl}/images/edits`);
  } catch {
    return { ok: false, message: 'Base URL 格式无效。' };
  }

  imageGenerationControllers.get(requestId)?.abort();

  const controller = new AbortController();
  imageGenerationControllers.set(requestId, controller);
  const timeout = setTimeout(() => {
    timedOutImageGenerationRequests.add(requestId);
    controller.abort();
  }, 60_000);

  try {
    let response: Response;
    let parsed: { images: ApiGeneratedImage[]; errorMessage?: string };

    if (referenceImages.length && editUrl) {
      response = await sendImageEditRequest(editUrl, apiKey, controller.signal, {
        model,
        prompt: buildImagePrompt(prompt, negativePrompt),
        size,
        n: count,
        response_format: 'b64_json',
      }, referenceImages);
      parsed = await readImageGenerationResponse(response, apiKey);
    } else {
      let activeGenerationUrl = generationUrl;
      response = await sendImageGenerationRequest(activeGenerationUrl, apiKey, controller.signal, {
        model,
        prompt: buildImagePrompt(prompt, negativePrompt),
        size,
        quality,
        n: count,
        response_format: 'b64_json',
      });
      parsed = await readImageGenerationResponse(response, apiKey);

      if (shouldRetryWithV1(response)) {
        activeGenerationUrl = new URL(`${baseUrl.replace(/\/+$/, '')}/v1/images/generations`);
        response = await sendImageGenerationRequest(activeGenerationUrl, apiKey, controller.signal, {
          model,
          prompt: buildImagePrompt(prompt, negativePrompt),
          size,
          quality,
          n: count,
          response_format: 'b64_json',
        });
        parsed = await readImageGenerationResponse(response, apiKey);
      }

      if (!response.ok && shouldRetryWithoutResponseFormat(parsed.errorMessage)) {
        response = await sendImageGenerationRequest(activeGenerationUrl, apiKey, controller.signal, {
          model,
          prompt: buildImagePrompt(prompt, negativePrompt),
          size,
          quality,
          n: count,
        });
        parsed = await readImageGenerationResponse(response, apiKey);
      }
    }

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        message: parsed.errorMessage ?? `生图失败：HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}。`,
      };
    }

    if (!parsed.images.length) {
      return {
        ok: false,
        status: response.status,
        message: '生图接口返回了空结果。',
      };
    }

    const images = await saveGeneratedImagesLocally(parsed.images, request.saveDirectory);

    return {
      ok: true,
      status: response.status,
      message: `生图成功，返回 ${images.length} 张图片。`,
      images,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { ok: false, message: controller.signal.aborted && requestId && !imageGenerationControllers.has(requestId) ? '生图请求已取消。' : '生图请求超时，请稍后重试或检查服务状态。' };
    }

    return {
      ok: false,
      message: error instanceof Error ? `生图失败：${redactSecret(error.message, apiKey)}` : '生图失败：未知错误。',
    };
  } finally {
    clearTimeout(timeout);
    if (imageGenerationControllers.get(requestId) === controller) {
      imageGenerationControllers.delete(requestId);
    }
    timedOutImageGenerationRequests.delete(requestId);
  }
}

function sendImageGenerationRequest(
  generationUrl: URL,
  apiKey: string,
  signal: AbortSignal,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetch(generationUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
    signal,
  });
}

function sendImageEditRequest(
  editUrl: URL,
  apiKey: string,
  signal: AbortSignal,
  fields: Record<string, string | number>,
  referenceImages: ApiImageReferenceImage[],
): Promise<Response> {
  const formData = new FormData();
  Object.entries(fields).forEach(([key, value]) => formData.append(key, String(value)));
  referenceImages.forEach((image) => {
    const parsed = parseDataUrlImage(image.dataUrl);
    formData.append('image', parsed.blob, safeImageFileName(image));
  });

  return fetch(editUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
    body: formData,
    signal,
  });
}

function parseDataUrlImage(dataUrl: string): { mime: string; blob: Blob } {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl);
  if (!match?.[1] || !match[2]) throw new Error('参考图数据格式无效。');
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length) throw new Error('参考图数据为空。');
  return { mime: match[1], blob: new Blob([new Uint8Array(buffer)], { type: match[1] }) };
}

function safeImageFileName(image: ApiImageReferenceImage): string {
  const baseName = (image.name || image.id || 'reference').replace(/[\/:*?"<>|]+/g, '-').trim() || 'reference';
  return /\.[a-z0-9]{2,8}$/i.test(baseName) ? baseName : `${baseName}.png`;
}

function shouldRetryWithV1(response: Response): boolean {
  return response.status === 404 || response.status === 405;
}

function shouldRetryWithoutResponseFormat(message?: string): boolean {
  return /response_?format|unsupported|unknown parameter|invalid parameter|不支持|未知参数/i.test(message ?? '');
}

function cancelOpenAiCompatibleImageGeneration(requestId: unknown): ApiImageGenerationCancelResult {
  if (typeof requestId !== 'string' || !requestId.trim()) {
    return { ok: false, message: '生图请求 ID 缺失。' };
  }

  const normalizedRequestId = requestId.trim();
  const controller = imageGenerationControllers.get(normalizedRequestId);

  if (!controller) {
    return { ok: false, message: '未找到正在进行的生图请求。' };
  }

  controller.abort();
  imageGenerationControllers.delete(normalizedRequestId);
  timedOutImageGenerationRequests.delete(normalizedRequestId);

  return { ok: true, message: '已取消生图请求。' };
}

function normalizeImageCount(count: number | undefined): number | null {
  if (count === undefined) return 1;
  if (!Number.isFinite(count)) return null;

  const normalized = Math.floor(count);
  return normalized > 0 ? normalized : null;
}

function buildImagePrompt(prompt: string, negativePrompt?: string): string {
  if (!negativePrompt) return prompt;

  return `${prompt}\n\nNegative prompt: ${negativePrompt}`;
}

async function readImageGenerationResponse(
  response: Response,
  apiKey: string,
): Promise<{ images: ApiGeneratedImage[]; errorMessage?: string }> {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return { images: [], errorMessage: '生图接口返回了非 JSON 响应。' };
  }

  let body: unknown;

  try {
    body = await response.json();
  } catch {
    return { images: [], errorMessage: '生图接口返回了无效 JSON。' };
  }

  const errorMessage = readProviderErrorMessage(body, apiKey);
  const data = (body as { data?: unknown }).data;

  if (!Array.isArray(data)) {
    return { images: [], errorMessage };
  }

  const images = data
    .map((item): ApiGeneratedImage | null => {
      if (!item || typeof item !== 'object') return null;

      const candidate = item as Record<string, unknown>;
      const b64Json = typeof candidate.b64_json === 'string' ? candidate.b64_json : undefined;
      const url = typeof candidate.url === 'string' ? candidate.url : undefined;
      const revisedPrompt = typeof candidate.revised_prompt === 'string' ? candidate.revised_prompt : undefined;

      if (!b64Json && !url) return null;

      return { b64Json, url, revisedPrompt };
    })
    .filter((image): image is ApiGeneratedImage => image !== null);

  return { images, errorMessage };
}

async function saveGeneratedImagesLocally(images: ApiGeneratedImage[], saveDirectory?: string): Promise<ApiGeneratedImage[]> {
  const saveDir = saveDirectory?.trim() || getGeneratedImagesDir();

  return Promise.all(images.map(async (image, index) => {
    if (!image.b64Json) return image;

    try {
      await fs.mkdir(saveDir, { recursive: true });
      const fileName = `${formatTimestamp(new Date())}-${index + 1}-${Math.random().toString(36).slice(2, 8)}.png`;
      const localPath = path.join(saveDir, fileName);
      await fs.writeFile(localPath, Buffer.from(image.b64Json, 'base64'));

      return {
        ...image,
        localPath,
        fileName,
        mimeType: 'image/png',
      };
    } catch (error) {
      console.warn('Failed to save generated image locally:', error);
      return image;
    }
  }));
}

function getGeneratedImagesDir(): string {
  return path.join(app.getPath('userData'), 'generated', 'images');
}

function formatTimestamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function readProviderErrorMessage(body: unknown, apiKey: string): string | undefined {
  if (!body || typeof body !== 'object') return undefined;

  const error = (body as { error?: unknown }).error;
  if (!error || typeof error !== 'object') return undefined;

  const message = (error as { message?: unknown }).message;
  return typeof message === 'string' && message.trim()
    ? `生图失败：${redactSecret(message.trim(), apiKey)}`
    : undefined;
}

function redactSecret(message: string, secret: string): string {
  return secret ? message.replaceAll(secret, '[redacted]') : message;
}

async function readModelIds(response: Response): Promise<string[]> {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) return [];

  try {
    const body = await response.json() as { data?: Array<{ id?: unknown }> };
    return Array.isArray(body.data)
      ? body.data.map((model) => model.id).filter((id): id is string => typeof id === 'string')
      : [];
  } catch {
    return [];
  }
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;

    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    await migrateLegacyElectronUserData();
    registerIpcHandlers();
    createMainWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      }
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
