// Project Shell v1: lightweight project center modal.
// Front-end-only. Mock stats, no real storage. New/open project are stubbed.
import { useState } from 'react';
import {
  filterProjects,
  truncatePath,
  type ProjectCardData,
  type ProjectFilter,
} from './projectShellData';

export interface ProjectCenterModalProps {
  open: boolean;
  projects: ProjectCardData[];
  activeProjectId: string | null;
  recentProjectIds: string[];
  onClose: () => void;
  onSwitchProject: (projectId: string) => void;
  onEnterCanvas: (projectId: string) => void;
  onWriteNovel: (projectId: string) => void;
}

const filterTabs: Array<{ id: ProjectFilter; label: string }> = [
  { id: 'recent', label: '最近使用' },
  { id: 'all', label: '全部项目' },
  { id: 'local', label: '本地项目' },
];

export function ProjectCenterModal({
  open,
  projects,
  activeProjectId,
  recentProjectIds,
  onClose,
  onSwitchProject,
  onEnterCanvas,
  onWriteNovel,
}: ProjectCenterModalProps) {
  const [filter, setFilter] = useState<ProjectFilter>('recent');
  const [query, setQuery] = useState('');

  if (!open) return null;

  const visibleProjects = filterProjects(projects, filter, recentProjectIds, query);

  return (
    <div className="project-center" role="dialog" aria-modal="true" aria-label="项目中心">
      <div className="project-center__scrim" onClick={onClose} />
      <div className="project-center__panel">
        <header className="project-center__head">
          <div className="project-center__title">
            <strong>项目中心</strong>
            <span>Project Center</span>
          </div>
          <div className="project-center__head-actions">
            <button className="project-center__action" type="button" onClick={() => window.alert('第一版暂未接入：新建项目')}>新建项目</button>
            <button className="project-center__action" type="button" onClick={() => window.alert('第一版暂未接入：打开本地')}>打开本地</button>
            <button className="project-center__close" type="button" aria-label="关闭" onClick={onClose}>×</button>
          </div>
        </header>

        <div className="project-center__toolbar">
          <div className="project-center__filters">
            {filterTabs.map((tab) => (
              <button
                key={tab.id}
                className={`project-center__filter ${filter === tab.id ? 'project-center__filter--active' : ''}`}
                type="button"
                onClick={() => setFilter(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <input
            className="project-center__search"
            type="search"
            placeholder="搜索项目..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        <div className="project-center__grid">
          {visibleProjects.length === 0 ? (
            <div className="project-center__empty">没有匹配的项目。</div>
          ) : (
            visibleProjects.map((project) => {
              const isActive = project.id === activeProjectId;
              return (
                <article
                  key={project.id}
                  className={`project-card ${isActive ? 'project-card--active' : ''}`}
                  onDoubleClick={() => onSwitchProject(project.id)}
                >
                  <div className="project-card__body">
                    <div className="project-card__title-row">
                      <strong className="project-card__name">{project.name}</strong>
                      {isActive && <span className="project-card__badge">当前</span>}
                    </div>
                    <div className="project-card__path" title={project.path}>{truncatePath(project.path)}</div>
                    <div className="project-card__stats">
                      <span>画布 {project.stats.canvasCount}</span>
                      <span>小说 {project.stats.novelCount}</span>
                      <span>图片 {project.stats.imageCount}</span>
                      <span>提示词 {project.stats.promptCount}</span>
                    </div>
                    <div className="project-card__updated">{project.updatedLabel}</div>
                  </div>
                  <div className="project-card__hover">
                    <button
                      className="project-card__primary"
                      type="button"
                      onClick={() => onSwitchProject(project.id)}
                    >
                      切换成此项目
                    </button>
                    <div className="project-card__secondary-row">
                      <button className="project-card__secondary" type="button" onClick={() => onEnterCanvas(project.id)}>进入画布</button>
                      <button className="project-card__secondary" type="button" onClick={() => onWriteNovel(project.id)}>写小说</button>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
