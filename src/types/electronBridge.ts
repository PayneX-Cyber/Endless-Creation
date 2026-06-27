import type { ApiConnectionTestResult, ApiProviderConfig } from './apiProvider';

export interface EndlessCreationBridge {
  app: {
    getVersion(): Promise<string>;
    getPlatform(): Promise<string>;
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
  };
}

