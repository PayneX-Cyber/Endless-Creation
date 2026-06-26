import type { PointerEvent as ReactPointerEvent } from 'react';
import type { CanvasNodeData, ConnectionHandleType } from './types';

interface CanvasNodeProps {
  node: CanvasNodeData;
  selected: boolean;
  related: boolean;
  isSpacePressed: boolean;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>, nodeId: string) => void;
  onDelete: (nodeId: string) => void;
  onConnectStart: (event: ReactPointerEvent<HTMLButtonElement>, nodeId: string, handleType: ConnectionHandleType) => void;
  onConnectEnd: (event: ReactPointerEvent<HTMLButtonElement>, nodeId: string, handleType: ConnectionHandleType) => void;
}

export function CanvasNode({ node, selected, related, isSpacePressed, onPointerDown, onDelete, onConnectStart, onConnectEnd }: CanvasNodeProps) {
  return (
    <article
      className={`canvas-node canvas-node--${node.type} ${selected ? 'canvas-node--selected' : ''} ${related ? 'canvas-node--related' : ''}`}
      data-canvas-node
      data-node-id={node.id}
      style={{ width: node.width, height: node.height, transform: `translate(${node.position.x}px, ${node.position.y}px)` }}
      tabIndex={0}
      onPointerDown={(event) => {
        if (isSpacePressed) return;
        onPointerDown(event, node.id);
      }}
    >
      <ConnectionHandleButton type="target" nodeId={node.id} onConnectStart={onConnectStart} onConnectEnd={onConnectEnd} />
      <ConnectionHandleButton type="source" nodeId={node.id} onConnectStart={onConnectStart} onConnectEnd={onConnectEnd} />

      <div className="canvas-node__accent" aria-hidden="true" />
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
            ??
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
      aria-label={type === 'source' ? '????????' : '??????'}
      title={type === 'source' ? '????????' : '??????'}
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
        <span>{node.metadata?.model || 'Mock ??'}</span>
        <span>{node.metadata?.size || '1536 x 1024'}</span>
        <span>{node.metadata?.quality || '??'}</span>
      </div>
    );
  }
  return null;
}

function nodeTypeLabel(type: CanvasNodeData['type']) {
  if (type === 'image') return '??';
  if (type === 'config') return '??';
  if (type === 'video') return '??';
  if (type === 'audio') return '??';
  return '??';
}
