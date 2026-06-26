import type { PointerEvent as ReactPointerEvent } from 'react';
import type { CanvasNodeData, ConnectionHandleType } from './types';

interface CanvasNodeProps {
  node: CanvasNodeData;
  selected: boolean;
  related: boolean;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>, nodeId: string) => void;
  onDelete: (nodeId: string) => void;
  onConnectStart: (event: ReactPointerEvent<HTMLButtonElement>, nodeId: string, handleType: ConnectionHandleType) => void;
  onConnectEnd: (event: ReactPointerEvent<HTMLButtonElement>, nodeId: string, handleType: ConnectionHandleType) => void;
}

export function CanvasNode({ node, selected, related, onPointerDown, onDelete, onConnectStart, onConnectEnd }: CanvasNodeProps) {
  return (
    <article
      className={`canvas-node canvas-node--${node.type} ${selected ? 'canvas-node--selected' : ''} ${related ? 'canvas-node--related' : ''}`}
      data-canvas-node
      data-node-id={node.id}
      style={{ width: node.width, height: node.height, transform: `translate(${node.position.x}px, ${node.position.y}px)` }}
      tabIndex={0}
      onPointerDown={(event) => onPointerDown(event, node.id)}
    >
      <ConnectionHandleButton type="target" nodeId={node.id} onConnectStart={onConnectStart} onConnectEnd={onConnectEnd} />
      <ConnectionHandleButton type="source" nodeId={node.id} onConnectStart={onConnectStart} onConnectEnd={onConnectEnd} />

      <div className="canvas-node__topline">
        <span className="canvas-node__badge">{nodeTypeLabel(node.type)}</span>
        {selected ? (
          <button
            className="canvas-node__delete"
            data-canvas-control
            onClick={(event) => {
              event.stopPropagation();
              onDelete(node.id);
            }}
            type="button"
          >
            删除
          </button>
        ) : null}
      </div>
      <h3>{node.title}</h3>
      <p>{node.content}</p>
      <NodePreview node={node} />
    </article>
  );
}

function ConnectionHandleButton({ type, nodeId, onConnectStart, onConnectEnd }: { type: ConnectionHandleType; nodeId: string; onConnectStart: (event: ReactPointerEvent<HTMLButtonElement>, nodeId: string, handleType: ConnectionHandleType) => void; onConnectEnd: (event: ReactPointerEvent<HTMLButtonElement>, nodeId: string, handleType: ConnectionHandleType) => void }) {
  return (
    <button
      type="button"
      className={`canvas-node__handle canvas-node__handle--${type}`}
      data-canvas-control
      data-connection-handle={type}
      aria-label={type === 'source' ? '从此节点创建连线' : '连接到此节点'}
      onPointerDown={(event) => onConnectStart(event, nodeId, type)}
      onPointerUp={(event) => onConnectEnd(event, nodeId, type)}
    />
  );
}

function NodePreview({ node }: { node: CanvasNodeData }) {
  if (node.type === 'image') return <div className="canvas-node__media canvas-node__media--image" aria-hidden="true" />;
  if (node.type === 'video') return <div className="canvas-node__media canvas-node__media--video" aria-hidden="true"><span>play</span></div>;
  if (node.type === 'audio') return <div className="canvas-node__media canvas-node__media--audio" aria-hidden="true"><span>audio</span></div>;
  if (node.type === 'config') {
    return (
      <div className="canvas-node__config" aria-hidden="true">
        <span>{node.metadata?.model || 'Mock 模型'}</span>
        <span>{node.metadata?.size || '1536 x 1024'}</span>
        <span>{node.metadata?.quality || '自动'}</span>
      </div>
    );
  }
  return null;
}

function nodeTypeLabel(type: CanvasNodeData['type']) {
  if (type === 'image') return '图片';
  if (type === 'config') return '配置';
  if (type === 'video') return '视频';
  if (type === 'audio') return '音频';
  return '文本';
}
