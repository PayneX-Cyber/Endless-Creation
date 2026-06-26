import { useEffect, useState, type ReactNode } from 'react';
import type { CanvasNodeType } from './types';

interface CanvasToolbarProps {
  hasSelection: boolean;
  onAddNode: (type: CanvasNodeType) => void;
  onDeleteSelected: () => void;
  onResetView: () => void;
}

export function CanvasToolbar({ hasSelection, onAddNode, onDeleteSelected, onResetView }: CanvasToolbarProps) {
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(''), 1600);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  function pending(label: string) {
    setFeedback(`${label} 后续接入`);
  }

  return (
    <div className="canvas-toolbar-wrap" data-canvas-control>
      {feedback ? <div className="canvas-toolbar__feedback" role="status">{feedback}</div> : null}
      <div className="canvas-toolbar" role="toolbar" aria-label="画布工具栏">
        <ToolButton label="移动/选择" active onClick={() => setFeedback('选择工具已启用')}>
          <HandIcon />
        </ToolButton>
        <ToolButton label="撤销" disabled onClick={() => pending('撤销')}>
          <UndoIcon />
        </ToolButton>
        <ToolButton label="重做" disabled onClick={() => pending('重做')}>
          <RedoIcon />
        </ToolButton>
        <ToolbarDivider />
        <ToolButton label="新增文本节点" onClick={() => onAddNode('text')}>
          <TextIcon />
        </ToolButton>
        <ToolButton label="新增图片占位" onClick={() => onAddNode('image-placeholder')}>
          <ImageIcon />
        </ToolButton>
        <ToolButton label="视频占位" onClick={() => pending('视频占位')}>
          <VideoIcon />
        </ToolButton>
        <ToolButton label="音频节点" onClick={() => pending('音频节点')}>
          <MusicIcon />
        </ToolButton>
        <ToolButton label="参数调节" onClick={() => pending('参数调节')}>
          <SlidersIcon />
        </ToolButton>
        <ToolButton label="上传/导入" onClick={() => pending('上传/导入')}>
          <UploadIcon />
        </ToolButton>
        <ToolbarDivider />
        <ToolButton label="资产库" onClick={() => pending('资产库')}>
          <FolderIcon />
        </ToolButton>
        <ToolButton label="画布主题" onClick={() => pending('画布主题')}>
          <PaletteIcon />
        </ToolButton>
        <ToolButton label="删除选中" disabled={!hasSelection} danger onClick={onDeleteSelected}>
          <EraserIcon />
        </ToolButton>
        <ToolButton label="重置视图" onClick={onResetView}>
          <FocusIcon />
        </ToolButton>
      </div>
    </div>
  );
}

function ToolbarDivider() {
  return <span className="canvas-toolbar__divider" aria-hidden="true" />;
}

function ToolButton({ label, active, disabled, danger, onClick, children }: { label: string; active?: boolean; disabled?: boolean; danger?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      className={`canvas-toolbar__button ${active ? 'canvas-toolbar__button--active' : ''} ${danger ? 'canvas-toolbar__button--danger' : ''}`}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
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

function HandIcon() { return <IconFrame><path d="M8 11.5V6.8a1.4 1.4 0 0 1 2.8 0v4.4" /><path d="M10.8 10V5.8a1.4 1.4 0 0 1 2.8 0v5" /><path d="M13.6 10.6V7.2a1.4 1.4 0 0 1 2.8 0V13" /><path d="M16.4 12.5v-1.2a1.4 1.4 0 0 1 2.8 0v3.4c0 3.1-2.1 5.3-5.4 5.3h-1.6c-2.1 0-3.5-.8-4.8-2.4l-2.5-3.1a1.45 1.45 0 0 1 2.2-1.9L8 13.6" /></IconFrame>; }
function UndoIcon() { return <IconFrame><path d="M9 8H4V3" /><path d="M4.8 8A8 8 0 1 1 6.7 16.3" /></IconFrame>; }
function RedoIcon() { return <IconFrame><path d="M15 8h5V3" /><path d="M19.2 8A8 8 0 1 0 17.3 16.3" /></IconFrame>; }
function TextIcon() { return <IconFrame><path d="M5 6h14M12 6v12M9 18h6" /></IconFrame>; }
function ImageIcon() { return <IconFrame><rect x="4" y="5" width="16" height="14" rx="3" /><circle cx="9" cy="10" r="1.4" /><path d="m6.5 17 4-4 3 3 2-2 3 3" /></IconFrame>; }
function VideoIcon() { return <IconFrame><rect x="4" y="6" width="11" height="12" rx="3" /><path d="m15 10 5-3v10l-5-3" /></IconFrame>; }
function MusicIcon() { return <IconFrame><path d="M9 18V6l10-2v12" /><circle cx="7" cy="18" r="2" /><circle cx="17" cy="16" r="2" /></IconFrame>; }
function SlidersIcon() { return <IconFrame><path d="M5 7h4M15 7h4M11 5v4" /><path d="M5 12h9M20 12h-2M16 10v4" /><path d="M5 17h2M13 17h6M9 15v4" /></IconFrame>; }
function UploadIcon() { return <IconFrame><path d="M12 16V5" /><path d="m8 9 4-4 4 4" /><path d="M5 19h14" /></IconFrame>; }
function FolderIcon() { return <IconFrame><path d="M4 8.5A2.5 2.5 0 0 1 6.5 6H10l2 2h5.5A2.5 2.5 0 0 1 20 10.5v5A2.5 2.5 0 0 1 17.5 18h-11A2.5 2.5 0 0 1 4 15.5v-7Z" /></IconFrame>; }
function PaletteIcon() { return <IconFrame><path d="M12 4a8 8 0 0 0 0 16h1.2a1.6 1.6 0 0 0 .8-3l-.5-.3a1.6 1.6 0 0 1 .8-3H16a4 4 0 0 0 0-8 8.3 8.3 0 0 0-4-1.7Z" /><circle cx="8.5" cy="10" r=".8" /><circle cx="11" cy="7.8" r=".8" /><circle cx="14" cy="8.5" r=".8" /></IconFrame>; }
function EraserIcon() { return <IconFrame><path d="m4 16 8.5-8.5a2.1 2.1 0 0 1 3 0l3 3a2.1 2.1 0 0 1 0 3L13 19H8l-4-3Z" /><path d="M11 19h9" /></IconFrame>; }
function FocusIcon() { return <IconFrame><path d="M8 4H5a1 1 0 0 0-1 1v3M16 4h3a1 1 0 0 1 1 1v3M8 20H5a1 1 0 0 1-1-1v-3M16 20h3a1 1 0 0 0 1-1v-3" /><circle cx="12" cy="12" r="3" /></IconFrame>; }
