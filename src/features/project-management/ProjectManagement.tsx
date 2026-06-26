import type { ReactNode } from 'react';
import './ProjectManagement.css';

const canvases = [
  { id: 'canvas-2', title: '无限画布 2', nodes: 23, edges: 32, updatedAt: '06/24 18:06' },
  { id: 'canvas-1', title: '无限画布 1', nodes: 19, edges: 25, updatedAt: '06/26 13:02' },
];

export function ProjectManagement() {
  return (
    <main className="project-management" aria-label="项目管理">
      <section className="project-management__header">
        <div className="project-management__title-group">
          <p>画布库</p>
          <h1>无限画布</h1>
        </div>
        <div className="project-management__actions" aria-label="画布操作">
          <button className="project-management__button" type="button">删除全部</button>
          <button className="project-management__button" type="button"><ImportIcon />导入画布</button>
          <button className="project-management__button project-management__button--primary" type="button"><PlusIcon />新建画布</button>
        </div>
      </section>

      <div className="project-management__divider" />

      <section className="project-management__grid" aria-label="画布列表">
        {canvases.map((canvas) => (
          <article className="canvas-card" key={canvas.id}>
            <div className="canvas-card__topline">
              <label className="canvas-card__checkbox">
                <input aria-label={`选择${canvas.title}`} type="checkbox" />
                <span aria-hidden="true" />
              </label>
              <div>
                <h2>{canvas.title}</h2>
                <p>{canvas.nodes} 个节点 · {canvas.edges} 条连线</p>
              </div>
            </div>
            <footer className="canvas-card__footer">
              <span>更新于 {canvas.updatedAt}</span>
              <div className="canvas-card__icons" aria-label={`${canvas.title} 操作`}>
                <button aria-label="下载" type="button"><DownloadIcon /></button>
                <button aria-label="编辑" type="button"><EditIcon /></button>
                <button aria-label="删除" type="button"><TrashIcon /></button>
              </div>
            </footer>
          </article>
        ))}
      </section>
    </main>
  );
}

function IconFrame({ children }: { children: ReactNode }) {
  return <svg aria-hidden="true" fill="none" focusable="false" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">{children}</svg>;
}

function PlusIcon() { return <IconFrame><path d="M12 5v14M5 12h14" /></IconFrame>; }
function ImportIcon() { return <IconFrame><path d="M7 4h8l4 4v12H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" /><path d="M15 4v5h5M12 12v5M9.5 14.5 12 17l2.5-2.5" /></IconFrame>; }
function DownloadIcon() { return <IconFrame><path d="M12 4v10M8.5 10.5 12 14l3.5-3.5" /><path d="M5 18h14" /></IconFrame>; }
function EditIcon() { return <IconFrame><path d="m4 20 4.8-1 9.9-9.9a2.1 2.1 0 0 0-3-3L5.8 16 4 20Z" /></IconFrame>; }
function TrashIcon() { return <IconFrame><path d="M5 7h14M10 11v6M14 11v6M8 7l1-3h6l1 3M7 7l1 14h8l1-14" /></IconFrame>; }
