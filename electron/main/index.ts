import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron';
import type { OpenDialogOptions, SaveDialogOptions } from 'electron';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
app.setName('Endless Creation');
let mainWindow: BrowserWindow | null = null;
let isClosingAfterNovelFlush = false;
let novelFlushCloseTimer: NodeJS.Timeout | null = null;
const imageGenerationControllers = new Map<string, AbortController>();
const timedOutImageGenerationRequests = new Set<string>();
const textGenerationControllers = new Map<string, AbortController>();
const timedOutTextGenerationRequests = new Set<string>();
const novelSaveQueues = new Map<string, Promise<unknown>>();

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
  channelId?: string;
  channelLabel?: string;
  projectId?: string;
  requestType?: string;
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

interface ApiTextGenerationRequest {
  requestId: string;
  channelId?: string;
  channelLabel?: string;
  projectId?: string;
  requestType?: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: Array<{ role: 'system' | 'user'; content: string }>;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

interface ApiTextGenerationResult {
  ok: boolean;
  status?: number;
  message: string;
  text?: string;
}

// 流式文本事件信封（与 preload/renderer 侧 TextStreamEvent 保持结构一致）。
type TextStreamEvent =
  | { type: 'delta'; requestId: string; delta: string }
  | { type: 'done'; requestId: string; text: string; inputTokens: number; outputTokens: number }
  | { type: 'error'; requestId: string; message: string }
  | { type: 'aborted'; requestId: string; reason: 'cancel' | 'timeout' };

interface AiUsageRecord {
  id: string;
  projectId: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  requestType: string;
  success: boolean;
  createdAt: string;
}

interface ChapterVersion {
  id: string;
  content: string;
  createdAt: string;
}

type ChapterStatus = 'draft' | 'inProgress' | 'done';

interface Chapter {
  id: string;
  title: string;
  content: string;
  outline?: string;
  versions?: ChapterVersion[];
  selectedVersionId?: string;
  status?: ChapterStatus;
  wordTarget?: number;
  order: number;
  createdAt: string;
  updatedAt: string;
}

interface Foreshadowing {
  id: string;
  title: string;
  plantedChapterId: string;
  status: 'planted' | 'paidOff';
  payoffChapterId?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

interface Novel {
  id: string;
  title: string;
  summary: string;
  note: string;
  idea?: string;
  blueprint?: string;
  wordTarget?: number;
  projectId?: string;
  chapters: Chapter[];
  foreshadowings: Foreshadowing[];
  version: 4;
  createdAt: string;
  updatedAt: string;
}

type NovelSummary = Pick<Novel, 'id' | 'title' | 'summary' | 'projectId' | 'createdAt' | 'updatedAt'> & {
  chapterCount: number;
  wordCount: number;
  filledChapterCount: number;
};

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

  mainWindow.on('close', (event) => {
    if (isClosingAfterNovelFlush) return;
    event.preventDefault();
    const targetWindow = mainWindow;
    if (!targetWindow || targetWindow.isDestroyed()) return;
    targetWindow.webContents.send('novel:flush-before-close');
    // ponytail: close after timeout if no novel editor is mounted to acknowledge.
    novelFlushCloseTimer ??= setTimeout(() => closeAfterNovelFlush(targetWindow), 2500);
  });

