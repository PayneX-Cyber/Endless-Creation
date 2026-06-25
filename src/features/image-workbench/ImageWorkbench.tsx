import { useState } from 'react';
import type { ReactNode } from 'react';
import './ImageWorkbench.css';

const parameterRows = [
  ['模型', 'gpt-image-2'],
  ['尺寸', '1536 x 1024'],
  ['质量', '高'],
  ['数量', '4'],
  ['风格强度', '72%'],
  ['参考权重', '60%'],
] as const;

const styleChips = ['电影感', '海报', '3D 渲染', '柔光'] as const;

type StyleChip = (typeof styleChips)[number];
type VariantId = 'variant-1' | 'variant-3';

export function ImageWorkbench() {
  const [selectedChip, setSelectedChip] = useState<StyleChip>('电影感');
  const [selectedVariant, setSelectedVariant] = useState<VariantId>('variant-1');

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

        <div className="image-workbench__columns">
          <aside className="image-workbench__card image-workbench__card--params">
            <h2>参数检查器</h2>
            <div className="image-workbench__params">
              {parameterRows.map(([label, value]) => (
                <div className="image-workbench__param-row" key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>

            <div className="image-workbench__divider" />

            <div className="image-workbench__section-label">输出选项</div>
            <label className="image-workbench__checkline">
              <span aria-hidden="true" className="image-workbench__checkbox"><CheckIcon /></span>
              <span>保存到本地项目</span>
            </label>

            <div className="image-workbench__queue">
              <strong>队列</strong>
              <span>暂无等待任务</span>
            </div>
          </aside>

          <section className="image-workbench__card image-workbench__card--composer">
            <h2>提示词编辑器</h2>
            <label className="image-workbench__prompt-box image-workbench__prompt-box--large">
              <span className="image-workbench__prompt-label">主提示词输入区</span>
              <textarea aria-label="主提示词输入区" placeholder="主体 / 风格 / 光线 / 构图" />
            </label>
            <label className="image-workbench__prompt-box">
              <span className="image-workbench__prompt-label">反向提示词</span>
              <input aria-label="反向提示词" type="text" />
            </label>

            <div className="image-workbench__section-label">参考图</div>
            <div className="image-workbench__ref-grid">
              {Array.from({ length: 3 }).map((_, index) => (
                <button className="image-workbench__ref-tile" key={index} type="button" aria-label="导入参考图">
                  <PlusIcon />
                </button>
              ))}
            </div>

            <div className="image-workbench__section-label">风格标签</div>
            <div className="image-workbench__chips" role="group" aria-label="风格标签">
              {styleChips.map((chip) => (
                <button
                  aria-pressed={selectedChip === chip}
                  className={`image-workbench__chip ${selectedChip === chip ? 'image-workbench__chip--active' : ''}`}
                  key={chip}
                  onClick={() => setSelectedChip(chip)}
                  type="button"
                >
                  {chip}
                </button>
              ))}
            </div>

            <button className="image-workbench__generate" type="button">生成 4 张图片</button>
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

        <footer className="image-workbench__statusbar">已更新列顺序：参数检查器 / 提示词编辑器 / 结果画布</footer>
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

function SvgIcon({ children }: { children: ReactNode }) {
  return (
    <svg aria-hidden="true" fill="none" focusable="false" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      {children}
    </svg>
  );
}

function PlusIcon() { return <SvgIcon><path d="M12 5v14M5 12h14" /></SvgIcon>; }
function CheckIcon() { return <SvgIcon><path d="M5 12l4 4L19 6" /></SvgIcon>; }
