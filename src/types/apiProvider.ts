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
  // 流式开关：默认 undefined/false 走原有一次性路径（回归零变化）。
  // 为 true 时主进程走 SSE，逐块通过 api:text-generation-chunk 事件回推，invoke 返回值仅表示「启动结果」。
  stream?: boolean;
}

export interface ApiTextGenerationResult {
  ok: boolean;
  status?: number;
  message: string;
  text?: string;
}

// 流式文本事件信封：每个事件必带 requestId，renderer 侧据此过滤过期流（防串线）。
// 终态三选一互斥：done / error / aborted，收到任一即该 requestId 生命周期结束。
export type TextStreamEvent =
  | { type: 'delta'; requestId: string; delta: string }
  | { type: 'done'; requestId: string; text: string; inputTokens: number; outputTokens: number }
  | { type: 'error'; requestId: string; message: string }
  | { type: 'aborted'; requestId: string; reason: 'cancel' | 'timeout' };

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
