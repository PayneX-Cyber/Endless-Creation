import { rendererBridge } from './rendererBridge';
import type { AssetPatch, ImageAsset, ProjectAsset, ProjectAssetCollection, TextAsset, TextAssetInput } from '../types/projectAssets';

const queues = new Map<string, Promise<unknown>>();

export const projectAssetService = {
  async listAssets(projectId: string): Promise<ProjectAsset[]> {
    return loadCollection(projectId).then((collection) => collection.assets);
  },

  async createTextAsset(projectId: string, input: TextAssetInput): Promise<TextAsset> {
    return mutate(projectId, (assets) => {
      const now = new Date().toISOString();
      const asset: TextAsset = {
        id: createAssetId(),
        kind: 'text',
        title: input.title.trim() || '未命名文本',
        tags: normalizeTags(input.tags ?? []),
        source: input.source ?? 'manual',
        note: input.note?.trim() || undefined,
        status: 'ready',
        createdAt: now,
        updatedAt: now,
        data: { content: input.content },
      };
      return { assets: [asset, ...assets], result: asset };
    });
  },

  async importImageAsset(projectId: string, file: File): Promise<ImageAsset> {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('\u4ec5\u652f\u6301\u5bfc\u5165 PNG/JPEG/WebP \u56fe\u7247\u3002');
    if (file.size > 10 * 1024 * 1024) throw new Error('\u56fe\u7247\u4e0d\u80fd\u8d85\u8fc7 10MB\u3002');
    const dataUrl = await fileToDataUrl(file);
    return mutate(projectId, async (assets) => {
      const imported = await rendererBridge.importProjectImageAsset(projectId, { fileName: file.name, mimeType: file.type, dataUrl });
      if (!imported.ok || !imported.assetData) throw new Error(imported.message);
      const now = new Date().toISOString();
      const asset: ImageAsset = {
        id: createAssetId(),
        kind: 'image',
        title: titleFromFileName(imported.assetData.fileName),
        tags: [],
        source: 'manual',
        status: 'ready',
        createdAt: now,
        updatedAt: now,
        data: imported.assetData,
      };
      return { assets: [asset, ...assets], result: asset };
    });
  },

  async readImageAssetDataUrl(projectId: string, asset: ImageAsset): Promise<string> {
    const result = await rendererBridge.readProjectAssetImageDataUrl(projectId, asset.data.relativePath);
    if (!result.ok || !result.dataUrl) throw new Error(result.message);
    return result.dataUrl;
  },


  async updateAsset(projectId: string, assetId: string, patch: AssetPatch): Promise<ProjectAsset> {
    return mutate(projectId, (assets) => {
      const index = assets.findIndex((asset) => asset.id === assetId);
      if (index < 0) throw new Error('资产不存在。');
      const current = assets[index];
      const next: ProjectAsset = current.kind === 'text'
        ? {
            ...current,
            title: patch.title?.trim() || current.title,
            tags: patch.tags ? normalizeTags(patch.tags) : current.tags,
            note: patch.note !== undefined ? patch.note.trim() || undefined : current.note,
            source: patch.source ?? current.source,
            status: patch.status ?? current.status,
            updatedAt: new Date().toISOString(),
            data: { content: patch.data?.content ?? current.data.content },
          }
        : {
            ...current,
            title: patch.title?.trim() || current.title,
            tags: patch.tags ? normalizeTags(patch.tags) : current.tags,
            note: patch.note !== undefined ? patch.note.trim() || undefined : current.note,
            source: patch.source ?? current.source,
            status: patch.status ?? current.status,
            updatedAt: new Date().toISOString(),
          };
      const nextAssets = assets.slice();
      nextAssets[index] = next;
      return { assets: nextAssets, result: next };
    });
  },

  async deleteAsset(projectId: string, assetId: string): Promise<void> {
    await mutate(projectId, async (assets) => {
      const target = assets.find((asset) => asset.id === assetId);
      if (!target) return { assets, result: undefined };
      const nextAssets = assets.filter((asset) => asset.id !== assetId);
      if (target.kind === 'image') await rendererBridge.deleteProjectAssetFile(projectId, target.data.relativePath);
      return { assets: nextAssets, result: undefined };
    });
  },

  async searchAssets(projectId: string, query: string, kind?: ProjectAsset['kind']): Promise<ProjectAsset[]> {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const assets = await this.listAssets(projectId);
    return assets.filter((asset) => (!kind || asset.kind === kind) && terms.every((term) => assetSearchText(asset).includes(term)));
  },

  async flush(projectId: string): Promise<void> {
    await queues.get(projectId);
  },
};

