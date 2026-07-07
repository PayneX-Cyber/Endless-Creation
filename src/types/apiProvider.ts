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
}

export interface ApiTextGenerationResult {
  ok: boolean;
  status?: number;
  message: string;
  text?: string;
}

export interface ApiTextGenerationCancelResult {
  ok: boolean;
  message: string;
}

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
