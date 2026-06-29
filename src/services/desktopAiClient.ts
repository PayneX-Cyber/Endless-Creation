import type {
  CopyGenerationResult,
  CopyGenerationResultInput,
  CreateGenerationTaskInput,
  DesktopAiClient,
  GenerationMode,
  GenerationResult,
  GenerationTask,
  GenerationTaskStatus,
  RetryGenerationTaskInput,
} from '../types/workspace';

const taskStore = new Map<string, GenerationTask>();

const MODE_LABEL: Record<GenerationMode, string> = {
  text: '文本生成',
  image: '图片生成',
  video: '视频生成',
  library: '项目库整理',
};

/**
 * Renderer-facing AI bridge adapter.
 *
 * v0.3 keeps generation fully mocked. If a future Electron preload exposes
 * `endlessCreationBridge.ai`, this adapter can delegate to main-process IPC
 * without changing React components.
 */
export const desktopAiClient: DesktopAiClient = {
  async createGenerationTask(input) {
    const bridge = getBridgeAi();
    if (bridge) return bridge.createGenerationTask(input);

    return createMockGenerationTask(input);
  },

  async getGenerationTask(taskId) {
    const bridge = getBridgeAi();
    if (bridge) return bridge.getGenerationTask(taskId);

    const task = taskStore.get(taskId);
    if (!task) throw new Error(`Generation task not found: ${taskId}`);
    return task;
  },

  async retryGenerationTask(input) {
    const bridge = getBridgeAi();
    if (bridge) return bridge.retryGenerationTask(input);

    const source = taskStore.get(input.taskId);
    if (!source) throw new Error(`Generation task not found: ${input.taskId}`);

    const nextInput = { ...source.input, ...input.overrides } as CreateGenerationTaskInput;
    const retryTask = await createMockGenerationTask(nextInput, {
      retryOfTaskId: source.id,
      retryCount: (source.retryCount ?? 0) + 1,
    });

    return retryTask;
  },

  async copyGenerationResult(input) {
    const bridge = getBridgeAi();
    if (bridge) return bridge.copyGenerationResult(input);

    const task = taskStore.get(input.taskId);
    if (!task?.result) throw new Error(`Generation task is not ready: ${input.taskId}`);

    return formatCopyResult(task, input);
  },
};

async function createMockGenerationTask(
  input: CreateGenerationTaskInput,
  retry?: Pick<GenerationTask, 'retryOfTaskId' | 'retryCount'>,
): Promise<GenerationTask> {
  const now = new Date().toISOString();
  const task: GenerationTask = {
    id: createTaskId(),
    mode: input.type,
    type: input.type,
    prompt: input.prompt,
    input,
    status: 'queued',
    progress: { percent: 0, stage: 'queued', message: 'Mock task queued' },
    createdAt: now,
    updatedAt: now,
    projectId: input.projectId,
    providerId: 'mock-desktop-ai',
    retryCount: retry?.retryCount ?? 0,
    retryOfTaskId: retry?.retryOfTaskId,
  };

  taskStore.set(task.id, task);

  await wait(450 + Math.random() * 550);

  const status = pickMockStatus();
  const updatedAt = new Date().toISOString();
  const updatedTask: GenerationTask =
    status === 'failed'
      ? {
          ...task,
          status,
          updatedAt,
          completedAt: updatedAt,
          progress: { percent: 100, stage: 'finalizing', message: 'Mock generation failed' },
          error: {
            code: 'MOCK_FAILED',
            message: '模拟生成暂时没有成功。请调整提示词后重试。',
            retryable: true,
          },
          errorMessage: '模拟生成暂时没有成功。请调整提示词后重试。',
        }
      : {
          ...task,
          status,
          updatedAt,
          startedAt: task.startedAt ?? now,
          completedAt: status === 'succeeded' ? updatedAt : undefined,
          progress: {
            percent: status === 'succeeded' ? 100 : status === 'running' ? 62 : 12,
            stage: status === 'succeeded' ? 'finalizing' : status === 'running' ? 'generating' : 'queued',
            message: `Mock ${status}`,
          },
          result: createMockResult(input.type, input.prompt, status),
        };

  taskStore.set(updatedTask.id, updatedTask);
  return updatedTask;
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
    type: mode,
    title: `${label} · ${statusPrefix}`,
    summary: `围绕“${normalizedPrompt.slice(0, 34)}${normalizedPrompt.length > 34 ? '…' : ''}”生成了一个可继续编辑的 mock 方案。`,
    content: [
      `【${label} Mock 结果】`,
      `创作目标：${normalizedPrompt}`,
      '桌面端边界：当前仅由 renderer mock client 生成，未来可无缝切到 preload → IPC → main process。',
      '下一步：可把这条结果转为项目草稿，后续由 project bridge 保存到本地项目。',
    ].join('\n'),
  };
}

function formatCopyResult(task: GenerationTask, input: CopyGenerationResultInput): CopyGenerationResult {
  const result = task.result;
  if (!result) throw new Error(`Generation task is not ready: ${task.id}`);

  const textByFormat: Record<typeof input.format, string> = {
    'plain-text': result.content,
    markdown: `# ${result.title}\n\n${result.summary}\n\n${result.content}`,
    url: result.assets?.[0]?.url ?? result.assets?.[0]?.localPath ?? '',
    json: JSON.stringify(result, null, 2),
  };

  return { text: textByFormat[input.format], format: input.format };
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

function getBridgeAi(): DesktopAiClient | undefined {
  return globalThis.window?.endlessCreationBridge?.ai;
}
