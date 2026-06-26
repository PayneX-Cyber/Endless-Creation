import { useEffect, useState, type ReactNode } from 'react';
import { MAX_CANVAS_SCALE, MIN_CANVAS_SCALE, clampScale } from './canvasMath';

interface CanvasZoomControlsProps {
  scale: number;
  onScaleChange: (scale: number) => void;
  onReset: () => void;
}

export function CanvasZoomControls({ scale, onScaleChange, onReset }: CanvasZoomControlsProps) {
  const [feedback, setFeedback] = useState('');
  const percent = Math.round(scale * 100);

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(''), 1600);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  return (
    <div className="canvas-zoom-wrap" data-canvas-control>
      {feedback ? <div className="canvas-zoom__feedback" role="status">{feedback}</div> : null}
      <div className="canvas-zoom" aria-label="画布视图控制栏">
        <ZoomButton label="定位" onClick={() => setFeedback('定位功能后续接入')}>
          <CompassIcon />
        </ZoomButton>
        <ZoomButton label="适配视图" onClick={onReset}>
          <FocusIcon />
        </ZoomButton>
        <input
          aria-label="缩放画布"
          className="canvas-zoom__range"
          max={Math.round(MAX_CANVAS_SCALE * 100)}
          min={Math.round(MIN_CANVAS_SCALE * 100)}
          onChange={(event) => onScaleChange(clampScale(Number(event.target.value) / 100))}
          step="1"
          title="缩放画布"
          type="range"
          value={percent}
        />
        <span className="canvas-zoom__percent">{percent}%</span>
        <ZoomButton label="帮助" onClick={() => setFeedback('快捷键说明后续接入')}>
          <HelpIcon />
        </ZoomButton>
      </div>
    </div>
  );
}

function ZoomButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button aria-label={label} title={label} type="button" onClick={onClick}>
      {children}
    </button>
  );
}

function IconFrame({ children }: { children: ReactNode }) {
  return (
    <svg aria-hidden="true" fill="none" focusable="false" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      {children}
    </svg>
  );
}

function CompassIcon() { return <IconFrame><circle cx="12" cy="12" r="8" /><path d="m14.8 9.2-1.7 4.1-4.1 1.7 1.7-4.1 4.1-1.7Z" /></IconFrame>; }
function FocusIcon() { return <IconFrame><path d="M8 4H5a1 1 0 0 0-1 1v3M16 4h3a1 1 0 0 1 1 1v3M8 20H5a1 1 0 0 1-1-1v-3M16 20h3a1 1 0 0 0 1-1v-3" /><circle cx="12" cy="12" r="3" /></IconFrame>; }
function HelpIcon() { return <IconFrame><circle cx="12" cy="12" r="8" /><path d="M9.8 9.5a2.4 2.4 0 0 1 4.5 1.2c0 1.8-2.3 2-2.3 3.6" /><path d="M12 17.2h.01" /></IconFrame>; }
