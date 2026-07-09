import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { CanvasConnections } from './CanvasConnections';
import { CanvasNode } from './CanvasNode';
import { CanvasToolbar } from './CanvasToolbar';
import { CanvasZoomControls } from './CanvasZoomControls';
import { clampScale, createId, screenToWorld } from './canvasMath';
import { InfiniteCanvas } from './InfiniteCanvas';
import { createMockCanvasDocument } from './mockCanvasData';
import type { CanvasBackgroundMode, CanvasConnection, CanvasDocument, CanvasNodeData, CanvasNodeType, ConnectionHandle, ConnectionHandleType, Position, ViewportTransform } from './types';
import './CanvasWorkbench.css';

interface CanvasWorkbenchProps {
  canvasId: string;
  projectId: string;
  projectName?: string;
  onBack: () => void;
  keyboardDisabled?: boolean;
}

type SaveState = 'saved' | 'dirty';
type HistorySnapshot = Pick<CanvasDocument, 'nodes' | 'connections' | 'backgroundMode'>;

export function CanvasWorkbench({ canvasId, projectId, projectName, onBack, keyboardDisabled = false }: CanvasWorkbenchProps) {
  const initialDocument = useMemo(() => createMockCanvasDocument(canvasId, projectId, projectName), [canvasId, projectId, projectName]);
  const [document, setDocument] = useState<CanvasDocument>(initialDocument);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [pendingConnection, setPendingConnection] = useState<ConnectionHandle | null>(null);
  const [mouseWorld, setMouseWorld] = useState<Position | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [history, setHistory] = useState<{ past: HistorySnapshot[]; future: HistorySnapshot[] }>({ past: [], future: [] });
  const [isSpacePressed, setSpacePressed] = useState(false);
  const clipboardRef = useRef<CanvasNodeData[] | null>(null);
  const rootRef = useRef<HTMLElement>(null);
  const canvasActiveRef = useRef(true);
  const documentRef = useRef(document);
  const viewportRef = useRef(document.viewport);
  const dragRef = useRef<{ active: boolean; nodeId: string; pointerId: number; startX: number; startY: number; initialPosition: Position; moved: boolean; historyPushed: boolean } | null>(null);

  useEffect(() => {
    setDocument(initialDocument);
    setSelectedNodeId(null);
    setSelectedConnectionId(null);
    setPendingConnection(null);
    setMouseWorld(null);
    setSaveState('saved');
    setHistory({ past: [], future: [] });
    canvasActiveRef.current = true;
  }, [initialDocument]);

  useEffect(() => {
    documentRef.current = document;
    viewportRef.current = document.viewport;
  }, [document]);

  useEffect(() => {
    function deactivateOnOutsidePointer(event: PointerEvent) {
      const target = event.target instanceof Node ? event.target : null;
      canvasActiveRef.current = Boolean(target && rootRef.current?.contains(target));
    }

    window.addEventListener('pointerdown', deactivateOnOutsidePointer, true);
    return () => window.removeEventListener('pointerdown', deactivateOnOutsidePointer, true);
  }, []);

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      if (pendingConnection) {
        setMouseWorld(getWorldPoint(event.clientX, event.clientY));
      }
      const drag = dragRef.current;
      if (!drag?.active) return;
      const viewport = viewportRef.current;
      const dx = (event.clientX - drag.startX) / viewport.k;
      const dy = (event.clientY - drag.startY) / viewport.k;
      const hasMoved = Math.abs(dx) > 1 || Math.abs(dy) > 1;
      if (!drag.moved && !hasMoved) return;
      if (!drag.historyPushed) {
        pushHistory();
        drag.historyPushed = true;
      }
      drag.moved = true;
      setDocument((current) => ({
        ...current,
        nodes: current.nodes.map((node) => node.id === drag.nodeId ? { ...node, position: { x: drag.initialPosition.x + dx, y: drag.initialPosition.y + dy } } : node),
      }));
      setSaveState('dirty');
    }

    function handlePointerUp(event: PointerEvent) {
      dragRef.current = null;
      if (pendingConnection) {
        const target = globalThis.document.elementFromPoint(event.clientX, event.clientY);
        const handle = target instanceof Element ? target.closest('[data-connection-handle]') as HTMLElement | null : null;
        const nodeId = handle?.closest('[data-node-id]')?.getAttribute('data-node-id');
        const handleType = handle?.getAttribute('data-connection-handle') as ConnectionHandleType | null;
        if (nodeId && handleType) finishConnection(nodeId, handleType);
        else cancelConnection();
      }
    }

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [pendingConnection]);

  useEffect(() => {
    function isEditableTarget(target: EventTarget | null) {
      if (!(target instanceof HTMLElement)) return false;
      return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target.isContentEditable;
    }

    function isInsideModal(target: EventTarget | null) {
      return target instanceof Element && Boolean(target.closest('.settings-modal, [role="dialog"]'));
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (keyboardDisabled || !canvasActiveRef.current || isEditableTarget(event.target) || isInsideModal(event.target)) return;
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === 'z') { event.preventDefault(); undo(); return; }
      if ((event.ctrlKey || event.metaKey) && (key === 'y' || (event.shiftKey && key === 'z'))) { event.preventDefault(); redo(); return; }
      if ((event.ctrlKey || event.metaKey) && key === 'c') { event.preventDefault(); copySelected(); return; }
      if ((event.ctrlKey || event.metaKey) && key === 'v') { event.preventDefault(); pasteCopied(); return; }
      if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); deleteSelected(); return; }
      if (event.key === 'Escape') { setSelectedNodeId(null); setSelectedConnectionId(null); cancelConnection(); }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  function snapshot(doc = documentRef.current): HistorySnapshot {
    return {
      nodes: doc.nodes.map((node) => ({ ...node, position: { ...node.position }, metadata: node.metadata ? { ...node.metadata } : undefined })),
      connections: doc.connections.map((connection) => ({ ...connection })),
      backgroundMode: doc.backgroundMode,
    };
  }

  function pushHistory() {
    const entry = snapshot();
    setHistory((current) => ({ past: [...current.past.slice(-39), entry], future: [] }));
  }

  function commit(updater: (current: CanvasDocument) => CanvasDocument) {
    pushHistory();
    setDocument((current) => updater(current));
    setSaveState('dirty');
  }

  function updateDocument(patch: Partial<CanvasDocument>) {
    setDocument((current) => ({ ...current, ...patch }));
  }

  function updateViewport(viewport: ViewportTransform) {
    setDocument((current) => ({ ...current, viewport: { ...viewport, k: clampScale(viewport.k) } }));
  }

  function handleNodePointerDown(event: ReactPointerEvent<HTMLElement>, nodeId: string) {
    if (event.button !== 0) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('[data-canvas-control]')) return;
    event.stopPropagation();
    canvasActiveRef.current = true;
    const node = documentRef.current.nodes.find((item) => item.id === nodeId);
    if (!node) return;
    setSelectedNodeId(nodeId);
    setSelectedConnectionId(null);
    dragRef.current = { active: true, nodeId, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, initialPosition: { ...node.position }, moved: false, historyPushed: false };
  }

  function addNode(type: CanvasNodeType) {
    const offset = documentRef.current.nodes.length * 28;
    const node: CanvasNodeData = {
      id: createId(type),
      type,
      title: nodeTitle(type),
      content: nodeContent(type),
      position: { x: 180 + offset, y: 180 + offset },
      width: type === 'image' ? 280 : type === 'video' ? 270 : 260,
      height: type === 'image' ? 190 : type === 'video' ? 170 : 150,
      metadata: type === 'config' ? { model: 'Mock 模型', size: '1536 x 1024', quality: '高' } : undefined,
    };
    commit((current) => ({ ...current, nodes: [...current.nodes, node] }));
    setSelectedNodeId(node.id);
    setSelectedConnectionId(null);
    canvasActiveRef.current = true;
  }

  function deleteNode(nodeId: string) {
    commit((current) => ({
      ...current,
      nodes: current.nodes.filter((node) => node.id !== nodeId),
      connections: current.connections.filter((connection) => connection.fromNodeId !== nodeId && connection.toNodeId !== nodeId),
    }));
    setSelectedNodeId((current) => (current === nodeId ? null : current));
  }

  function deleteConnection(connectionId: string) {
    commit((current) => ({ ...current, connections: current.connections.filter((connection) => connection.id !== connectionId) }));
    setSelectedConnectionId((current) => (current === connectionId ? null : current));
  }

  function deleteSelected() {
    if (selectedNodeId) deleteNode(selectedNodeId);
    else if (selectedConnectionId) deleteConnection(selectedConnectionId);
  }

  function clearCanvas() {
    commit((current) => ({ ...current, nodes: [], connections: [] }));
    setSelectedNodeId(null);
    setSelectedConnectionId(null);
  }

  function setBackgroundMode(mode: CanvasBackgroundMode) {
    commit((current) => ({ ...current, backgroundMode: mode }));
  }

  function resetView() {
    updateViewport({ x: 130, y: 110, k: 1 });
  }

  function saveMock() {
    updateDocument({ updatedAt: '刚刚' });
    setSaveState('saved');
  }

  function undo() {
    setHistory((current) => {
      const previous = current.past.at(-1);
      if (!previous) return current;
      const now = snapshot();
      applySnapshot(previous);
      return { past: current.past.slice(0, -1), future: [now, ...current.future] };
    });
  }

  function redo() {
    setHistory((current) => {
      const next = current.future[0];
      if (!next) return current;
      const now = snapshot();
      applySnapshot(next);
      return { past: [...current.past, now], future: current.future.slice(1) };
    });
  }

  function applySnapshot(entry: HistorySnapshot) {
    setDocument((current) => ({ ...current, nodes: entry.nodes, connections: entry.connections, backgroundMode: entry.backgroundMode }));
    setSelectedNodeId(null);
    setSelectedConnectionId(null);
    setSaveState('dirty');
  }

  function copySelected() {
    if (!selectedNodeId) return;
    const node = documentRef.current.nodes.find((item) => item.id === selectedNodeId);
    if (!node) return;
    clipboardRef.current = [{ ...node, position: { ...node.position }, metadata: node.metadata ? { ...node.metadata } : undefined }];
  }

  function pasteCopied() {
    const nodes = clipboardRef.current;
    if (!nodes?.length) return;
    const pasted = nodes.map((node) => ({ ...node, id: createId(node.type), title: `${node.title} 副本`, position: { x: node.position.x + 36, y: node.position.y + 36 } }));
    commit((current) => ({ ...current, nodes: [...current.nodes, ...pasted] }));
    setSelectedNodeId(pasted[0]?.id ?? null);
    setSelectedConnectionId(null);
  }

  function startConnection(event: ReactPointerEvent<HTMLButtonElement>, nodeId: string, handleType: ConnectionHandleType) {
    event.preventDefault();
    event.stopPropagation();
    canvasActiveRef.current = true;
    setPendingConnection({ nodeId, handleType });
    setMouseWorld(getWorldPoint(event.clientX, event.clientY));
  }

  function finishConnection(nodeId: string, handleType: ConnectionHandleType) {
    const pending = pendingConnection;
    if (!pending || pending.nodeId === nodeId || pending.handleType === handleType) {
      cancelConnection();
      return;
    }
    const fromNodeId = pending.handleType === 'source' ? pending.nodeId : nodeId;
    const toNodeId = pending.handleType === 'source' ? nodeId : pending.nodeId;
    const exists = documentRef.current.connections.some((connection) => connection.fromNodeId === fromNodeId && connection.toNodeId === toNodeId);
    if (!exists) {
      const connection: CanvasConnection = { id: createId('connection'), fromNodeId, toNodeId };
      commit((current) => ({ ...current, connections: [...current.connections, connection] }));
      setSelectedConnectionId(connection.id);
      setSelectedNodeId(null);
    }
    cancelConnection();
  }

  function cancelConnection() {
    setPendingConnection(null);
    setMouseWorld(null);
  }

  function getWorldPoint(clientX: number, clientY: number): Position {
    const stage = globalThis.document.querySelector('.canvas-workbench__stage')?.getBoundingClientRect();
    const point = stage ? { x: clientX - stage.left, y: clientY - stage.top } : { x: clientX, y: clientY };
    return screenToWorld(point, viewportRef.current);
  }

  const selectedNode = selectedNodeId ? document.nodes.find((node) => node.id === selectedNodeId) : null;
  const relatedNodeIds = new Set(document.connections.filter((connection) => connection.id === selectedConnectionId || connection.fromNodeId === selectedNodeId || connection.toNodeId === selectedNodeId).flatMap((connection) => [connection.fromNodeId, connection.toNodeId]));

  return (
    <main
      className="canvas-workbench"
      aria-label="画布工作区"
      ref={rootRef}
      onPointerDownCapture={() => { canvasActiveRef.current = true; }}
    >
      <header className="canvas-workbench__topbar">
        <div className="canvas-workbench__title-area">
          <button className="canvas-workbench__back" onClick={onBack} type="button">返回画布库</button>
          <div>
            <h1>{document.title}</h1>
            <p>{document.description || '暂无描述'}</p>
          </div>
        </div>
        <div className="canvas-workbench__meta">
          <span className={saveState === 'saved' ? 'canvas-workbench__save-state' : 'canvas-workbench__save-state canvas-workbench__save-state--dirty'}>{saveState === 'saved' ? '已保存' : '有未保存更改'}</span>
          <button className="canvas-workbench__save" onClick={saveMock} type="button">保存</button>
        </div>
      </header>

      <section className="canvas-workbench__stage">
        <InfiniteCanvas viewport={document.viewport} backgroundMode={document.backgroundMode} onViewportChange={updateViewport} onCanvasClick={() => { setSelectedNodeId(null); setSelectedConnectionId(null); }} onSpacePressedChange={setSpacePressed}>
          <CanvasConnections connections={document.connections} nodes={document.nodes} selectedNodeId={selectedNodeId} selectedConnectionId={selectedConnectionId} pendingConnection={pendingConnection} mouseWorld={mouseWorld} onSelectConnection={(id) => { setSelectedConnectionId(id); setSelectedNodeId(null); }} />
          {document.nodes.map((node) => (
            <CanvasNode key={node.id} node={node} selected={selectedNodeId === node.id} related={relatedNodeIds.has(node.id)} isSpacePressed={isSpacePressed} onPointerDown={handleNodePointerDown} onDelete={deleteNode} onConnectStart={startConnection} onConnectEnd={(_, nodeId, handleType) => finishConnection(nodeId, handleType)} />
          ))}
        </InfiniteCanvas>
        <CanvasToolbar hasSelection={Boolean(selectedNodeId || selectedConnectionId)} canUndo={history.past.length > 0} canRedo={history.future.length > 0} backgroundMode={document.backgroundMode} onAddNode={addNode} onDeleteSelected={deleteSelected} onClear={clearCanvas} onUndo={undo} onRedo={redo} onBackgroundModeChange={setBackgroundMode} onResetView={resetView} />
        <CanvasZoomControls scale={document.viewport.k} onScaleChange={(k) => updateViewport({ ...document.viewport, k })} onReset={resetView} />
        {selectedNode ? <div className="canvas-workbench__selection" data-canvas-control>{`选中：${selectedNode.title}`}</div> : selectedConnectionId ? <div className="canvas-workbench__selection" data-canvas-control>已选中连线</div> : null}
      </section>
    </main>
  );
}

function nodeTitle(type: CanvasNodeType) {
  if (type === 'image') return '图片节点';
  if (type === 'config') return '配置节点';
  if (type === 'video') return '视频节点';
  if (type === 'audio') return '音频节点';
  return '文本节点';
}

function nodeContent(type: CanvasNodeType) {
  if (type === 'image') return '用于占位本地图片或后续生成的视觉结果。';
  if (type === 'config') return '记录模型、尺寸、质量等生成参数。';
  if (type === 'video') return '用于规划视频镜头、素材节奏和旁白结构。';
  if (type === 'audio') return '用于规划音频、配乐或旁白生成需求。';
  return '写下一段可继续拆分的创作内容。';
}
