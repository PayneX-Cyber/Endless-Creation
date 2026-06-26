import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type WheelEvent as ReactWheelEvent } from 'react';
import { clampScale, zoomAtPoint } from './canvasMath';
import type { CanvasBackgroundMode, ViewportTransform } from './types';

interface InfiniteCanvasProps {
  viewport: ViewportTransform;
  backgroundMode: CanvasBackgroundMode;
  onViewportChange: (viewport: ViewportTransform) => void;
  onCanvasClick: () => void;
  onSpacePressedChange?: (pressed: boolean) => void;
  children: ReactNode;
}

export function InfiniteCanvas({ viewport, backgroundMode, onViewportChange, onCanvasClick, onSpacePressedChange, children }: InfiniteCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const panRef = useRef({ active: false, pointerId: 0, startX: 0, startY: 0, initialX: 0, initialY: 0, moved: false });
  const viewportRef = useRef(viewport);
  const [isSpacePressed, setSpacePressed] = useState(false);

  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const preventDocumentScroll = (event: WheelEvent) => event.preventDefault();
    container.addEventListener('wheel', preventDocumentScroll, { passive: false });
    return () => container.removeEventListener('wheel', preventDocumentScroll);
  }, []);

  useEffect(() => {
    function setPressed(pressed: boolean) {
      setSpacePressed(pressed);
      onSpacePressedChange?.(pressed);
    }

    function isEditableTarget(target: EventTarget | null) {
      if (!(target instanceof HTMLElement)) return false;
      return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target.isContentEditable;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.code !== 'Space' || isEditableTarget(event.target)) return;
      setPressed(true);
    }
    function handleKeyUp(event: KeyboardEvent) {
      if (event.code === 'Space') setPressed(false);
    }
    function handleBlur() {
      setPressed(false);
    }
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [onSpacePressedChange]);

  function handleWheel(event: ReactWheelEvent<HTMLDivElement>) {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('[data-canvas-control]')) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const factor = Math.pow(1.1, -event.deltaY / 100);
    const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    onViewportChange(zoomAtPoint(viewportRef.current, point, viewportRef.current.k * factor));
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    const target = event.target instanceof Element ? event.target : null;
    if (event.button !== 0 || target?.closest('[data-canvas-control]')) return;
    if (target?.closest('[data-canvas-node]') && !isSpacePressed) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    panRef.current = {
      active: true,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      initialX: viewportRef.current.x,
      initialY: viewportRef.current.y,
      moved: false,
    };
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const pan = panRef.current;
    if (!pan.active || pan.pointerId !== event.pointerId) return;
    const dx = event.clientX - pan.startX;
    const dy = event.clientY - pan.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) pan.moved = true;
    onViewportChange({ x: pan.initialX + dx, y: pan.initialY + dy, k: viewportRef.current.k });
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const pan = panRef.current;
    if (!pan.active || pan.pointerId !== event.pointerId) return;
    panRef.current.active = false;
    if (!pan.moved) onCanvasClick();
  }

  return (
    <div
      className={`infinite-canvas infinite-canvas--${backgroundMode} ${isSpacePressed ? 'infinite-canvas--space' : ''}`}
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onWheel={handleWheel}
    >
      <CanvasGrid viewport={viewport} backgroundMode={backgroundMode} />
      <div className="infinite-canvas__world" style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${clampScale(viewport.k)})` }}>
        {children}
      </div>
    </div>
  );
}

function CanvasGrid({ viewport, backgroundMode }: { viewport: ViewportTransform; backgroundMode: CanvasBackgroundMode }) {
  const gridSize = Math.max(12, 48 * viewport.k);
  if (backgroundMode === 'blank') return null;
  return (
    <div
      className={`infinite-canvas__grid infinite-canvas__grid--${backgroundMode}`}
      style={{
        backgroundSize: `${gridSize}px ${gridSize}px`,
        backgroundPosition: `${viewport.x % gridSize}px ${viewport.y % gridSize}px`,
      }}
    />
  );
}