  mainWindow.on('closed', () => {
    if (novelFlushCloseTimer) clearTimeout(novelFlushCloseTimer);
    novelFlushCloseTimer = null;
    isClosingAfterNovelFlush = false;
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

function getAiUsagePath(): string {
  return path.join(app.getPath('userData'), 'ai-usage-records.json');
}

function sanitizeAiUsageRecord(value: unknown): AiUsageRecord | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  return {
    id: typeof candidate.id === 'string' ? candidate.id : randomUUID(),
    projectId: typeof candidate.projectId === 'string' ? candidate.projectId : '',
    provider: typeof candidate.provider === 'string' ? candidate.provider : '',
    model: typeof candidate.model === 'string' ? candidate.model : '',
    inputTokens: typeof candidate.inputTokens === 'number' && Number.isFinite(candidate.inputTokens) ? Math.max(0, Math.floor(candidate.inputTokens)) : 0,
    outputTokens: typeof candidate.outputTokens === 'number' && Number.isFinite(candidate.outputTokens) ? Math.max(0, Math.floor(candidate.outputTokens)) : 0,
    estimatedCost: typeof candidate.estimatedCost === 'number' && Number.isFinite(candidate.estimatedCost) ? Math.max(0, candidate.estimatedCost) : 0,
    requestType: typeof candidate.requestType === 'string' ? candidate.requestType : 'unknown',
    success: typeof candidate.success === 'boolean' ? candidate.success : false,
    createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : new Date().toISOString(),
  };
}

async function loadAiUsage(projectId?: unknown): Promise<{ ok: boolean; message: string; records: AiUsageRecord[] }> {
  const filterProjectId = typeof projectId === 'string' ? projectId : '';
  try {
    const raw = await fs.readFile(getAiUsagePath(), 'utf-8');
    const parsed = JSON.parse(raw) as { records?: unknown };
    const records = Array.isArray(parsed.records) ? parsed.records.map(sanitizeAiUsageRecord).filter((item): item is AiUsageRecord => item !== null) : [];
    return { ok: true, message: 'AI usage loaded.', records: filterProjectId ? records.filter((record) => record.projectId === filterProjectId) : records };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { ok: true, message: 'AI usage loaded.', records: [] };
    return { ok: false, message: 'AI usage load failed.', records: [] };
  }
}

async function appendAiUsage(record: Omit<AiUsageRecord, 'id' | 'createdAt'>): Promise<void> {
  const current = await loadAiUsage();
  const records = current.records;
  records.push({ ...record, id: randomUUID(), createdAt: new Date().toISOString() });
  await fs.writeFile(getAiUsagePath(), JSON.stringify({ version: 1, records }, null, 2), 'utf-8');
}

// 本地 provider/model 价格表：单位为「人民币元 / 每百万 token」，与成本看板的 ¥ 展示一致。
// OpenAI 系为官方美元价 × ≈7.2 的估算折算（注释标注美元源价）；国产模型直接采用官方人民币价。
// 仅用于本地成本估算，非实时汇率、非精确账单；新增/调整模型直接改这张表即可。
const AI_MODEL_PRICING_CNY_PER_MILLION: Record<string, { input: number; output: number }> = {
  // OpenAI（美元官方价折算）
  'gpt-4o-mini': { input: 1.08, output: 4.32 }, // $0.15 / $0.60
  'gpt-4o': { input: 18, output: 72 }, // $2.50 / $10.00
  'gpt-4.1-nano': { input: 0.72, output: 2.88 }, // $0.10 / $0.40
  'gpt-4.1-mini': { input: 2.88, output: 11.52 }, // $0.40 / $1.60
  'gpt-4.1': { input: 14.4, output: 57.6 }, // $2.00 / $8.00
  'o3-mini': { input: 7.92, output: 31.68 }, // $1.10 / $4.40
  'o1-mini': { input: 7.92, output: 31.68 }, // $1.10 / $4.40
  // DeepSeek（官方人民币价）
  'deepseek-reasoner': { input: 4, output: 16 },
  'deepseek-chat': { input: 2, output: 8 },
  // 通义千问（官方人民币价）
  'qwen-max': { input: 2.4, output: 9.6 },
  'qwen-plus': { input: 0.8, output: 2 },
  // 智谱 GLM（官方人民币价）
  'glm-4-air': { input: 0.5, output: 0.5 },
  'glm-4': { input: 5, output: 5 },
};

// 未知模型时的兜底单价（人民币元 / 每百万 token），取一个保守的中小模型量级，避免估算恒为 0。
const AI_FALLBACK_PRICING_CNY_PER_MILLION = { input: 1, output: 3 };

function resolveModelPricing(model: string): { input: number; output: number } {
  const normalized = model.trim().toLowerCase();
  if (!normalized) return AI_FALLBACK_PRICING_CNY_PER_MILLION;
  // 先按 key 长度降序做前缀匹配，避免 `gpt-4o-mini` 被更短的 `gpt-4o` 抢先命中；
  // 同时兼容带日期/版本后缀的模型名（如 gpt-4o-mini-2024-07-18）。
  const keys = Object.keys(AI_MODEL_PRICING_CNY_PER_MILLION).sort((a, b) => b.length - a.length);
  const prefixHit = keys.find((key) => normalized.startsWith(key));
  if (prefixHit) return AI_MODEL_PRICING_CNY_PER_MILLION[prefixHit];
  const includeHit = keys.find((key) => normalized.includes(key));
  if (includeHit) return AI_MODEL_PRICING_CNY_PER_MILLION[includeHit];
  return AI_FALLBACK_PRICING_CNY_PER_MILLION;
}

function estimateAiCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = resolveModelPricing(model);
  const input = Number.isFinite(inputTokens) ? Math.max(0, inputTokens) : 0;
  const output = Number.isFinite(outputTokens) ? Math.max(0, outputTokens) : 0;
  const cost = (input / 1_000_000) * pricing.input + (output / 1_000_000) * pricing.output;
  return Number.isFinite(cost) ? Math.max(0, cost) : 0;
}

async function safeRecordAiUsage(request: { projectId?: string; channelId?: string; channelLabel?: string; baseUrl: string; model: string; requestType?: string }, usage: { inputTokens?: number; outputTokens?: number }, success: boolean): Promise<void> {
  const projectId = request.projectId?.trim();
  if (!projectId) return;
  try {
    let provider = request.channelLabel?.trim() || request.channelId?.trim() || '';
    if (!provider) {
      try {
        provider = new URL(request.baseUrl).hostname;
      } catch {
        provider = 'unknown';
      }
    }
    const model = request.model.trim();
    const inputTokens = usage.inputTokens ?? 0;
    const outputTokens = usage.outputTokens ?? 0;
    await appendAiUsage({
      projectId,
      provider,
      model,
      inputTokens,
      outputTokens,
      estimatedCost: estimateAiCost(model, inputTokens, outputTokens),
      requestType: request.requestType?.trim() || 'unknown',
      success,
    });
  } catch {
    // Cost tracking must not break generation.
  }
}

async function loadImageGenerationHistory(projectId?: string): Promise<{ ok: boolean; items: unknown[] }> {
  try {
    const raw = await fs.readFile(getImageGenerationHistoryPath(), 'utf-8');
    const parsed = JSON.parse(raw) as { version?: number; items?: unknown; projects?: Record<string, unknown[]>; legacy?: unknown[] };

    // v2: { projects: { [id]: [...] }, legacy?: [...] }
    if (parsed.version === 2 && parsed.projects) {
      if (!projectId) return { ok: true, items: (parsed.legacy ?? []).slice(0, 20) };
      return { ok: true, items: (Array.isArray(parsed.projects[projectId]) ? parsed.projects[projectId] : []).slice(0, 20) };
    }

    // v1 or unversioned: when projectId='default', return legacy items; otherwise empty
    const legacyItems = Array.isArray(parsed.items) ? parsed.items.slice(0, 20) : [];
    if (projectId === 'default') return { ok: true, items: legacyItems };
    return { ok: true, items: [] };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') console.warn('Failed to load image generation history:', error);
    return { ok: true, items: [] };
  }
}

async function saveImageGenerationHistory(projectId: string | undefined, items: unknown): Promise<{ ok: boolean; message: string }> {
  try {
    const nextItems = Array.isArray(items) ? items.slice(0, 20) : [];
    const historyPath = getImageGenerationHistoryPath();
    await fs.mkdir(path.dirname(historyPath), { recursive: true });

    // Read existing
    let existing: { version?: number; items?: unknown[]; projects?: Record<string, unknown[]>; legacy?: unknown[] } = {};
    try {
      const raw = await fs.readFile(historyPath, 'utf-8');
      existing = JSON.parse(raw);
    } catch {
      // File doesn't exist or corrupt, start fresh
    }

    // Upgrade v1 → v2 on first save with projectId
    if (existing.version !== 2) {
      existing = {
        version: 2,
        projects: {},
        legacy: Array.isArray(existing.items) ? existing.items.slice(0, 20) : [],
      };
    }

    // Merge current project slice
    if (projectId) {
      existing.projects = existing.projects || {};
      existing.projects[projectId] = nextItems;
    } else {
      existing.legacy = nextItems;
    }

    await fs.writeFile(historyPath, JSON.stringify(existing, null, 2), 'utf-8');
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

function getNovelsDir(): string {
  return path.join(app.getPath('userData'), 'novels');
}

function safeNovelId(id: unknown): string | null {
  if (typeof id !== 'string') return null;
  const trimmed = id.trim();
  return /^[a-zA-Z0-9._-]+$/.test(trimmed) ? trimmed : null;
}

function getNovelDir(id: string): string {
  return path.join(getNovelsDir(), id);
}

function getNovelPath(id: string): string {
  return path.join(getNovelDir(id), 'novel.json');
}

function countNovelWords(text: string): number {
  return Array.from(text.replace(/\s+/g, '')).length;
}

function sanitizeNovel(value: unknown, fallbackId?: string): Novel | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<Novel>;
  const id = safeNovelId(candidate.id) ?? fallbackId;
  if (!id) return null;
  const now = new Date().toISOString();
  const chapters = Array.isArray(candidate.chapters) ? candidate.chapters.map((chapter, index): Chapter | null => {
    if (!chapter || typeof chapter !== 'object') return null;
    const item = chapter as Partial<Chapter>;
    return {
      id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : randomUUID(),
      title: typeof item.title === 'string' ? item.title : '',
      content: typeof item.content === 'string' ? item.content : '',
      outline: typeof item.outline === 'string' ? item.outline : undefined,
      versions: sanitizeChapterVersions(item.versions, now),
      selectedVersionId: typeof item.selectedVersionId === 'string' ? item.selectedVersionId : undefined,
      status: item.status === 'draft' || item.status === 'inProgress' || item.status === 'done' ? item.status : undefined,
      wordTarget: typeof item.wordTarget === 'number' && Number.isFinite(item.wordTarget) && item.wordTarget > 0 ? item.wordTarget : undefined,
      order: Number.isFinite(item.order) ? Number(item.order) : index,
      createdAt: typeof item.createdAt === 'string' ? item.createdAt : now,
      updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : now,
    };
  }).filter((chapter): chapter is Chapter => chapter !== null).sort((a, b) => a.order - b.order) : [];

  return {
    id,
    projectId: safeProjectId(candidate.projectId),
    title: typeof candidate.title === 'string' && candidate.title.trim() ? candidate.title : '\u672a\u547d\u540d\u5c0f\u8bf4',
    summary: typeof candidate.summary === 'string' ? candidate.summary : '',
    note: typeof candidate.note === 'string' ? candidate.note : '',
    idea: typeof candidate.idea === 'string' ? candidate.idea : undefined,
    blueprint: typeof candidate.blueprint === 'string' ? candidate.blueprint : undefined,
    wordTarget: typeof candidate.wordTarget === 'number' && Number.isFinite(candidate.wordTarget) && candidate.wordTarget > 0 ? candidate.wordTarget : undefined,
    chapters,
    foreshadowings: sanitizeForeshadowings(candidate.foreshadowings, now),
    version: 4,
    createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : now,
    updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : now,
  };
}

function sanitizeForeshadowings(value: unknown, now: string): Foreshadowing[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry): Foreshadowing | null => {
    if (!entry || typeof entry !== 'object') return null;
    const item = entry as Partial<Foreshadowing>;
    if (typeof item.title !== 'string' || !item.title.trim()) return null;
    return {
      id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : randomUUID(),
      title: item.title,
      plantedChapterId: typeof item.plantedChapterId === 'string' ? item.plantedChapterId : '',
      status: item.status === 'paidOff' ? 'paidOff' : 'planted',
      payoffChapterId: typeof item.payoffChapterId === 'string' ? item.payoffChapterId : undefined,
      note: typeof item.note === 'string' ? item.note : undefined,
      createdAt: typeof item.createdAt === 'string' ? item.createdAt : now,
      updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : now,
    };
  }).filter((entry): entry is Foreshadowing => entry !== null);
}

function sanitizeChapterVersions(value: unknown, fallbackTime: string): ChapterVersion[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map((entry): ChapterVersion | null => {
    if (!entry || typeof entry !== 'object') return null;
    const item = entry as Partial<ChapterVersion>;
    if (typeof item.content !== 'string') return null;
    return {
      id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : randomUUID(),
      content: item.content,
      createdAt: typeof item.createdAt === 'string' ? item.createdAt : fallbackTime,
    };
  }).filter((entry): entry is ChapterVersion => entry !== null).slice(-5);
}

function toNovelSummary(novel: Novel): NovelSummary {
  return {
    id: novel.id,
    projectId: novel.projectId,
    title: novel.title,
    summary: novel.summary,
    createdAt: novel.createdAt,
    updatedAt: novel.updatedAt,
    chapterCount: novel.chapters.length,
    wordCount: novel.chapters.reduce((sum, chapter) => sum + countNovelWords(chapter.content), 0),
    filledChapterCount: novel.chapters.filter((chapter) => chapter.content.trim() !== '').length,
  };
}

async function listNovels(projectId?: unknown): Promise<{ ok: boolean; message?: string; novels: NovelSummary[] }> {
  const filterProjectId = typeof projectId === 'string' && projectId.trim() ? safeProjectId(projectId) : null;
  try {
    const entries = await fs.readdir(getNovelsDir(), { withFileTypes: true });
    const novels = await Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
      try {
        const raw = await fs.readFile(getNovelPath(entry.name), 'utf-8');
        const novel = sanitizeNovel(JSON.parse(raw), entry.name);
        return novel ? toNovelSummary(novel) : null;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') console.warn('Failed to list novel:', error);
        return null;
      }
    }));
    const all = novels.filter((novel): novel is NovelSummary => novel !== null);
    const scoped = filterProjectId ? all.filter((novel) => (novel.projectId ?? 'default') === filterProjectId) : all;
    return { ok: true, novels: scoped.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { ok: true, novels: [] };
    return { ok: false, message: '\u52a0\u8f7d\u5c0f\u8bf4\u5217\u8868\u5931\u8d25\u3002', novels: [] };
  }
}

