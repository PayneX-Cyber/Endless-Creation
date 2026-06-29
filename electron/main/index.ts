import { app, BrowserWindow, clipboard, ipcMain } from 'electron';
import path from 'node:path';

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
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
}

interface ApiGeneratedImage {
  b64Json?: string;
  url?: string;
  revisedPrompt?: string;
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

function registerIpcHandlers(): void {
  ipcMain.handle('app:get-version', () => app.getVersion());
  ipcMain.handle('app:get-platform', () => process.platform);

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
    && (candidate.negativePrompt === undefined || typeof candidate.negativePrompt === 'string')
    && (candidate.count === undefined || typeof candidate.count === 'number')
    && (candidate.n === undefined || typeof candidate.n === 'number');
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

  if (!requestId) return { ok: false, message: '生图请求 ID 缺失。' };
  if (!baseUrl) return { ok: false, message: '请填写 Base URL。' };
  if (!apiKey) return { ok: false, message: '请填写 API Key。' };
  if (!model) return { ok: false, message: '请选择生图模型。' };
  if (!prompt) return { ok: false, message: '请输入图片提示词。' };
  if (!size) return { ok: false, message: '请选择图片尺寸。' };
  if (!quality) return { ok: false, message: '请选择图片质量。' };
  if (!count) return { ok: false, message: '图片数量必须大于 0。' };

  let generationUrl: URL;

  try {
    generationUrl = new URL(`${baseUrl.replace(/\/+$/, '')}/images/generations`);
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
    const response = await fetch(generationUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        model,
        prompt: buildImagePrompt(prompt, negativePrompt),
        size,
        quality,
        n: count,
        response_format: 'b64_json',
      }),
      signal: controller.signal,
    });
    const parsed = await readImageGenerationResponse(response, apiKey);

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

    return {
      ok: true,
      status: response.status,
      message: `生图成功，返回 ${parsed.images.length} 张图片。`,
      images: parsed.images,
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
      ? body.data.map((model) => model.id).filter((id): id is string => typeof id === 'string').slice(0, 8)
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

  app.whenReady().then(() => {
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
