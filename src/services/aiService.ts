import type { GenerationMode, GenerationResult, GenerationTask, GenerationTaskStatus } from '../types/workspace';

export interface AiServiceStatus {
  connected: boolean;
  provider: string;
  note: string;
}

export const aiServiceStatus: AiServiceStatus = {
  connected: false,
  provider: 'Mock AI Client',
  note: 'v0.2 使用异步 mock client 模拟生成任务，未来可替换为真实 AI API。',
};

export interface CreateGenerationTaskInput {
  mode: GenerationMode;
  prompt: string;
}

const MODE_LABEL: Record<GenerationMode, string> = {
  text: '文本生成',
  image: '图片生成',
  video: '视频生成',
  library: '项目库整理',
};

export async function createGenerationTask(input: CreateGenerationTaskInput): Promise<GenerationTask> {
  const now = new Date().toISOString();
  const baseTask: GenerationTask = {
    id: createTaskId(),
    mode: input.mode,
    prompt: input.prompt,
    status: 'queued',
    createdAt: now,
    updatedAt: now,
  };

  await wait(650 + Math.random() * 850);

  const status = pickMockStatus();
  const updatedAt = new Date().toISOString();

  if (status === 'failed') {
    return {
      ...baseTask,
      status,
      updatedAt,
      errorMessage: 'Mock AI 暂时没有生成成功。请调整提示词后重试。',
    };
  }

  return {
    ...baseTask,
    status,
    updatedAt,
    result: createMockResult(input.mode, input.prompt, status),
  };
}

function pickMockStatus(): GenerationTaskStatus {
  const roll = Math.random();
  if (roll < 0.12) return 'failed';
  if (roll < 0.22) return 'queued';
  if (roll < 0.34) return 'running';
  return 'succeeded';
}

function createMockResult(mode: GenerationMode, prompt: string, status: GenerationTaskStatus): GenerationResult {
  const normalizedPrompt = prompt.trim();
  const label = MODE_LABEL[mode];
  const statusPrefix = status === 'succeeded' ? '已完成' : status === 'running' ? '模拟运行中' : '模拟排队中';

  return {
    title: `${label} · ${statusPrefix}`,
    summary: `围绕“${normalizedPrompt.slice(0, 34)}${normalizedPrompt.length > 34 ? '…' : ''}”生成了一个可继续编辑的 mock 方案。`,
    content: [
      `【${label} Mock 结果】`,
      `创作目标：${normalizedPrompt}`,
      '建议方向：先明确核心受众，再拆分为主题、结构、素材与输出格式。',
      '下一步：可以把这条结果转为项目草稿，补充风格参考、限制条件和验收标准。',
    ].join('\n'),
  };
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

function createTaskId(): string {
  if (typeof globalThis.crypto !== 'undefined' && 'randomUUID' in globalThis.crypto) {
    return globalThis.crypto.randomUUID();
  }

  return `mock-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

