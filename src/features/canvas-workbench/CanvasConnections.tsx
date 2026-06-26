import type { MouseEvent as ReactMouseEvent } from 'react';
import type { CanvasConnection, CanvasNodeData, ConnectionHandle, Position } from './types';

interface CanvasConnectionsProps {
  connections: CanvasConnection[];
  nodes: CanvasNodeData[];
  selectedNodeId: string | null;
  selectedConnectionId: string | null;
  pendingConnection: ConnectionHandle | null;
  mouseWorld: Position | null;
  onSelectConnection: (connectionId: string) => void;
}

export function CanvasConnections({ connections, nodes, selectedNodeId, selectedConnectionId, pendingConnection, mouseWorld, onSelectConnection }: CanvasConnectionsProps) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const pendingNode = pendingConnection ? nodeById.get(pendingConnection.nodeId) : null;
  return (
    <svg className="canvas-connections" aria-hidden="true">
      {connections.map((connection) => {
        const from = nodeById.get(connection.fromNodeId);
        const to = nodeById.get(connection.toNodeId);
        if (!from || !to) return null;
        const active = selectedConnectionId === connection.id || selectedNodeId === from.id || selectedNodeId === to.id;
        return <ConnectionPath active={active} connection={connection} from={from} key={connection.id} to={to} onSelect={onSelectConnection} />;
      })}
      {pendingConnection && pendingNode && mouseWorld ? <ActiveConnectionPath handle={pendingConnection} node={pendingNode} mouseWorld={mouseWorld} /> : null}
    </svg>
  );
}

function ConnectionPath({ connection, from, to, active, onSelect }: { connection: CanvasConnection; from: CanvasNodeData; to: CanvasNodeData; active: boolean; onSelect: (connectionId: string) => void }) {
  const pathD = createConnectionPath(from.position.x + from.width, from.position.y + from.height / 2, to.position.x, to.position.y + to.height / 2);
  return (
    <g>
      <path
        className="canvas-connections__hit"
        d={pathD}
        onClick={(event: ReactMouseEvent<SVGPathElement>) => {
          event.stopPropagation();
          onSelect(connection.id);
        }}
      />
      <path className={active ? 'canvas-connections__path canvas-connections__path--active' : 'canvas-connections__path'} d={pathD} />
    </g>
  );
}

function ActiveConnectionPath({ node, handle, mouseWorld }: { node: CanvasNodeData; handle: ConnectionHandle; mouseWorld: Position }) {
  const startX = handle.handleType === 'source' ? node.position.x + node.width : mouseWorld.x;
  const startY = handle.handleType === 'source' ? node.position.y + node.height / 2 : mouseWorld.y;
  const endX = handle.handleType === 'source' ? mouseWorld.x : node.position.x;
  const endY = handle.handleType === 'source' ? mouseWorld.y : node.position.y + node.height / 2;
  return <path className="canvas-connections__path canvas-connections__path--pending" d={createConnectionPath(startX, startY, endX, endY)} />;
}

function createConnectionPath(startX: number, startY: number, endX: number, endY: number) {
  const dx = Math.abs(endX - startX);
  const curvature = Math.max(dx * 0.5, 64);
  return `M ${startX} ${startY} C ${startX + curvature} ${startY}, ${endX - curvature} ${endY}, ${endX} ${endY}`;
}
