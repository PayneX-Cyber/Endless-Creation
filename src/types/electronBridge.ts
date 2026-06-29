import type { ApiConnectionTestResult, ApiImageGenerationCancelResult, ApiImageGenerationRequest, ApiImageGenerationResult, ApiProviderConfig } from './apiProvider';
import type { DesktopAiClient } from './workspace';

export interface EndlessCreationBridge {
  app: {
    getVersion(): Promise<string>;
    getPlatform(): Promise<string>;
    openGeneratedImageLocation(localPath?: string): Promise<{ ok: boolean; message: string }>;
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
  };
  ai?: DesktopAiClient;
}
