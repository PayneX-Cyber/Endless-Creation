import type { CanvasDocument, CanvasNodeData } from './types';

const baseNodes: CanvasNodeData[] = [
  {
    id: 'node-brief',
    type: 'text',
    title: '创作简报',
    content: '整理本次视觉方向、受众和核心情绪。',
    position: { x: 80, y: 80 },
    width: 260,
    height: 150,
  },
  {
    id: 'node-reference',
    type: 'image',
    title: '参考图',
    content: '用于保持角色、场景或风格一致性。',
    position: { x: 460, y: 40 },
    width: 280,
    height: 190,
  },
  {
    id: 'node-config',
    type: 'config',
    title: '生成配置',
    content: '模型、尺寸、质量和生成数量。',
    position: { x: 300, y: 330 },
    width: 280,
    height: 150,
    metadata: { model: 'Mock Image', size: '1536 x 1024', quality: '高' },
  },
  {
    id: 'node-output',
    type: 'video',
    title: '视频输出',
    content: '用于后续视频合成或分镜预览。',
    position: { x: 820, y: 260 },
    width: 270,
    height: 160,
  },
];

const documents: Record<string, Pick<CanvasDocument, 'title' | 'description' | 'updatedAt'>> = {
  'canvas-2': { title: '无限画布 2', description: '画布项目 · 23 个节点 · 32 条连线', updatedAt: '06/24 18:06' },
  'canvas-1': { title: '无限画布 1', description: '画布项目 · 19 个节点 · 25 条连线', updatedAt: '06/26 13:02' },
  'relationship-canvas': { title: '角色关系画布', description: '画布项目 · 12 个节点 · 8 条连线', updatedAt: '今天 14:32' },
  'archive-board': { title: '资源编排画布', description: '画布项目 · 16 个节点 · 14 条连线', updatedAt: '上周' },
  'new-canvas': { title: '新建画布', description: '画布项目 · 4 个节点 · 3 条连线', updatedAt: '刚刚' },
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
