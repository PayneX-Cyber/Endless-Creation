import type { AiUsageListResult, ApiConnectionTestResult, ApiImageGenerationCancelResult, ApiImageGenerationRequest, ApiImageGenerationResult, ApiProviderConfig, ApiTextGenerationCancelResult, ApiTextGenerationRequest, ApiTextGenerationResult, TextStreamEvent } from './apiProvider';
import type { Novel, NovelListResult, NovelResult } from './novel';

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
    cancelTextGeneration(requestId: string): Promise<ApiTextGenerationCancelResult>;
    onTextGenerationChunk(callback: (event: TextStreamEvent) => void): () => void;
  };
  novel: {
    listNovels(projectId?: string): Promise<NovelListResult>;
    createNovel(input: { title: string; summary?: string; note?: string; projectId?: string }): Promise<NovelResult>;
    loadNovel(id: string): Promise<NovelResult>;
    saveNovel(novel: Novel): Promise<NovelResult>;
    deleteNovel(id: string): Promise<{ ok: boolean; message: string }>;
    onFlushBeforeClose?(callback: () => Promise<void> | void): () => void;
    finishFlushBeforeClose?(): Promise<void>;
  };
}
