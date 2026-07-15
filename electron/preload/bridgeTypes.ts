export interface ApiProviderConfig {
  id: string;
  label: string;
  type: 'openai-compatible';
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
  enabled: boolean;
  lastTestedAt?: string;
  lastTestStatus?: 'untested' | 'testing' | 'success' | 'failed';
}

export interface ApiConnectionTestResult {
  ok: boolean;
  status?: number;
  message: string;
  models?: string[];
}

export interface ApiImageGenerationRequest {
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
  referenceImages?: { id: string; name?: string; dataUrl: string }[];
}

export interface ApiGeneratedImage {
  b64Json?: string;
  url?: string;
  revisedPrompt?: string;
  localPath?: string;
  fileName?: string;
  mimeType?: string;
}

export interface ApiImageGenerationResult {
  ok: boolean;
  status?: number;
  message: string;
  images?: ApiGeneratedImage[];
}

export interface ApiImageGenerationCancelResult {
  ok: boolean;
  message: string;
}

export interface ApiTextGenerationRequest {
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

export interface ApiTextGenerationResult {
  ok: boolean;
  status?: number;
  message: string;
  text?: string;
}

export type TextStreamEvent =
  | { type: 'delta'; requestId: string; delta: string }
  | { type: 'done'; requestId: string; text: string; inputTokens: number; outputTokens: number }
  | { type: 'error'; requestId: string; message: string }
  | { type: 'aborted'; requestId: string; reason: 'cancel' | 'timeout' };

export interface AiUsageRecord {
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

export interface AiUsageListResult {
  ok: boolean;
  message: string;
  records: AiUsageRecord[];
}

export interface ChapterVersion {
  id: string;
  content: string;
  createdAt: string;
}

export type ChapterStatus = 'draft' | 'inProgress' | 'done';

export interface Volume {
  id: string;
  title: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface Scene {
  id: string;
  title: string;
  outline?: string;
  content: string;
  order: number;
  versions?: ChapterVersion[];
  selectedVersionId?: string;
}

export interface Chapter {
  id: string;
  title: string;
  scenes: Scene[];
  outline?: string;
  status?: ChapterStatus;
  wordTarget?: number;
  volumeId?: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface Foreshadowing {
  id: string;
  title: string;
  plantedChapterId: string;
  status: 'planted' | 'paidOff';
  payoffChapterId?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export type SettingType = 'character' | 'location' | 'organization' | 'item' | 'term' | 'rule' | 'other';

export interface SettingEntry {
  id: string;
  type: SettingType;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface EmotionPoint {
  chapterId: string;
  score: number;
  reason: string;
  updatedAt: string;
}

export interface EmotionArc {
  points: EmotionPoint[];
  updatedAt: string;
}

export interface GraphCharacter {
  name: string;
  role: string;
  description: string;
}

export interface GraphRelationship {
  from: string;
  to: string;
  label: string;
}

export interface CharacterGraph {
  characters: GraphCharacter[];
  relationships: GraphRelationship[];
}

export interface Novel {
  id: string;
  title: string;
  summary: string;
  note: string;
  idea?: string;
  blueprint?: string;
  wordTarget?: number;
  volumes: Volume[];
  chapters: Chapter[];
  foreshadowings: Foreshadowing[];
  settings?: SettingEntry[];
  pinnedSettingIds?: string[];
  pinnedForeshadowingIds?: string[];
  emotionArc?: EmotionArc;
  characterGraph?: CharacterGraph;
  version: 8;
  createdAt: string;
  updatedAt: string;
}

export type NovelSummary = Pick<Novel, 'id' | 'title' | 'summary' | 'createdAt' | 'updatedAt'> & {
  chapterCount: number;
  wordCount: number;
};

export interface EndlessCreationBridge {
  app: {
    getVersion(): Promise<string>;
    getPlatform(): Promise<string>;
    loadImageGenerationHistory(projectId?: string): Promise<{ ok: boolean; items: unknown[] }>;
    saveImageGenerationHistory(projectId: string | undefined, items: unknown[]): Promise<{ ok: boolean; message: string }>;
    readGeneratedImageDataUrl(localPath: string): Promise<{ ok: boolean; message: string; dataUrl?: string }>;
    openGeneratedImageLocation(localPath?: string): Promise<{ ok: boolean; message: string }>;
    selectGeneratedImagesDirectory(currentPath?: string): Promise<{ ok: boolean; message: string; path?: string }>;
    loadProjectAssets(projectId: string): Promise<{ ok: boolean; message: string; collection?: unknown }>;
    saveProjectAssets(projectId: string, collection: unknown): Promise<{ ok: boolean; message: string }>;
    deleteProjectAssetFile(projectId: string, relativePath: string): Promise<{ ok: boolean; message: string }>;
    importProjectImageAsset(projectId: string, input: { fileName: string; mimeType: string; dataUrl: string }): Promise<{ ok: boolean; message: string; assetData?: { fileName: string; relativePath: string; mimeType: string; bytes: number } }>;
    readProjectAssetImageDataUrl(projectId: string, relativePath: string): Promise<{ ok: boolean; message: string; dataUrl?: string }>;
    saveTextFile(defaultName: string, content: string, format?: 'md' | 'doc'): Promise<{ ok: boolean; message: string; path?: string }>;
    saveBinaryFile(defaultName: string, data: Uint8Array, kind?: 'zip'): Promise<{ ok: boolean; message: string; path?: string }>;
    openTextFile(): Promise<{ ok: boolean; canceled?: boolean; message: string; fileName?: string; content?: string }>;
  };
  window: {
    minimize(): Promise<void>;
    maximize(): Promise<void>;
    close(): Promise<void>;
  };
  clipboard: {
    writeText(text: string): Promise<void>;
  };
  api: {
    testConnection(config: ApiProviderConfig): Promise<ApiConnectionTestResult>;
    loadAiUsage(projectId?: string): Promise<AiUsageListResult>;
    generateImage(request: ApiImageGenerationRequest): Promise<ApiImageGenerationResult>;
    cancelImageGeneration(requestId: string): Promise<ApiImageGenerationCancelResult>;
    generateText(request: ApiTextGenerationRequest): Promise<ApiTextGenerationResult>;
    cancelTextGeneration(requestId: string): Promise<ApiImageGenerationCancelResult>;
    onTextGenerationChunk(callback: (event: TextStreamEvent) => void): () => void;
  };
  novel: {
    listNovels(projectId?: string): Promise<{ ok: boolean; message?: string; novels: NovelSummary[] }>;
    createNovel(input: { title: string; summary?: string; note?: string; projectId?: string }): Promise<{ ok: boolean; message: string; novel?: Novel }>;
    loadNovel(id: string): Promise<{ ok: boolean; message: string; novel?: Novel }>;
    saveNovel(novel: Novel): Promise<{ ok: boolean; message: string; novel?: Novel }>;
    deleteNovel(id: string): Promise<{ ok: boolean; message: string }>;
    onFlushBeforeClose?(callback: () => Promise<void> | void): () => void;
    finishFlushBeforeClose?(): Promise<void>;
  };
}

