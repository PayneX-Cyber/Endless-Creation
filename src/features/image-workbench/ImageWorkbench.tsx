import { useState } from 'react';
import type { ReactNode } from 'react';
import './ImageWorkbench.css';

type Quality = 'auto' | 'high' | 'medium' | 'low';
type AspectRatio = '1:1' | '3:2' | '2:3' | '4:3' | '3:4' | '16:9' | '9:16' | '1:1(2k)' | '16:9(2k)' | '9:16(2k)' | '16:9(4k)' | '9:16(4k)' | 'auto';

const qualityOptions: Array<{ id: Quality; label: string }> = [
  { id: 'auto', label: '自动' },
  { id: 'high', label: '高' },
  { id: 'medium', label: '中' },
  { id: 'low', label: '低' },
];

const aspectRatioOptions: AspectRatio[] = [
  '1:1',
  '3:2',
  '2:3',
  '4:3',
  '3:4',
  '16:9',
  '9:16',
  '1:1(2k)',
  '16:9(2k)',
  '9:16(2k)',
  '16:9(4k)',
  '9:16(4k)',
  'auto',
];

const generationCounts = Array.from({ length: 10 }, (_, index) => index + 1);

export function ImageWorkbench() {
  const [prompt, setPrompt] = useState('');
  const [quality, setQuality] = useState<Quality>('auto');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1');
  const [generationCount, setGenerationCount] = useState(1);
  const canGenerate = prompt.trim().length > 0;

  const resetDraft = () => {
    setPrompt('');
    setQuality('auto');
    setAspectRatio('1:1');
    setGenerationCount(1);
  };

  return (
    <main className="image-workbench" aria-label="生图工作台">
      <section className="image-workbench__panel image-workbench__panel--records">
        <header className="image-workbench__panel-header">
          <h2>生成记录</h2>
          <span className="image-workbench__badge">0</span>
        </header>

        <div className="image-workbench__toolbar">
          <button className="image-workbench__button" type="button" onClick={resetDraft}>
            <PlusIcon />新建
          </button>
          <button className="image-workbench__button image-workbench__button--muted" type="button">
            <CheckIcon />全选
          </button>
          <button className="image-workbench__button image-workbench__button--muted" type="button">
            <TrashIcon />删除
          </button>
        </div>

        <div className="image-workbench__empty image-workbench__empty--records">
          <span>暂无生成记录</span>
        </div>
      </section>

      <section className="image-workbench__panel image-workbench__panel--form">
        <h1>生图工作台</h1>

        <div className="image-workbench__field">
          <div className="image-workbench__field-head">
            <h2>提示词</h2>
            <div className="image-workbench__actions">
              <button className="image-workbench__button" type="button"><BookIcon />查看提示词库</button>
              <button className="image-workbench__button" type="button"><FolderIcon />查看我的素材</button>
            </div>
          </div>
          <textarea
            className="image-workbench__textarea"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="描述画面主体、风格、构图、光线和用途"
          />
        </div>

        <div className="image-workbench__field">
          <div className="image-workbench__field-head">
            <h2>参考图</h2>
            <div className="image-workbench__actions">
              <button className="image-workbench__button" type="button"><ClipboardIcon />剪切板</button>
              <button className="image-workbench__button" type="button"><UploadIcon />上传</button>
            </div>
          </div>
          <div className="image-workbench__empty image-workbench__empty--reference">
            <span>暂无参考图</span>
          </div>
        </div>

        <div className="image-workbench__field image-workbench__field--compact">
          <h2>模型</h2>
          <button className="image-workbench__select" type="button">
            <ChipIcon />
            <span>agnes-image-2...</span>
            <ChevronDownIcon />
          </button>
        </div>

        <div className="image-workbench__field image-workbench__field--compact">
          <h2>质量</h2>
          <div className="image-workbench__segments" role="group" aria-label="质量">
            {qualityOptions.map((item) => (
              <button
                className={`image-workbench__segment ${quality === item.id ? 'image-workbench__segment--active' : ''}`}
                key={item.id}
                onClick={() => setQuality(item.id)}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="image-workbench__field image-workbench__field--compact">
          <h2>宽高比</h2>
          <div className="image-workbench__ratio-grid" role="group" aria-label="宽高比">
            {aspectRatioOptions.map((item) => (
              <button
                aria-pressed={aspectRatio === item}
                className={`image-workbench__ratio-card ${aspectRatio === item ? 'image-workbench__ratio-card--active' : ''}`}
                key={item}
                onClick={() => setAspectRatio(item)}
                type="button"
              >
                {item === 'auto' ? null : <RatioIcon ratio={item} />}
                <span>{item}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="image-workbench__field image-workbench__field--compact">
          <h2>生成张数</h2>
          <div className="image-workbench__count-grid" role="group" aria-label="生成张数">
            {generationCounts.map((item) => (
              <button
                aria-pressed={generationCount === item}
                className={`image-workbench__count-button ${generationCount === item ? 'image-workbench__count-button--active' : ''}`}
                key={item}
                onClick={() => setGenerationCount(item)}
                type="button"
              >
                {item} 张
              </button>
            ))}
            <button className="image-workbench__count-button image-workbench__count-button--custom" type="button">
              {generationCount}
            </button>
          </div>
        </div>

        <button className="image-workbench__generate" disabled={!canGenerate} type="button">
          <SparkIcon />开始生成
        </button>
      </section>

      <section className="image-workbench__panel image-workbench__panel--results">
        <h2>生成结果</h2>
        <div className="image-workbench__result-empty">
          <ImagePlaceholderIcon />
          <BoxIcon />
          <span>还没有生成图片</span>
        </div>
      </section>
    </main>
  );
}

function SvgIcon({ children }: { children: ReactNode }) {
  return (
    <svg aria-hidden="true" fill="none" focusable="false" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
      {children}
    </svg>
  );
}

function RatioIcon({ ratio }: { ratio: AspectRatio }) {
  const baseRatio = ratio.replace(/\(.+\)/, '');
  const isPortrait = baseRatio === '2:3' || baseRatio === '3:4' || baseRatio === '9:16';
  const isLandscape = baseRatio === '3:2' || baseRatio === '4:3' || baseRatio === '16:9';
  const className = `image-workbench__ratio-icon ${
    isPortrait ? 'image-workbench__ratio-icon--portrait' : isLandscape ? 'image-workbench__ratio-icon--landscape' : 'image-workbench__ratio-icon--square'
  }`;

  return <span className={className} aria-hidden="true" />;
}

function PlusIcon() { return <SvgIcon><path d="M12 5v14M5 12h14" /></SvgIcon>; }
function CheckIcon() { return <SvgIcon><path d="M5 12l4 4L19 6" /><rect x="4" y="4" width="16" height="16" rx="3" /></SvgIcon>; }
function TrashIcon() { return <SvgIcon><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></SvgIcon>; }
function BookIcon() { return <SvgIcon><path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H19v16H7.5A2.5 2.5 0 0 0 5 21V5.5Z" /><path d="M9 7h5M9 11h6" /></SvgIcon>; }
function FolderIcon() { return <SvgIcon><path d="M4 8.5A2.5 2.5 0 0 1 6.5 6H10l2 2h5.5A2.5 2.5 0 0 1 20 10.5v6A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-8Z" /></SvgIcon>; }
function ClipboardIcon() { return <SvgIcon><path d="M9 5h6l1 2h2v13H6V7h2l1-2Z" /><path d="M9 11h6M9 15h4" /></SvgIcon>; }
function UploadIcon() { return <SvgIcon><path d="M12 16V5M8 9l4-4 4 4" /><path d="M5 16v3h14v-3" /></SvgIcon>; }
function ChipIcon() { return <SvgIcon><rect x="7" y="7" width="10" height="10" rx="2" /><path d="M4 10h3M4 14h3M17 10h3M17 14h3M10 4v3M14 4v3M10 17v3M14 17v3" /></SvgIcon>; }
function ChevronDownIcon() { return <SvgIcon><path d="m7 10 5 5 5-5" /></SvgIcon>; }
function SparkIcon() { return <SvgIcon><path d="M12 3l1.7 5.1L19 10l-5.3 1.9L12 17l-1.7-5.1L5 10l5.3-1.9L12 3Z" /><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z" /></SvgIcon>; }
function ImagePlaceholderIcon() { return <SvgIcon><rect x="4" y="5" width="16" height="14" rx="3" /><circle cx="9" cy="10" r="1.4" /><path d="m6.5 17 4-4 3 3 2-2 3 3" /><path d="M18 4v4M16 6h4" /></SvgIcon>; }
function BoxIcon() { return <SvgIcon><path d="M6 9h12l2 4v5H4v-5l2-4Z" /><path d="M6 9l2-4h8l2 4M4 13h5l1 2h4l1-2h5" /></SvgIcon>; }
