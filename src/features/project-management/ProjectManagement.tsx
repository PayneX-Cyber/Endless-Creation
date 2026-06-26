import { useState, type ReactNode } from 'react';
import './ProjectManagement.css';

type ProjectStatus = '进行中' | '草稿' | '已归档';
type ProjectTone = 'canvas' | 'local' | 'relation' | 'archive';

interface ProjectCardItem {
  id: string;
  name: string;
  type: string;
  status: ProjectStatus;
  description: string;
  stats: string;
  updatedAt: string;
  path: string;
  tone: ProjectTone;
}

const filters = ['全部', '最近编辑', '本地项目', '画布项目', '草稿', '已归档'] as const;

const projects: ProjectCardItem[] = [
  {
    id: 'canvas-2',
    name: '无限画布 2',
    type: '画布项目',
    status: '进行中',
    description: '用于整理创作节点、资源关系和画面结构。',
    stats: '23 个节点 · 32 条连线',
    updatedAt: '06/24 18:06',
    path: '本地项目 / Endless Creation',
    tone: 'canvas',
  },
  {
    id: 'canvas-1',
    name: '无限画布 1',
    type: '画布项目',
    status: '草稿',
    description: '用于搭建早期创作思路和节点编排。',
    stats: '19 个节点 · 25 条连线',
    updatedAt: '06/26 13:02',
    path: '本地项目 / Endless Creation',
    tone: 'local',
  },
  {
    id: 'relationship-canvas',
    name: '角色关系画布',
    type: '画布项目',
    status: '进行中',
    description: '整理角色、场景和资源之间的关系。',
    stats: '12 个节点 · 8 条连线',
    updatedAt: '今天 14:32',
    path: '本地项目 / Endless Creation',
    tone: 'relation',
  },
  {
    id: 'archive-board',
    name: '资源编排画布',
    type: '画布项目',
    status: '已归档',
    description: '保留已完成阶段的节点结构和编排记录。',
    stats: '16 个节点 · 14 条连线',
    updatedAt: '上周',
    path: '本地项目 / Endless Creation',
    tone: 'archive',
  },
];

export function ProjectManagement() {
  const [activeFilter, setActiveFilter] = useState<(typeof filters)[number]>('全部');
  const [feedback, setFeedback] = useState('');

  function mockAction(label: string) {
    setFeedback(`${label} 是 mock 操作，暂未接入本地文件系统。`);
  }

  return (
    <main className="project-management" aria-label="项目管理">
      <section className="project-management__header">
        <div className="project-management__title-group">
          <p>本地画布项目</p>
          <h1>项目管理</h1>
          <span>管理本地画布项目，进入画布进行创作编排。</span>
        </div>
        <div className="project-management__actions" aria-label="项目操作">
          <button className="project-management__button" onClick={() => mockAction('导入项目')} type="button">
            <ImportIcon />
            导入项目
          </button>
          <button className="project-management__button" onClick={() => mockAction('打开本地项目')} type="button">
            <FolderOpenIcon />
            打开本地项目
          </button>
          <button className="project-management__button project-management__button--primary" onClick={() => mockAction('新建项目')} type="button">
            <PlusIcon />
            新建项目
          </button>
        </div>
      </section>

      <div className="project-management__divider" />

      <section className="project-management__toolbar" aria-label="项目搜索与筛选">
        <label className="project-management__search">
          <SearchIcon />
          <input placeholder="搜索项目、画布或资产…" type="search" />
        </label>
        <div className="project-management__filters" role="group" aria-label="项目筛选">
          {filters.map((filter) => (
            <button
              aria-pressed={activeFilter === filter}
              className={activeFilter === filter ? 'project-management__filter project-management__filter--active' : 'project-management__filter'}
              key={filter}
              onClick={() => setActiveFilter(filter)}
              type="button"
            >
              {filter}
            </button>
          ))}
        </div>
      </section>

      {feedback && <div className="project-management__feedback" aria-live="polite">{feedback}</div>}

      <section className="project-management__grid" aria-label="本地画布项目列表">
        {projects.map((project) => (
          <article className={`project-card project-card--${project.tone}`} key={project.id}>
            <div className="project-card__topline">
              <div className="project-card__badges">
                <span className="project-card__type">{project.type}</span>
                <span className={`project-card__status project-card__status--${statusClass(project.status)}`}>{project.status}</span>
              </div>
              <ProjectTypeIcon tone={project.tone} />
            </div>
            <h2>{project.name}</h2>
            <p>{project.description}</p>
            <div className="project-card__stats">{project.stats}</div>
            <div className="project-card__path">{project.path}</div>
            <footer className="project-card__footer">
              <span>最近编辑：{project.updatedAt}</span>
              <div className="project-card__actions">
                <button onClick={() => mockAction('打开画布')} type="button">打开画布</button>
                <button aria-label={`${project.name} 更多操作`} onClick={() => mockAction('更多')} type="button">更多</button>
              </div>
            </footer>
          </article>
        ))}
      </section>
    </main>
  );
}

function statusClass(status: ProjectStatus) {
  if (status === '进行中') return 'active';
  if (status === '草稿') return 'draft';
  return 'pending';
}

function ProjectTypeIcon({ tone }: { tone: ProjectTone }) {
  if (tone === 'relation') return <RelationIcon />;
  if (tone === 'archive') return <ArchiveIcon />;
  return <CanvasIcon />;
}

function IconFrame({ children }: { children: ReactNode }) {
  return (
    <svg aria-hidden="true" fill="none" focusable="false" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      {children}
    </svg>
  );
}

function PlusIcon() { return <IconFrame><path d="M12 5v14M5 12h14" /></IconFrame>; }
function ImportIcon() { return <IconFrame><path d="M7 4h8l4 4v12H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" /><path d="M15 4v5h5M12 12v5M9.5 14.5 12 17l2.5-2.5" /></IconFrame>; }
function FolderOpenIcon() { return <IconFrame><path d="M4 8.5A2.5 2.5 0 0 1 6.5 6H10l2 2h5.5A2.5 2.5 0 0 1 20 10.5" /><path d="M4 10h16l-1.5 8.5A2 2 0 0 1 16.5 20h-9a2 2 0 0 1-2-1.5L4 10Z" /></IconFrame>; }
function SearchIcon() { return <IconFrame><circle cx="10.5" cy="10.5" r="5.5" /><path d="m15 15 4 4" /></IconFrame>; }
function CanvasIcon() { return <IconFrame><rect x="4" y="4" width="16" height="16" rx="4" /><path d="M8 9h3M13 9h3M8 15h3M13 15h3M11 9v6M13 9v6" /></IconFrame>; }
function RelationIcon() { return <IconFrame><circle cx="7" cy="7" r="3" /><circle cx="17" cy="8" r="3" /><circle cx="12" cy="17" r="3" /><path d="m9.7 8 4.6.5M8.5 9.6l2 4.8M15.5 10.4l-2 4.1" /></IconFrame>; }
function ArchiveIcon() { return <IconFrame><path d="M5 7h14M7 7v12h10V7M6 4h12l1 3H5l1-3Z" /><path d="M10 11h4" /></IconFrame>; }
