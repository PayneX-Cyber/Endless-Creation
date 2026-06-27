import { app, BrowserWindow, clipboard, ipcMain } from 'electron';
import path from 'node:path';

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
let mainWindow: BrowserWindow | null = null;

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