async function readNovelFile(id: string): Promise<Novel> {
  const raw = await fs.readFile(getNovelPath(id), 'utf-8');
  const novel = sanitizeNovel(JSON.parse(raw), id);
  if (!novel) throw new Error('\u5c0f\u8bf4\u6587\u4ef6\u635f\u574f\u3002');
  return novel;
}

async function createNovel(input: unknown): Promise<{ ok: boolean; message: string; novel?: Novel }> {
  const candidate = input && typeof input === 'object' ? input as { title?: unknown; summary?: unknown; note?: unknown; projectId?: unknown } : {};
  const now = new Date().toISOString();
  const novel: Novel = {
    id: `novel-${randomUUID()}`,
    projectId: safeProjectId(candidate.projectId),
    title: typeof candidate.title === 'string' && candidate.title.trim() ? candidate.title.trim() : '\u672a\u547d\u540d\u5c0f\u8bf4',
    summary: typeof candidate.summary === 'string' ? candidate.summary : '',
    note: typeof candidate.note === 'string' ? candidate.note : '',
    chapters: [],
    foreshadowings: [],
    version: 4,
    createdAt: now,
    updatedAt: now,
  };
  return saveNovel(novel);
}

async function loadNovel(id: unknown): Promise<{ ok: boolean; message: string; novel?: Novel }> {
  const novelId = safeNovelId(id);
  if (!novelId) return { ok: false, message: '\u5c0f\u8bf4 ID \u65e0\u6548\u3002' };
  try {
    return { ok: true, message: '\u5c0f\u8bf4\u5df2\u52a0\u8f7d\u3002', novel: await readNovelFile(novelId) };
  } catch (error) {
    const message = (error as NodeJS.ErrnoException).code === 'ENOENT' ? '\u5c0f\u8bf4\u6587\u4ef6\u7f3a\u5931\u3002' : '\u5c0f\u8bf4\u6587\u4ef6\u635f\u574f\u3002';
    return { ok: false, message };
  }
}

