export interface Position {
  x: number;
  y: number;
}

export interface ViewportTransform {
  x: number;
  y: number;
  k: number;
}

export type CanvasNodeType = 'text' | 'image' | 'config' | 'video' | 'audio';
export type CanvasBackgroundMode = 'lines' | 'dots' | 'blank';
export type ConnectionHandleType = 'source' | 'target';

export interface CanvasNodeMetadata {
  content?: string;
  status?: 'idle' | 'success' | 'loading' | 'error';
  model?: string;
  size?: string;
  quality?: string;
  mimeType?: string;
  durationMs?: number;
}

export interface CanvasNodeData {
  id: string;
  type: CanvasNodeType;
  title: string;
  content: string;
  position: Position;
  width: number;
  height: number;
  metadata?: CanvasNodeMetadata;
}

export interface CanvasConnection {
  id: string;
  fromNodeId: string;
  toNodeId: string;
}

export interface ConnectionHandle {
  nodeId: string;
  handleType: ConnectionHandleType;
}

export interface CanvasDocument {
  id: string;
  title: string;
  description?: string;
  nodes: CanvasNodeData[];
  connections: CanvasConnection[];
  viewport: ViewportTransform;
  backgroundMode: CanvasBackgroundMode;
  updatedAt: string;
}
