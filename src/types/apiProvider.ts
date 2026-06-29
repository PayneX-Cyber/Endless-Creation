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