async function saveNovel(value: unknown): Promise<{ ok: boolean; message: string; novel?: Novel }> {
  const novel = sanitizeNovel(value);
  if (!novel) return { ok: false, message: '\u5c0f\u8bf4\u6570\u636e\u65e0\u6548\u3002' };
  novel.updatedAt = new Date().toISOString();
  const previous = novelSaveQueues.get(novel.id) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(async () => {
    const novelDir = getNovelDir(novel.id);
    const target = getNovelPath(novel.id);
    const temp = path.join(novelDir, 'novel.json.tmp');
    await fs.mkdir(novelDir, { recursive: true });
    await fs.writeFile(temp, JSON.stringify(novel, null, 2), 'utf-8');
    await fs.rename(temp, target);
    return novel;
  });
  novelSaveQueues.set(novel.id, next.catch(() => undefined));
  try {
    return { ok: true, message: '\u5c0f\u8bf4\u5df2\u4fdd\u5b58\u3002', novel: await next };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : '\u4fdd\u5b58\u5c0f\u8bf4\u5931\u8d25\u3002' };
  }
}

async function deleteNovel(id: unknown): Promise<{ ok: boolean; message: string }> {
  const novelId = safeNovelId(id);
  if (!novelId) return { ok: false, message: '\u5c0f\u8bf4 ID \u65e0\u6548\u3002' };
  await novelSaveQueues.get(novelId)?.catch(() => undefined);
  try {
    await fs.rm(getNovelDir(novelId), { recursive: true, force: false });
    return { ok: true, message: '\u5c0f\u8bf4\u5df2\u5220\u9664\u3002' };
  } catch (error) {
    return { ok: false, message: (error as NodeJS.ErrnoException).code === 'ENOENT' ? '\u5c0f\u8bf4\u4e0d\u5b58\u5728\u3002' : '\u5220\u9664\u5c0f\u8bf4\u5931\u8d25\u3002' };
  }
}

