import { useEffect, useState, type ReactNode } from 'react';
import type { CanvasBackgroundMode, CanvasNodeType } from './types';

interface CanvasToolbarProps {
  hasSelection: boolean;
  canUndo: boolean;
  canRedo: boolean;
  backgroundMode: CanvasBackgroundMode;
  onAddNode: (type: CanvasNodeType) => void;
  onDeleteSelected: () => void;
  onClear: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onBackgroundModeChange: (mode: CanvasBackgroundMode) => void;
  onResetView: () => void;
}

export function CanvasToolbar({ hasSelection, canUndo, canRedo, backgroundMode, onAddNode, onDeleteSelected, onClear, onUndo, onRedo, onBackgroundModeChange, onResetView }: CanvasToolbarProps) {
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(''), 1600);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  function pending(label: string) {
    setFeedback(`${label} 后续接入`);
  }

  function cycleBackground() {
    const next = backgroundMode === 'lines' ? 'dots' : backgroundMode === 'dots' ? 'blank' : 'lines';
    onBackgroundModeChange(next);
    setFeedback(`背景：${next === 'lines' ? '线' : next === 'dots' ? '点' : '空白'}`);
  }

  return (
    <div className="canvas-toolbar-wrap" data-canvas-control>
      {feedback ? <div className="canvas-toolbar__feedback" role="status">{feedback}</div> : null}
      <div className="canvas-toolbar" role="toolbar" aria-label="画布工具栏">
        <ToolButton label="移动/选择" active onClick={() => setFeedback('选择工具已启用')}><HandIcon /></ToolButton>
        <ToolButton label="撤销" disabled={!canUndo} onClick={onUndo}><UndoIcon /></ToolButton>
        <ToolButton label="重做" disabled={!canRedo} onClick={onRedo}><RedoIcon /></ToolButton>
        <ToolbarDivider />
        <ToolButton label="新增文本节点" onClick={() => onAddNode('text')}><TextIcon /></ToolButton>
        <ToolButton label="新增图片节点" onClick={() => onAddNode('image')}><ImageIcon /></ToolButton>
        <ToolButton label="新增视频节点" onClick={() => onAddNode('video')}><VideoIcon /></ToolButton>
        <ToolButton label="新增音频节点" onClick={() => onAddNode('audio')}><MusicIcon /></ToolButton>
        <ToolButton label="新增配置节点" onClick={() => onAddNode('config')}><SlidersIcon /></ToolButton>
        <ToolButton label="上传/导入" onClick={() => pending('上传/导入')}><UploadIcon /></ToolButton>
        <ToolbarDivider />
        <ToolButton label="资产库" onClick={() => pending('资产库')}><FolderIcon /></ToolButton>
        <ToolButton label="切换背景模式" active={backgroundMode !== 'lines'} onClick={cycleBackground}><GridIcon /></ToolButton>
        <ToolButton label="删除选中" disabled={!hasSelection} danger onClick={onDeleteSelected}><EraserIcon /></ToolButton>
        <ToolButton label="清空画布" danger onClick={onClear}><TrashIcon /></ToolButton>
        <ToolButton label="重置视图" onClick={onResetView}><FocusIcon /></ToolButton>
      </div>
    </div>
  );
}

function ToolbarDivider() { return <span className="canvas-toolbar__divider" aria-hidden="true" />; }
function ToolButton({ label, active, disabled, danger, onClick, children }: { label: string; active?: boolean; disabled?: boolean; danger?: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" className={`canvas-toolbar__button ${active ? 'canvas-toolbar__button--active' : ''} ${danger ? 'canvas-toolbar__button--danger' : ''}`} aria-label={label} title={label} disabled={disabled} onClick={onClick}>{children}</button>;
}
function IconFrame({ children }: { children: ReactNode }) { return <svg aria-hidden="true" fill="none" focusable="false" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} viewBox="0 0 24 24">{children}</svg>; }
function HandIcon() { return <IconFrame><path d="M8 12V6a2 2 0 0 1 4 0v5" /><path d="M12 11V5a2 2 0 0 1 4 0v7" /><path d="M16 12V8a2 2 0 0 1 4 0v6c0 4-3 7-7 7h-1c-3 0-5-2-6-4l-2-3a2 2 0 0 1 3-2l1 1" /></IconFrame>; }
function UndoIcon() { return <IconFrame><path d="M9 7H4V2" /><path d="M5 7a8 8 0 1 1 2 8" /></IconFrame>; }
function RedoIcon() { return <IconFrame><path d="M15 7h5V2" /><path d="M19 7a8 8 0 1 0-2 8" /></IconFrame>; }
function TextIcon() { return <IconFrame><path d="M5 6h14" /><path d="M12 6v12" /><path d="M9 18h6" /></IconFrame>; }
function ImageIcon() { return <IconFrame><rect x="4" y="5" width="16" height="14" rx="3" /><circle cx="9" cy="10" r="1" /><path d="m7 17 4-4 3 3 2-2 2 3" /></IconFrame>; }
function VideoIcon() { return <IconFrame><rect x="4" y="6" width="11" height="12" rx="3" /><path d="m15 10 5-3v10l-5-3" /></IconFrame>; }
function MusicIcon() { return <IconFrame><path d="M9 18V6l10-2v12" /><circle cx="7" cy="18" r="2" /><circle cx="17" cy="16" r="2" /></IconFrame>; }
function SlidersIcon() { return <IconFrame><path d="M5 7h5" /><path d="M14 7h5" /><path d="M12 5v4" /><path d="M5 12h9" /><path d="M18 12h1" /><path d="M16 10v4" /><path d="M5 17h2" /><path d="M11 17h8" /><path d="M9 15v4" /></IconFrame>; }
function UploadIcon() { return <IconFrame><path d="M12 16V5" /><path d="m8 9 4-4 4 4" /><path d="M5 19h14" /></IconFrame>; }
function FolderIcon() { return <IconFrame><path d="M4 8a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8Z" /></IconFrame>; }
function GridIcon() { return <IconFrame><path d="M4 4h16v16H4z" /><path d="M4 12h16M12 4v16" /></IconFrame>; }
function TrashIcon() { return <IconFrame><path d="M4 7h16" /><path d="M10 11v6M14 11v6" /><path d="M6 7l1 13h10l1-13" /><path d="M9 7V4h6v3" /></IconFrame>; }
function EraserIcon() { return <IconFrame><path d="m4 16 8-8a2 2 0 0 1 3 0l3 3a2 2 0 0 1 0 3l-5 5H8l-4-3Z" /><path d="M11 19h9" /></IconFrame>; }
function FocusIcon() { return <IconFrame><path d="M8 4H5a1 1 0 0 0-1 1v3" /><path d="M16 4h3a1 1 0 0 1 1 1v3" /><path d="M8 20H5a1 1 0 0 1-1-1v-3" /><path d="M16 20h3a1 1 0 0 0 1-1v-3" /><circle cx="12" cy="12" r="3" /></IconFrame>; }
