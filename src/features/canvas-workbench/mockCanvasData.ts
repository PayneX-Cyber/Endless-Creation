import type { CanvasDocument, CanvasNodeData } from './types';

const baseNodes: CanvasNodeData[] = [
  {
    id: 'node-brief',
    type: 'text',
    title: '????',
    content: '????????????????????????',
    position: { x: 80, y: 80 },
    width: 260,
    height: 150,
  },
  {
    id: 'node-reference',
    type: 'image',
    title: '????',
    content: '??????????????????????',
    position: { x: 460, y: 40 },
    width: 280,
    height: 190,
  },
  {
    id: 'node-config',
    type: 'config',
    title: '????',
    content: '???????????????????????',
    position: { x: 300, y: 330 },
    width: 280,
    height: 150,
    metadata: { model: 'Mock Image', size: '1536 x 1024', quality: '?' },
  },
  {
    id: 'node-output',
    type: 'video',
    title: '????',
    content: '????????????????????',
    position: { x: 820, y: 260 },
    width: 270,
    height: 160,
  },
];

const documents: Record<string, Pick<CanvasDocument, 'title' | 'description' | 'updatedAt'>> = {
  'canvas-2': { title: '???? 2', description: '???? ? 23 ??? ? 32 ???', updatedAt: '06/24 18:06' },
  'canvas-1': { title: '???? 1', description: '???? ? 19 ??? ? 25 ???', updatedAt: '06/26 13:02' },
  'relationship-canvas': { title: '??????', description: '???? ? 12 ??? ? 8 ???', updatedAt: '?? 14:32' },
  'archive-board': { title: '??????', description: '???? ? 16 ??? ? 14 ???', updatedAt: '??' },
  'new-canvas': { title: '????', description: '???? ? 4 ??? ? 3 ???', updatedAt: '??' },
};

export function createMockCanvasDocument(canvasId: string): CanvasDocument {
  const meta = documents[canvasId] || documents['canvas-2'];
  return {
    id: canvasId,
    title: meta.title,
    description: meta.description,
    updatedAt: meta.updatedAt,
    viewport: { x: 130, y: 110, k: 1 },
    backgroundMode: 'lines',
    nodes: baseNodes.map((node) => ({ ...node, position: { ...node.position }, metadata: node.metadata ? { ...node.metadata } : undefined })),
    connections: [
      { id: 'connection-brief-reference', fromNodeId: 'node-brief', toNodeId: 'node-reference' },
      { id: 'connection-brief-config', fromNodeId: 'node-brief', toNodeId: 'node-config' },
      { id: 'connection-config-output', fromNodeId: 'node-config', toNodeId: 'node-output' },
    ],
  };
}
