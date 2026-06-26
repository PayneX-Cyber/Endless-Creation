import { useState, type ReactNode } from 'react';
import './ProjectManagement.css';

type ProjectStatus = '进行中' | '草稿' | '未开始';
type ProjectTone = 'novel' | 'script' | 'image' | 'video';

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

const filters = ['全部', '最近编辑', '小说', '剧本', '生图', '视频'] as const;

const projects: ProjectCardItem[] = [
  {
    id: 'fog-boundary',
    name: '《雾城边界》小说项目',
    type: '小说创作',
    status: '进行中',
    description: '长篇小说世界观、章节和角色设定。',
    stats: '12 个章节 · 6 个角色 · 3 条世界观设定',
    updatedAt: '今天 14:32',
    path: '本地项目 / Endless Creation',
    tone: 'novel',
  },
  {
    id: 'restart-life',
    name: '短剧《重启人生》',
    type: '剧本工作台',
    status: '草稿',
    description: '短剧分场、角色对白和分镜草案。',
    stats: '8 场戏 · 4 个角色 · 2 版分镜',
    updatedAt: '昨天 21:10',
    path: '本地项目 / Endless Creation',
    tone: 'script',
  },
  {
    id: 'cyber-city',
    name: '赛博城市视觉探索',
    type: '生图工作台',
    status: '进行中',
    description: '城市概念图、提示词和参考图探索。',
    stats: '24 张图片 · 5 条提示词 · 3 张参考图',
    updatedAt: '本周',
    path: '本地项目 / Endless Creation',
    tone: 'image',
  },
  {
    id: 'brand-video',
    name: '品牌宣传视频草案',
    type: '视频工作台',
    status: '未开始',
    description: '镜头脚本、旁白和素材节奏规划。',
    stats: '3 个镜头 · 2 段旁白 · 6 个素材',
    updatedAt: '本周',
    path: '本地项目 / Endless Creation',
    tone: 'video',
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
          <p>本地项目库</p>
          <h1>项目管理</h1>
          <span>管理本地 AI 创作项目，继续小说、剧本、生图、视频等创作工作。</span>
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

      <section className="project-management__grid" aria-label="本地项目列表">
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
                <button onClick={() => mockAction('打开项目')} type="button">打开项目</button>
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
  if (tone === 'novel') return <BookIcon />;
  if (tone === 'script') return <ScriptIcon />;
  if (tone === 'video') return <VideoIcon />;
  return <ImageIcon />;
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
function BookIcon() { return <IconFrame><path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H20v16H7.5A2.5 2.5 0 0 0 5 21V5.5Z" /><path d="M9 7h6M9 11h5" /></IconFrame>; }
function ScriptIcon() { return <IconFrame><path d="M7 4h8l4 4v12H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" /><path d="M15 4v5h5M9 12h6M9 16h6" /></IconFrame>; }
function ImageIcon() { return <IconFrame><rect x="4" y="5" width="16" height="14" rx="3" /><circle cx="9" cy="10" r="1.5" /><path d="m6.5 17 4-4 3 3 2-2 3 3" /></IconFrame>; }
function VideoIcon() { return <IconFrame><rect x="4" y="6" width="11" height="12" rx="3" /><path d="m15 10 5-3v10l-5-3" /></IconFrame>; }