function closeAfterNovelFlush(targetWindow: BrowserWindow): void {
  if (targetWindow.isDestroyed()) return;
  if (novelFlushCloseTimer) clearTimeout(novelFlushCloseTimer);
  novelFlushCloseTimer = null;
  isClosingAfterNovelFlush = true;
  targetWindow.close();
}

function sanitizeExportFileName(name: string): string {
  const cleaned = name.replace(/[/\\:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim();
  return cleaned || '未命名小说';
}

function normalizeSaveFileFormat(format: unknown): { extension: string; filterName: string; dialogTitle: string } {
  if (format === 'doc') {
    return { extension: 'doc', filterName: 'Word 文档', dialogTitle: '导出 Word 分镜本' };
  }
  return { extension: 'md', filterName: 'Markdown', dialogTitle: '导出为 Markdown 文件' };
}

function registerIpcHandlers(): void {
  ipcMain.handle('app:get-version', () => app.getVersion());
  ipcMain.handle('app:get-platform', () => process.platform);
  ipcMain.handle('app:load-image-generation-history', (_event, projectId?: string) => loadImageGenerationHistory(projectId));
  ipcMain.handle('app:save-image-generation-history', (_event, projectId: string | undefined, items: unknown) => saveImageGenerationHistory(projectId, items));
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
  ipcMain.handle('novel:list-novels', (_event, projectId: unknown) => listNovels(projectId));
  ipcMain.handle('novel:create-novel', (_event, input: unknown) => createNovel(input));
  ipcMain.handle('novel:load-novel', (_event, id: unknown) => loadNovel(id));
  ipcMain.handle('novel:save-novel', (_event, novel: unknown) => saveNovel(novel));
  ipcMain.handle('novel:delete-novel', (_event, id: unknown) => deleteNovel(id));
  ipcMain.handle('novel:flush-before-close-done', (event) => {
    const targetWindow = BrowserWindow.fromWebContents(event.sender);
    if (targetWindow) closeAfterNovelFlush(targetWindow);
  });
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

  ipcMain.handle('app:open-text-file', async (): Promise<{ ok: boolean; canceled?: boolean; message: string; fileName?: string; content?: string }> => {
    const options: OpenDialogOptions = {
      title: '导入稿件',
      properties: ['openFile'],
      filters: [{ name: '文本稿件', extensions: ['txt', 'md', 'markdown'] }],
    };
    const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options);
    if (result.canceled || !result.filePaths[0]) return { ok: false, canceled: true, message: '已取消导入。' };
    const filePath = result.filePaths[0];
    try {
      const stat = await fs.stat(filePath);
      if (stat.size > 10 * 1024 * 1024) return { ok: false, message: '文件超过 10MB，请拆分后再导入。' };
      const content = await fs.readFile(filePath, 'utf-8');
      return { ok: true, message: '已读取文件。', fileName: path.basename(filePath), content };
    } catch {
      return { ok: false, message: '读取文件失败。' };
    }
  });

  ipcMain.handle('app:save-text-file', async (_event, defaultName: unknown, content: unknown, format: unknown): Promise<{ ok: boolean; message: string; path?: string }> => {
    if (typeof content !== 'string') throw new Error('saveTextFile expects string content.');
    const fmt = normalizeSaveFileFormat(format);
    const safeName = sanitizeExportFileName(typeof defaultName === 'string' ? defaultName : `未命名小说.${fmt.extension}`);
    const options: SaveDialogOptions = {
      title: fmt.dialogTitle,
      defaultPath: safeName,
      filters: [{ name: fmt.filterName, extensions: [fmt.extension] }],
    };
    const result = mainWindow ? await dialog.showSaveDialog(mainWindow, options) : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return { ok: false, message: '已取消导出。' };
    await fs.writeFile(result.filePath, content, 'utf-8');
    return { ok: true, message: '已导出。', path: result.filePath };
  });

  ipcMain.handle('app:save-binary-file', async (_event, defaultName: unknown, data: unknown, kind: unknown): Promise<{ ok: boolean; message: string; path?: string }> => {
    if (!(data instanceof Uint8Array)) throw new Error('saveBinaryFile expects Uint8Array data.');
    const fmt = kind === 'zip'
      ? { extension: 'zip', filterName: 'ZIP 离线包', dialogTitle: '导出离线包' }
      : { extension: 'bin', filterName: '二进制文件', dialogTitle: '导出文件' };
    const safeName = sanitizeExportFileName(typeof defaultName === 'string' ? defaultName : `未命名小说.${fmt.extension}`);
    const options: SaveDialogOptions = {
      title: fmt.dialogTitle,
      defaultPath: safeName,
      filters: [{ name: fmt.filterName, extensions: [fmt.extension] }],
    };
    const result = mainWindow ? await dialog.showSaveDialog(mainWindow, options) : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return { ok: false, message: '已取消导出。' };
    await fs.writeFile(result.filePath, Buffer.from(data));
    return { ok: true, message: '已导出。', path: result.filePath };
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

  ipcMain.handle('api:load-ai-usage', (_event, projectId: unknown) => loadAiUsage(projectId));

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
  ipcMain.handle('api:generate-text', async (event, request: unknown): Promise<ApiTextGenerationResult> => {
    return generateOpenAiCompatibleText(request, event.sender);
  });
  ipcMain.handle('api:cancel-text-generation', (_event, requestId: unknown): { ok: boolean; message: string } => {
    if (typeof requestId !== 'string' || !requestId.trim()) return { ok: false, message: '取消请求缺少 requestId。' };
    const controller = textGenerationControllers.get(requestId);
    if (!controller) return { ok: false, message: '未找到正在执行的文本生成请求。' };
    controller.abort();
    textGenerationControllers.delete(requestId);
    timedOutTextGenerationRequests.delete(requestId);
    return { ok: true, message: '已取消文本生成请求。' };
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
    && (candidate.channelId === undefined || typeof candidate.channelId === 'string')
    && (candidate.channelLabel === undefined || typeof candidate.channelLabel === 'string')
    && (candidate.projectId === undefined || typeof candidate.projectId === 'string')
    && (candidate.requestType === undefined || typeof candidate.requestType === 'string')
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

function isApiTextGenerationRequest(request: unknown): request is ApiTextGenerationRequest {
  if (!request || typeof request !== 'object') return false;
  const candidate = request as Record<string, unknown>;
  return typeof candidate.requestId === 'string'
    && (candidate.channelId === undefined || typeof candidate.channelId === 'string')
    && (candidate.channelLabel === undefined || typeof candidate.channelLabel === 'string')
    && (candidate.projectId === undefined || typeof candidate.projectId === 'string')
    && (candidate.requestType === undefined || typeof candidate.requestType === 'string')
    && typeof candidate.baseUrl === 'string'
    && typeof candidate.apiKey === 'string'
    && typeof candidate.model === 'string'
    && Array.isArray(candidate.messages)
    && candidate.messages.every((message) => {
      if (!message || typeof message !== 'object') return false;
      const item = message as Record<string, unknown>;
      return (item.role === 'system' || item.role === 'user') && typeof item.content === 'string';
    })
    && (candidate.temperature === undefined || typeof candidate.temperature === 'number')
    && (candidate.maxTokens === undefined || typeof candidate.maxTokens === 'number');
}

async function generateOpenAiCompatibleText(request: unknown, sender?: Electron.WebContents): Promise<ApiTextGenerationResult> {
  if (!isApiTextGenerationRequest(request)) return { ok: false, message: '文本生成请求格式无效。' };

  const requestId = request.requestId.trim();
  const baseUrl = request.baseUrl.trim();
  const apiKey = request.apiKey.trim();
  const model = request.model.trim();
  const messages = request.messages.map((message) => ({ role: message.role, content: message.content.trim() })).filter((message) => message.content);

  if (!requestId) return { ok: false, message: '文本生成请求 ID 缺失。' };
  if (!baseUrl) return { ok: false, message: '请填写 Base URL。' };
  if (!apiKey) return { ok: false, message: '请填写 API Key。' };
  if (!model) return { ok: false, message: '请选择文本模型。' };
  if (!messages.length) return { ok: false, message: '请输入文本生成上下文。' };

  let url: URL;
  try {
    url = new URL(`${baseUrl.replace(/\/+$/, '')}/chat/completions`);
  } catch {
    return { ok: false, message: 'Base URL 格式无效。' };
  }

  // 流式仅在 stream:true 且拿得到 renderer sender 时启用；否则回落一次性路径（回归零变化）。
  const streaming = request.stream === true && sender !== undefined && !sender.isDestroyed();

  textGenerationControllers.get(requestId)?.abort();
  const controller = new AbortController();
  textGenerationControllers.set(requestId, controller);
  const timeout = setTimeout(() => {
    timedOutTextGenerationRequests.add(requestId);
    controller.abort();
  }, 60_000);

  // 仅当 sender 仍存活时推送流式事件，避免向已销毁的 webContents 发送。
  const emit = (event: TextStreamEvent) => {
    if (sender && !sender.isDestroyed()) sender.send('api:text-generation-chunk', event);
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: streaming ? 'text/event-stream' : 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: Number.isFinite(request.temperature) ? request.temperature : 0.8,
        max_tokens: Number.isFinite(request.maxTokens) ? request.maxTokens : 700,
        ...(streaming ? { stream: true, stream_options: { include_usage: true } } : {}),
      }),
      signal: controller.signal,
    });

    if (streaming) {
      // HTTP 层错误：流式下也走一次性错误读取（body 是 JSON 错误体，不是 SSE）。
      if (!response.ok || !response.body) {
        const parsed = await readTextGenerationResponse(response, apiKey);
        await safeRecordAiUsage(request, {}, false);
        const message = parsed.errorMessage ?? `文本生成失败：HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}。`;
        emit({ type: 'error', requestId, message });
        return { ok: false, status: response.status, message };
      }

      const streamResult = await consumeTextEventStream(response.body, emit, requestId);
      const text = streamResult.text.trim();
      // usage 缺失时按字符估算（PO 拍板：不记 0）；prompt 侧用入参消息字符数估算。
      const inputTokens = streamResult.inputTokens > 0 ? streamResult.inputTokens : estimateTokensFromText(messages.map((m) => m.content).join('\n'));
      const outputTokens = streamResult.outputTokens > 0 ? streamResult.outputTokens : estimateTokensFromText(text);
      await safeRecordAiUsage({ ...request, model }, { inputTokens, outputTokens }, Boolean(text));

      if (!text) {
        emit({ type: 'error', requestId, message: '文本生成接口返回了空结果。' });
        return { ok: false, status: response.status, message: '文本生成接口返回了空结果。' };
      }
      emit({ type: 'done', requestId, text, inputTokens, outputTokens });
      return { ok: true, status: response.status, message: '文本生成完成。', text };
    }

    const parsed = await readTextGenerationResponse(response, apiKey);
    const usage = { inputTokens: parsed.inputTokens, outputTokens: parsed.outputTokens };
    await safeRecordAiUsage(request, usage, response.ok && Boolean(parsed.text));

    if (!response.ok) return { ok: false, status: response.status, message: parsed.errorMessage ?? `文本生成失败：HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}。` };
    if (!parsed.text) return { ok: false, status: response.status, message: '文本生成接口返回了空结果。' };
    return { ok: true, status: response.status, message: '文本生成完成。', text: parsed.text };
  } catch (error) {
    await safeRecordAiUsage(request, {}, false);
    if (error instanceof Error && error.name === 'AbortError') {
      const aborted = timedOutTextGenerationRequests.has(requestId);
      if (streaming) emit({ type: 'aborted', requestId, reason: aborted ? 'timeout' : 'cancel' });
      return { ok: false, message: aborted ? '文本生成请求超时，请稍后重试或检查服务状态。' : '文本生成请求已取消。' };
    }
    const message = error instanceof Error ? `文本生成失败：${redactSecret(error.message, apiKey)}` : '文本生成失败：未知错误。';
    if (streaming) emit({ type: 'error', requestId, message });
    return { ok: false, message };
  } finally {
    clearTimeout(timeout);
    if (textGenerationControllers.get(requestId) === controller) textGenerationControllers.delete(requestId);
    timedOutTextGenerationRequests.delete(requestId);
  }
}

// 粗略 token 估算：usage 缺失时的兜底（中英文混排按 ~2 字符/token）。仅用于成本估算量级，非精确账单。
function estimateTokensFromText(text: string): number {
  const length = text?.length ?? 0;
  return length > 0 ? Math.ceil(length / 2) : 0;
}

// 消费 OpenAI 兼容的 text/event-stream：处理 TCP 分包、data: 行、[DONE] 哨兵，累积 delta 与 usage。
async function consumeTextEventStream(
  body: ReadableStream<Uint8Array>,
  emit: (event: TextStreamEvent) => void,
  requestId: string,
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let inputTokens = 0;
  let outputTokens = 0;

  const handleData = (payload: string) => {
    if (payload === '[DONE]') return;
    let json: unknown;
    try {
      json = JSON.parse(payload);
    } catch {
      return; // 半行/非法 JSON 由 buffer 逻辑保证不会到这（只处理完整行），保险起见忽略。
    }
    const record = json as { choices?: Array<{ delta?: { content?: unknown } }>; usage?: Record<string, unknown> };
    const delta = record.choices?.[0]?.delta?.content;
    if (typeof delta === 'string' && delta.length > 0) {
      text += delta;
      emit({ type: 'delta', requestId, delta });
    }
    const usage = record.usage;
    if (usage && typeof usage === 'object') {
      if (typeof usage.prompt_tokens === 'number') inputTokens = usage.prompt_tokens;
      if (typeof usage.completion_tokens === 'number') outputTokens = usage.completion_tokens;
    }
  };

  // 逐行拆分：SSE 事件以空行分隔，data 字段以 "data:" 开头；一个 chunk 可能含半行或多行。
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newlineIndex: number;
    while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newlineIndex).replace(/\r$/, '').trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line.startsWith('data:')) handleData(line.slice(5).trim());
    }
  }
  // 冲刷残留缓冲（末尾可能无换行）。
  const tail = buffer.replace(/\r$/, '').trim();
  if (tail.startsWith('data:')) handleData(tail.slice(5).trim());

  return { text, inputTokens, outputTokens };
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
      await safeRecordAiUsage(request, {}, false);
      return {
        ok: false,
        status: response.status,
        message: parsed.errorMessage ?? `生图失败：HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}。`,
      };
    }

    if (!parsed.images.length) {
      await safeRecordAiUsage(request, {}, false);
      return {
        ok: false,
        status: response.status,
        message: '生图接口返回了空结果。',
      };
    }

    const images = await saveGeneratedImagesLocally(parsed.images, request.saveDirectory);
    await safeRecordAiUsage(request, {}, true);

    return {
      ok: true,
      status: response.status,
      message: `生图成功，返回 ${images.length} 张图片。`,
      images,
    };
  } catch (error) {
    await safeRecordAiUsage(request, {}, false);
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

async function readTextGenerationResponse(response: Response, apiKey: string): Promise<{ text?: string; errorMessage?: string; inputTokens?: number; outputTokens?: number }> {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) return { errorMessage: '文本生成接口返回了非 JSON 响应。' };

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { errorMessage: '文本生成接口返回了无效 JSON。' };
  }

  const errorMessage = readTextProviderErrorMessage(body, apiKey);
  const usage = (body as { usage?: unknown }).usage;
  const usageRecord = usage && typeof usage === 'object' ? usage as Record<string, unknown> : {};
  const promptTokens = typeof usageRecord.prompt_tokens === 'number' ? usageRecord.prompt_tokens : 0;
  const completionTokens = typeof usageRecord.completion_tokens === 'number' ? usageRecord.completion_tokens : 0;
  const choices = (body as { choices?: unknown }).choices;
  if (!Array.isArray(choices)) return { errorMessage, inputTokens: promptTokens, outputTokens: completionTokens };
  const first = choices[0] as { message?: { content?: unknown }; text?: unknown } | undefined;
  const text = typeof first?.message?.content === 'string' ? first.message.content : typeof first?.text === 'string' ? first.text : '';
  return { text: text.trim(), errorMessage, inputTokens: promptTokens, outputTokens: completionTokens };
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

function readTextProviderErrorMessage(body: unknown, apiKey: string): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const error = (body as { error?: unknown }).error;
  if (!error || typeof error !== 'object') return undefined;
  const message = (error as { message?: unknown }).message;
  return typeof message === 'string' && message.trim()
    ? `文本生成失败：${redactSecret(message.trim(), apiKey)}`
    : undefined;
}

function redactSecret(message: string, secret: string): string {
  let redacted = secret ? message.replaceAll(secret, '[redacted]') : message;
  redacted = redacted.replace(/\brequest[\s_-]*body\b[\s\S]*/gi, '[redacted]');
  redacted = redacted.replace(/\bAuthorization\s*:?\s*Bearer\s+[^\s,;}]+/gi, '[redacted]');
  redacted = redacted.replace(/\bBearer\s+[^\s,;}]+/gi, '[redacted]');
  return redacted.replace(/\b(Authorization|Bearer)\b/gi, '[redacted]').trim();
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
