import { useMemo, useState } from 'react';
import { ActionCard } from '../../components/ActionCard';
import { Button } from '../../components/Button';
import { Panel } from '../../components/Panel';
import { aiServiceStatus, createGenerationTask } from '../../services/aiService';
import { rendererBridge } from '../../services/rendererBridge';
import type { CreationMode, GenerationTask } from '../../types/workspace';
import { QUICK_ACTIONS, RECENT_PROJECTS } from './data';
import './CreationWorkbench.css';

interface CreationWorkbenchProps {
  mode: CreationMode;
}

type SubmitState = 'idle' | 'loading' | 'success' | 'error';
type CopyState = 'idle' | 'copied' | 'failed';

const MODE_COPY: Record<CreationMode, { eyebrow: string; title: string; description: string; placeholder: string; action: string }> = {
  text: {
    eyebrow: 'Text Generation',
    title: '文本生成工作台',
    description: '输入主题、受众和目标风格，生成可继续编辑的脚本、文案或长文结构。',
    placeholder: '例如：为一款桌面 AI 创作工具写一段 30 秒发布视频旁白……',
    action: '生成文本草稿',
  },
  image: {
    eyebrow: 'Image Generation',
    title: '图片生成工作台',
    description: '描述画面主体、构图、材质和使用场景，生成 mock 视觉方案摘要。',
    placeholder: '例如：深色专业创作工作台界面，桌面软件窗口感，青绿色强调色……',
    action: '生成图片方案',
  },
  video: {
    eyebrow: 'Video Generation',
    title: '视频生成工作台',
    description: '输入创意方向与时长要求，生成镜头、节奏和素材组织建议。',
    placeholder: '例如：为 AI 创作平台制作 45 秒产品介绍视频，突出多模态工作流……',
    action: '生成视频脚本',
  },
  library: {
    eyebrow: 'Project Library',
    title: '项目库整理工作台',
    description: '把零散灵感、素材和项目说明整理为可检索、可复用的项目草稿。',
    placeholder: '例如：整理“新品发布视觉方向”项目，归纳素材、任务和待确认问题……',
    action: '整理项目草稿',
  },
};

export function CreationWorkbench({ mode }: CreationWorkbenchProps) {
  const [prompt, setPrompt] = useState('');
  const [validationMessage, setValidationMessage] = useState('');
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [task, setTask] = useState<GenerationTask | null>(null);
  const [copyState, setCopyState] = useState<CopyState>('idle');

  const modeCopy = MODE_COPY[mode];
  const canCopy = Boolean(task?.result?.content);
  const buttonText = useMemo(() => {
    if (submitState === 'loading') return '生成中…';
    if (submitState === 'error') return '重新生成';
    if (submitState === 'success') return '再次生成';
    return modeCopy.action;
  }, [modeCopy.action, submitState]);

  async function handleSubmit() {
    const trimmedPrompt = prompt.trim();
    setCopyState('idle');

    if (!trimmedPrompt) {
      setValidationMessage('请输入创作提示后再生成。');
      return;
    }

    setValidationMessage('');
    setSubmitState('loading');

    try {
      const nextTask = await createGenerationTask({ mode, prompt: trimmedPrompt });
      setTask(nextTask);
      setSubmitState(nextTask.status === 'failed' ? 'error' : 'success');
    } catch {
      setTask({
        id: `local-error-${Date.now()}`,
        mode,
        prompt: trimmedPrompt,
        status: 'failed',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        errorMessage: '本地 mock client 出现异常，请重试。',
      });
      setSubmitState('error');
    }
  }

  async function handleCopyResult() {
    if (!task?.result?.content) return;

    try {
      await rendererBridge.copyText(task.result.content);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  }

  return (
    <main className="workbench" aria-labelledby="workbench-title">
      <section className="hero panel-like">
        <div className="hero__copy">
          <span className="hero__eyebrow">{modeCopy.eyebrow}</span>
          <h1 id="workbench-title">{modeCopy.title}</h1>
          <p>{modeCopy.description}</p>
        </div>
        <div className="prompt-box" role="form" aria-label="创作提示输入">
          <label htmlFor="creation-prompt">输入创作提示</label>
          <textarea
            aria-describedby={validationMessage ? 'prompt-error' : 'mock-service-note'}
            aria-invalid={Boolean(validationMessage)}
            disabled={submitState === 'loading'}
            id="creation-prompt"
            onChange={(event) => {
              setPrompt(event.target.value);
              if (validationMessage) setValidationMessage('');
            }}
            placeholder={modeCopy.placeholder}
            value={prompt}
          />
          {validationMessage && <p className="field-error" id="prompt-error" role="alert">{validationMessage}</p>}
          <div className="prompt-box__actions">
            <span id="mock-service-note">{aiServiceStatus.provider} · {aiServiceStatus.connected ? '已连接' : '离线模拟'}</span>
            <Button disabled={submitState === 'loading'} onClick={handleSubmit} variant="primary" type="button">
              {buttonText}
            </Button>
          </div>
        </div>
      </section>

      <section className="quick-grid" aria-label="快捷创作">
        {QUICK_ACTIONS.map((item) => (
          <ActionCard key={item.title} {...item} />
        ))}
      </section>

      <div className="content-grid">
        <Panel eyebrow="Recent" title="最近项目">
          <ul className="recent-list" aria-label="最近项目列表">
            {RECENT_PROJECTS.map((project) => (
              <li key={project.id}>
                <div>
                  <strong>{project.title}</strong>
                  <span>{project.type} · {project.updatedAt}</span>
                </div>
                <span className={`status status--${project.status}`}>{statusText[project.status]}</span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel eyebrow="Result" title="本次生成结果">
          {task ? (
            <article className="generation-result" aria-live="polite">
              <header className="generation-result__header">
                <div>
                  <span className="generation-result__label">用户 Prompt</span>
                  <p>{task.prompt}</p>
                </div>
                <span className={`task-status task-status--${task.status}`}>{taskStatusText[task.status]}</span>
              </header>

              {task.status === 'failed' ? (
                <div className="result-error" role="alert">
                  <strong>生成失败</strong>
                  <p>{task.errorMessage}</p>
                  <Button disabled={submitState === 'loading'} onClick={handleSubmit} type="button" variant="soft">重试</Button>
                </div>
              ) : (
                <div className="result-body">
                  <div>
                    <span className="generation-result__label">AI Mock 摘要</span>
                    <h3>{task.result?.title}</h3>
                    <p>{task.result?.summary}</p>
                  </div>
                  <pre>{task.result?.content}</pre>
                  <div className="result-body__actions">
                    <Button disabled={!canCopy} onClick={handleCopyResult} type="button" variant="soft">复制结果</Button>
                    {copyState === 'copied' && <span className="copy-feedback" role="status">已复制</span>}
                    {copyState === 'failed' && <span className="copy-feedback copy-feedback--error" role="status">复制失败，请手动选择文本</span>}
                  </div>
                </div>
              )}
            </article>
          ) : (
            <div className="canvas-placeholder" role="status">
              <div className="canvas-placeholder__frame">
                <span />
                <span />
                <span />
              </div>
              <p>选择左侧功能，输入提示并点击生成。这里会展示本次 mock AI 任务的状态、摘要和可复制结果。</p>
            </div>
          )}
        </Panel>
      </div>
    </main>
  );
}

const statusText = {
  draft: '草稿',
  ready: '就绪',
  review: '待审',
};

const taskStatusText = {
  queued: '排队中',
  running: '生成中',
  succeeded: '已完成',
  failed: '失败',
};

