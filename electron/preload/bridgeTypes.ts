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
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: Array<{ role: 'system' | 'user'; content: string }>;
  temperature?: number;
  maxTokens?: number;
}

export interface ApiTextGenerationResult {
  ok: boolean;
  status?: number;
  message: string;
  text?: string;
}

export interface ChapterVersion {
  id: string;
  content: string;
  createdAt: string;
}

export interface Chapter {
  id: string;
  title: string;
  content: string;
  outline?: string;
  versions?: ChapterVersion[];
  selectedVersionId?: string;
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

export interface Novel {
  id: string;
  title: string;
  summary: string;
  note: string;
  idea?: string;
  blueprint?: string;
  chapters: Chapter[];
  foreshadowings: Foreshadowing[];
  version: 4;
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
    loadImageGenerationHistory(): Promise<{ ok: boolean; items: unknown[] }>;
    saveImageGenerationHistory(items: unknown[]): Promise<{ ok: boolean; message: string }>;
    readGeneratedImageDataUrl(localPath: string): Promise<{ ok: boolean; message: string; dataUrl?: string }>;
    openGeneratedImageLocation(localPath?: string): Promise<{ ok: boolean; message: string }>;
    selectGeneratedImagesDirectory(currentPath?: string): Promise<{ ok: boolean; message: string; path?: string }>;
    loadProjectAssets(projectId: string): Promise<{ ok: boolean; message: string; collection?: unknown }>;
    saveProjectAssets(projectId: string, collection: unknown): Promise<{ ok: boolean; message: string }>;
    deleteProjectAssetFile(projectId: string, relativePath: string): Promise<{ ok: boolean; message: string }>;
    importProjectImageAsset(projectId: string, input: { fileName: string; mimeType: string; dataUrl: string }): Promise<{ ok: boolean; message: string; assetData?: { fileName: string; relativePath: string; mimeType: string; bytes: number } }>;
    readProjectAssetImageDataUrl(projectId: string, relativePath: string): Promise<{ ok: boolean; message: string; dataUrl?: string }>;
    saveTextFile(defaultName: string, content: string): Promise<{ ok: boolean; message: string; path?: string }>;
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
    generateImage(request: ApiImageGenerationRequest): Promise<ApiImageGenerationResult>;
    cancelImageGeneration(requestId: string): Promise<ApiImageGenerationCancelResult>;
    generateText(request: ApiTextGenerationRequest): Promise<ApiTextGenerationResult>;
    cancelTextGeneration(requestId: string): Promise<ApiImageGenerationCancelResult>;
  };
  novel: {
    listNovels(): Promise<{ ok: boolean; message?: string; novels: NovelSummary[] }>;
    createNovel(input: { title: string; summary?: string; note?: string }): Promise<{ ok: boolean; message: string; novel?: Novel }>;
    loadNovel(id: string): Promise<{ ok: boolean; message: string; novel?: Novel }>;
    saveNovel(novel: Novel): Promise<{ ok: boolean; message: string; novel?: Novel }>;
    deleteNovel(id: string): Promise<{ ok: boolean; message: string }>;
    onFlushBeforeClose?(callback: () => Promise<void> | void): () => void;
    finishFlushBeforeClose?(): Promise<void>;
  };
}

