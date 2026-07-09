import { useMemo } from 'react';
import type { CharacterGraph } from './characterGraph';

// 人物关系图谱 V0：AI 从蓝图 + 正文推演，仅 session 态展示，不落库、不建模。
// 本文件同时导出面板壳（NovelCharacterGraphPanel，含按钮/骨架/错误/空态）与纯渲染（NovelCharacterGraph）。
// 面板壳独占所有中文文案，让 NovelCreation.tsx 的接入点保持纯 ASCII（规避该文件的编辑字节坑）。

const WIDTH = 640;
const HEIGHT = 460;
const CENTER_X = WIDTH / 2;
const CENTER_Y = HEIGHT / 2;
const NODE_RADIUS = 24;

interface NodeLayout {
  name: string;
  role: string;
  description: string;
  x: number;
  y: number;
}

function layoutNodes(graph: CharacterGraph): NodeLayout[] {
  const count = graph.characters.length;
  if (count === 0) return [];
  const ringRadius = Math.min(WIDTH, HEIGHT) / 2 - NODE_RADIUS - 72;
  return graph.characters.map((character, index) => {
    if (count === 1) {
      return { ...character, x: CENTER_X, y: CENTER_Y };
    }
    const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
    return {
      ...character,
      x: CENTER_X + ringRadius * Math.cos(angle),
      y: CENTER_Y + ringRadius * Math.sin(angle),
    };
  });
}

function briefLabel(name: string): string {
  const chars = Array.from(name);
  return chars.length > 4 ? `${chars.slice(0, 4).join('')}…` : name;
}

export function NovelCharacterGraph({ graph }: { graph: CharacterGraph }) {
  const nodes = useMemo(() => layoutNodes(graph), [graph]);
  const nodeByName = useMemo(() => new Map(nodes.map((node) => [node.name, node])), [nodes]);

  return (
    <div className="novel-graph__canvas" role="img" aria-label="人物关系图谱">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="novel-graph__svg" preserveAspectRatio="xMidYMid meet">
        <g className="novel-graph__edges">
          {graph.relationships.map((relationship, index) => {
            const from = nodeByName.get(relationship.from);
            const to = nodeByName.get(relationship.to);
            if (!from || !to) return null;
            const midX = (from.x + to.x) / 2;
            const midY = (from.y + to.y) / 2;
            return (
              <g className="novel-graph__edge" key={`${relationship.from}-${relationship.to}-${index}`} style={{ animationDelay: `${index * 60}ms` }}>
                <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} className="novel-graph__edge-line" />
                {relationship.label && (
                  <text x={midX} y={midY} className="novel-graph__edge-label" textAnchor="middle" dy="-4">{relationship.label}</text>
                )}
              </g>
            );
          })}
        </g>
        <g className="novel-graph__nodes">
          {nodes.map((node, index) => (
            <g className="novel-graph__node" key={node.name} transform={`translate(${node.x}, ${node.y})`} style={{ animationDelay: `${index * 80}ms` }}>
              <circle r={NODE_RADIUS} className="novel-graph__node-circle" />
              <text className="novel-graph__node-name" textAnchor="middle" dy="0.34em">{briefLabel(node.name)}</text>
              {node.role && <text className="novel-graph__node-role" textAnchor="middle" y={NODE_RADIUS + 16}>{node.role}</text>}
            </g>
          ))}
        </g>
      </svg>
      <ul className="novel-graph__legend">
        {nodes.map((node) => (
          <li key={node.name}>
            <strong>{node.name}</strong>
            {node.role && <span className="novel-graph__legend-role">{node.role}</span>}
            {node.description && <span className="novel-graph__legend-desc">{node.description}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function GraphSkeleton() {
  return (
    <div className="novel-graph__skeleton" aria-hidden="true">
      <div className="novel-graph__skeleton-canvas">
        <span className="novel-skeleton-dot novel-skeleton-dot--center" />
        <span className="novel-skeleton-dot novel-skeleton-dot--1" />
        <span className="novel-skeleton-dot novel-skeleton-dot--2" />
        <span className="novel-skeleton-dot novel-skeleton-dot--3" />
        <span className="novel-skeleton-dot novel-skeleton-dot--4" />
      </div>
      <div className="novel-skeleton-line novel-skeleton-line--wide" />
      <div className="novel-skeleton-line" />
    </div>
  );
}

interface NovelCharacterGraphPanelProps {
  graph: CharacterGraph | null;
  busy: boolean;
  error: string;
  onDeduce: () => void;
}

// 人物关系面板壳：接入点只需 <NovelCharacterGraphPanel .../>，所有中文与状态分支都在这里。
export function NovelCharacterGraphPanel({ graph, busy, error, onDeduce }: NovelCharacterGraphPanelProps) {
  const hasGraph = graph !== null && graph.characters.length > 0;
  return (
    <>
      <div className="novel-project-panel__head">
        <h2>人物关系</h2>
        <button className="novel-flow__primary novel-flow__primary--compact" disabled={busy} onClick={onDeduce} type="button">
          {busy ? '推演中…' : hasGraph ? '重新推演' : 'AI 推演关系'}
        </button>
      </div>
      {error && (
        <div className="novel-graph__error" role="alert">
          <span>{error}</span>
          <button className="novel-flow__ghost" disabled={busy} onClick={onDeduce} type="button">重试</button>
        </div>
      )}
      {busy ? (
        <GraphSkeleton />
      ) : hasGraph ? (
        <NovelCharacterGraph graph={graph} />
      ) : graph !== null ? (
        <div className="novel-empty"><strong>没有梳理出人物</strong><span>当前蓝图与正文信息不足，补充更多内容后再试。</span></div>
      ) : !error ? (
        <div className="novel-empty"><strong>暂无人物关系图</strong><span>点击「AI 推演关系」，从蓝图与已有正文里梳理主要人物与关系。</span></div>
      ) : null}
    </>
  );
}