async function mutate<T>(projectId: string, update: (assets: ProjectAsset[]) => { assets: ProjectAsset[]; result: T } | Promise<{ assets: ProjectAsset[]; result: T }>): Promise<T> {
  const previous = queues.get(projectId) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(async () => {
    const collection = await loadCollectionDirect(projectId);
    const { assets, result } = await update(collection.assets);
    await saveCollection(projectId, { version: 1, assets });
    return result;
  });
  queues.set(projectId, next.catch(() => undefined));
  return next;
}

async function loadCollection(projectId: string): Promise<ProjectAssetCollection> {
  await queues.get(projectId)?.catch(() => undefined);
  return loadCollectionDirect(projectId);
}

async function loadCollectionDirect(projectId: string): Promise<ProjectAssetCollection> {
  const result = await rendererBridge.loadProjectAssets(projectId);
  return sanitizeCollection(result.collection);
}

async function saveCollection(projectId: string, collection: ProjectAssetCollection): Promise<void> {
  const result = await rendererBridge.saveProjectAssets(projectId, collection);
  if (!result.ok) throw new Error(result.message);
}

function sanitizeCollection(value: unknown): ProjectAssetCollection {
  const collection = value && typeof value === 'object' ? value as { assets?: unknown } : {};
  return { version: 1, assets: Array.isArray(collection.assets) ? collection.assets.map(sanitizeAsset).filter((asset): asset is ProjectAsset => asset !== null) : [] };
}

function sanitizeAsset(value: unknown): ProjectAsset | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as ProjectAsset;
  if (!candidate.id || !candidate.title || !candidate.createdAt || !candidate.updatedAt) return null;
  const base = {
    id: String(candidate.id),
    title: String(candidate.title),
    tags: normalizeTags(candidate.tags),
    source: candidate.source,
    note: candidate.note,
    status: candidate.status ?? 'ready',
    createdAt: String(candidate.createdAt),
    updatedAt: String(candidate.updatedAt),
  };
  if (candidate.kind === 'text') return { ...base, kind: 'text', data: { content: String(candidate.data?.content ?? '') } };
  if (candidate.kind === 'image' && candidate.data?.relativePath && candidate.data?.fileName && candidate.data?.mimeType) return { ...base, kind: 'image', data: { fileName: String(candidate.data.fileName), relativePath: String(candidate.data.relativePath), mimeType: String(candidate.data.mimeType), bytes: Number(candidate.data.bytes) || 0, width: candidate.data.width, height: candidate.data.height, thumbnailPath: candidate.data.thumbnailPath } };
  return null;
}

function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  return Array.from(new Set(tags.map((tag) => String(tag).trim()).filter(Boolean))).slice(0, 12);
}

function assetSearchText(asset: ProjectAsset): string {
  const fields = [asset.title, asset.note, asset.source, ...asset.tags];
  if (asset.kind === 'text') fields.push(asset.data.content);
  if (asset.kind === 'image') fields.push(asset.data.fileName);
  return fields.filter(Boolean).join(' ').toLowerCase();
}

function titleFromFileName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').trim() || '\u672a\u547d\u540d\u56fe\u7247';
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('\u56fe\u7247\u8f6c\u6362\u5931\u8d25\u3002'));
    reader.onerror = () => reject(reader.error ?? new Error('\u56fe\u7247\u8f6c\u6362\u5931\u8d25\u3002'));
    reader.readAsDataURL(file);
  });
}

function createAssetId(): string {
  return `asset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
