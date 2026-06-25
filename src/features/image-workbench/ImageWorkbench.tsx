import { useState } from 'react';
import type { ReactNode } from 'react';
import './ImageWorkbench.css';

const costPills = ['预计扣费 ¥0.04', '标准单张 · ¥0.04', '生成图片 · ¥0.04'] as const;
const qualityOptions = ['自动', '高', '中', '低'] as const;
const quickActionsTop = ['提示词库', '方案库', '参数设置', '改稿实验', '存为模板'] as const;
const quickActionsBottom = ['存方案包', '复制', '清空', 'Prompt Lab'] as const;

type VariantId = 'variant-1' | 'variant-3';
type QualityOption = (typeof qualityOptions)[number];

export function ImageWorkbench() {
  const [selectedVariant, setSelectedVariant] = useState<VariantId>('variant-1');
  const [promptText, setPromptText] = useState('');
  const [quality, setQuality] = useState<QualityOption>('高');

  function handleQuickAction(action: string) {
    if (action === '清空') {
      setPromptText('');
      return;
    }

    if (action === '复制' && promptText) {
      void navigator.clipboard?.writeText(promptText).catch(() => undefined);
    }
  }

  return (
    <main className="image-workbench" aria-label="生图工作台">
      <section className="image-workbench__frame">
        <header className="image-workbench__topbar">
          <div className="image-workbench__title-group">
            <p className="image-workbench__eyebrow">智能生成</p>
            <h1>生图工作台</h1>
            <p>参数 + 提示词 + 结果</p>
          </div>
          <div className="image-workbench__top-actions">
            <button className="image-workbench__button" type="button">导入参考图</button>
            <button className="image-workbench__button image-workbench__button--primary" type="button">生成</button>
          </div>
        </header>

        <div className="image-workbench__columns image-workbench__columns--merged">
          <section className="image-workbench__card image-workbench__card--composer image-workbench__card--image-studio">
            <div className="image-studio__header">
              <div className="image-studio__title-copy">
                <h2>图片工作台</h2>
                <p>写清楚画面需求，然后提交生成。</p>
              </div>
              <div className="image-studio__cost-pills" aria-label="费用信息">
                {costPills.map((pill) => <span key={pill}>{pill}</span>)}
              </div>
            </div>

            <div className="image-studio__params" aria-label="生图参数">
              <div className="image-studio__field image-studio__field--select">
                <span>图片模型</span>
                <strong>GPT Image 2 · 3 通道</strong>
                <ChevronDownIcon />
              </div>
              <div className="image-studio__field">
                <span>尺寸</span>
                <strong>1536 x 1024</strong>
              </div>
              <div className="image-studio__field image-studio__field--quality">
                <span>质量</span>
                <div className="image-studio__quality-group" role="group" aria-label="质量">
                  {qualityOptions.map((option) => (
                    <button
                      aria-pressed={quality === option}
                      className={quality === option ? 'image-studio__quality image-studio__quality--active' : 'image-studio__quality'}
                      key={option}
                      onClick={() => setQuality(option)}
                      type="button"
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
              <div className="image-studio__field">
                <span>数量</span>
                <strong>4</strong>
              </div>
              <div className="image-studio__field">
                <span>风格强度</span>
                <strong>72%</strong>
              </div>
              <div className="image-studio__field">
                <span>参考权重</span>
                <strong>60%</strong>
              </div>
            </div>

            <div className="image-studio__status-strip">
              <label className="image-studio__save-option">
                <span aria-hidden="true" className="image-workbench__checkbox"><CheckIcon /></span>
                <span>保存到本地项目</span>
              </label>
              <div className="image-studio__queue-inline">
                <span>队列</span>
                <strong>暂无等待任务</strong>
              </div>
            </div>

            <label className="image-studio__prompt-area">
              <span>提示词</span>
              <textarea
                aria-label="提示词"
                maxLength={4000}
                onChange={(event) => setPromptText(event.target.value)}
                placeholder="提示词"
                value={promptText}
              />
            </label>
            <div className="image-studio__count" aria-live="polite">{promptText.length}/4000</div>

            <div className="image-studio__upload-zone">
              <button className="image-studio__upload-button" type="button">
                <UploadIcon />
                <span>上传参考图</span>
              </button>
              <div>
                <strong>可选上传参考图，支持图生图/重绘</strong>
                <p>最多 4 张，每张 8MB；当前模型会走参考图生成通道。</p>
              </div>
            </div>

            <div className="image-studio__actions" aria-label="快捷操作">
              <div className="image-studio__action-row">
                {quickActionsTop.map((action, index) => (
                  <button className={`image-studio__action ${index === 1 ? 'image-studio__action--warm' : ''}`} key={action} onClick={() => handleQuickAction(action)} type="button">
                    <ActionIcon variant={index} />
                    <span>{action}</span>
                  </button>
                ))}
              </div>
              <div className="image-studio__action-row image-studio__action-row--secondary">
                {quickActionsBottom.map((action, index) => (
                  <button className="image-studio__action image-studio__action--ghost" key={action} onClick={() => handleQuickAction(action)} type="button">
                    <ActionIcon variant={index + 5} />
                    <span>{action}</span>
                  </button>
                ))}
              </div>
            </div>

            <button className="image-workbench__generate image-studio__submit" type="button">生成 4 张图片</button>
          </section>

          <section className="image-workbench__card image-workbench__card--results">
            <div className="image-workbench__card-head">
              <h2>结果画布</h2>
              <span>网格 / 对比</span>
            </div>
            <ResultCard
              active={selectedVariant === 'variant-1'}
              accent="blue"
              label="变体 1"
              onClick={() => setSelectedVariant('variant-1')}
            />
            <ResultCard
              active={selectedVariant === 'variant-3'}
              accent="cyan"
              label="变体 3"
              onClick={() => setSelectedVariant('variant-3')}
            />
            <div className="image-workbench__status-card">
              <strong>生成状态：已完成</strong>
              <span>种子 / 尺寸 / 质量元数据与快捷操作</span>
            </div>
          </section>
        </div>

        <footer className="image-workbench__statusbar">已更新布局：图片工作台 / 结果画布</footer>
      </section>
    </main>
  );
}

function ResultCard({ active, accent, label, onClick }: { active: boolean; accent: 'blue' | 'cyan'; label: string; onClick: () => void }) {
  return (
    <button
      aria-pressed={active}
      className={`image-workbench__result-card image-workbench__result-card--${accent} ${active ? 'image-workbench__result-card--active' : ''}`}
      onClick={onClick}
      type="button"
    >
      <div className="image-workbench__mock-image" aria-hidden="true">
        <svg viewBox="0 0 220 150" role="img">
          <defs>
            <linearGradient id={`image-gradient-${accent}`} x1="0" x2="1" y1="1" y2="0">
              <stop offset="0" stopColor={accent === 'blue' ? '#5a7cff' : '#20c7d2'} />
              <stop offset="1" stopColor={accent === 'blue' ? '#6fa0ff' : '#31d3e8'} />
            </linearGradient>
          </defs>
          <rect width="220" height="150" rx="12" fill="#252d3f" />
          <circle cx="64" cy="47" r="20" fill="#f7a91b" />
          <path d="M24 130L90 64L144 116L194 40L206 130H24Z" fill={`url(#image-gradient-${accent})`} />
        </svg>
      </div>
      <div className="image-workbench__result-meta">
        <span>{label}</span>
        <span aria-hidden="true">...</span>
      </div>
    </button>
  );
}

function ActionIcon({ variant }: { variant: number }) {
  const paths = [
    <path key="book" d="M5 5.5h9a3 3 0 0 1 3 3v10H8a3 3 0 0 0-3 3v-16Z" />,
    <path key="box" d="M4 8h16M7 8V5h10v3M7 12h10M8 16h8" />,
    <path key="gear" d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7ZM12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3" />,
    <path key="flask" d="M9 3h6M10 3v5l-5 9a3 3 0 0 0 2.6 4.5h8.8A3 3 0 0 0 19 17l-5-9V3" />,
    <path key="bookmark" d="M6 4h12v17l-6-3-6 3V4Z" />,
    <path key="save" d="M5 4h12l2 2v14H5V4ZM8 4v6h8M8 17h8" />,
    <path key="copy" d="M8 8h11v11H8zM5 5h11" />,
    <path key="clear" d="M5 7h14M10 11v6M14 11v6M8 7l1-3h6l1 3M7 7l1 14h8l1-14" />,
    <path key="lab" d="M7 17 17 7M9 7h8v8" />,
  ];

  return <SvgIcon>{paths[variant] ?? paths[0]}</SvgIcon>;
}

function SvgIcon({ children }: { children: ReactNode }) {
  return (
    <svg aria-hidden="true" fill="none" focusable="false" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      {children}
    </svg>
  );
}

function CheckIcon() { return <SvgIcon><path d="M5 12l4 4L19 6" /></SvgIcon>; }
function ChevronDownIcon() { return <SvgIcon><path d="m6 9 6 6 6-6" /></SvgIcon>; }
function UploadIcon() { return <SvgIcon><path d="M12 16V4M7 9l5-5 5 5M5 20h14" /></SvgIcon>; }
