interface CanvasLibraryProps {
  canvasCount: number;
  projectName?: string;
  onCreateCanvas: () => void;
  onImportCanvas: () => void;
  onOpenCanvas: (canvasId: string) => void;
  onClearAll: () => void;
}

const fallbackCanvasIds = ['canvas-2', 'canvas-1', 'relationship-canvas', 'archive-board'];

export function CanvasLibrary({ canvasCount, projectName, onCreateCanvas, onImportCanvas, onOpenCanvas, onClearAll }: CanvasLibraryProps) {
  const cards = Array.from({ length: Math.max(0, canvasCount) }, (_, index) => ({
    id: fallbackCanvasIds[index] ?? `canvas-${index + 1}`,
    title: `无限画布 ${index + 1}`,
    updatedAt: index === 0 ? '07/08 23:13' : '今天',
  }));

  return (
    <main className="canvas-library" aria-label="画布库">
      <header className="canvas-library__head">
        <div>
          <span>画布库</span>
          <h1>无限画布</h1>
          {projectName ? <p>{projectName}</p> : null}
        </div>
        <div className="canvas-library__actions">
          <button type="button" onClick={onClearAll}>删除全部</button>
          <button type="button" onClick={onImportCanvas}>导入画布</button>
          <button className="canvas-library__primary" type="button" onClick={onCreateCanvas}>＋ 新建画布</button>
        </div>
      </header>

      <section className="canvas-library__grid" aria-label="画布列表">
        {cards.length ? cards.map((card) => (
          <article className="canvas-library__card" key={card.id} onDoubleClick={() => onOpenCanvas(card.id)}>
            <label className="canvas-library__check">
              <input type="checkbox" aria-label={`选择${card.title}`} />
            </label>
            <button className="canvas-library__open" type="button" onClick={() => onOpenCanvas(card.id)}>
              <strong>{card.title}</strong>
              <span>0 个节点 · 0 条连线</span>
            </button>
            <footer>
              <span>更新于 {card.updatedAt}</span>
              <div>
                <button type="button" aria-label={`下载${card.title}`}>⇩</button>
                <button type="button" aria-label={`重命名${card.title}`}>✎</button>
                <button type="button" aria-label={`删除${card.title}`}>⌫</button>
              </div>
            </footer>
          </article>
        )) : (
          <div className="canvas-library__empty">
            <strong>暂无画布</strong>
            <button type="button" onClick={onCreateCanvas}>新建画布</button>
          </div>
        )}
      </section>
    </main>
  );
}
