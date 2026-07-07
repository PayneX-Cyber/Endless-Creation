// Project Shell v1: front-end-only mock project context.
// No real storage, no real stats. Backing store lands in a later phase.

export type ProjectType = 'local' | 'mixed';

export interface Project {
  id: string;
  name: string;
  description: string;
  type: ProjectType;
  path?: string;
  updatedAt: string;
}

export interface ProjectStats {
  canvasCount: number;
  novelCount: number;
  imageCount: number;
  promptCount: number;
  videoCount?: number;
}

export interface ProjectCardData extends Project {
  stats: ProjectStats;
  updatedLabel: string;
}

// Mock catalogue. First entry is the default active project.
export const mockProjects: ProjectCardData[] = [
  {
    id: 'star-chronicles',
    name: '星港纪元',
    description: '科幻长篇，星际殖民与文明冲突。',
    type: 'mixed',
    path: 'D:/Projects/StarChronicles',
    updatedAt: '2026-07-07T09:50:00.000Z',
    updatedLabel: '10分钟前编辑',
    stats: { canvasCount: 1, novelCount: 2, imageCount: 36, promptCount: 12 },
  },
  {
    id: 'character-lab',
    name: '角色设定实验',
    description: '角色小传与设定草稿的试验田。',
    type: 'mixed',
    path: 'D:/Projects/CharacterLab',
    updatedAt: '2026-07-06T10:00:00.000Z',
    updatedLabel: '昨天编辑',
    stats: { canvasCount: 3, novelCount: 0, imageCount: 142, promptCount: 2 },
  },
  {
    id: 'storyboard-test',
    name: '分镜测试项目',
    description: '分镜与短视频流程验证。',
    type: 'mixed',
    path: 'D:/Projects/StoryboardTest',
    updatedAt: '2026-07-04T10:00:00.000Z',
    updatedLabel: '3天前编辑',
    stats: { canvasCount: 1, novelCount: 0, imageCount: 0, promptCount: 8, videoCount: 4 },
  },
  {
    id: 'idea-scratch',
    name: '灵感草稿箱',
    description: '零散灵感与临时片段。',
    type: 'local',
    path: 'D:/Projects/IdeaScratch',
    updatedAt: '2026-07-01T10:00:00.000Z',
    updatedLabel: '上周编辑',
    stats: { canvasCount: 0, novelCount: 1, imageCount: 3, promptCount: 0 },
  },
  {
    id: 'worldbuilding',
    name: '世界观设定集',
    description: '世界观、地理、势力与年表。',
    type: 'local',
    path: 'D:/Projects/Worldbuilding',
    updatedAt: '2026-06-28T10:00:00.000Z',
    updatedLabel: '上周编辑',
    stats: { canvasCount: 2, novelCount: 0, imageCount: 18, promptCount: 24 },
  },
  {
    id: 'short-drama',
    name: '都市短剧本',
    description: '都市题材短剧脚本合集。',
    type: 'mixed',
    path: 'D:/Projects/ShortDrama',
    updatedAt: '2026-06-20T10:00:00.000Z',
    updatedLabel: '两周前编辑',
    stats: { canvasCount: 1, novelCount: 3, imageCount: 5, promptCount: 6, videoCount: 2 },
  },
];

export const DEFAULT_ACTIVE_PROJECT_ID = mockProjects[0].id;

// Initial recent list: default project first, capped at 5.
export const INITIAL_RECENT_PROJECT_IDS: string[] = mockProjects.slice(0, 5).map((project) => project.id);

export const MAX_RECENT_PROJECTS = 5;

export function getProjectById(projectId: string | null): ProjectCardData | undefined {
  if (!projectId) return undefined;
  return mockProjects.find((project) => project.id === projectId);
}

// Move the picked project to the head, dedupe, cap at MAX_RECENT_PROJECTS.
export function promoteRecentProject(recentIds: string[], projectId: string): string[] {
  return [projectId, ...recentIds.filter((id) => id !== projectId)].slice(0, MAX_RECENT_PROJECTS);
}

// Middle-truncate a long path: keep head + tail, elide the middle.
export function truncatePath(path: string | undefined, head = 12, tail = 16): string {
  if (!path) return '';
  if (path.length <= head + tail + 3) return path;
  return `${path.slice(0, head)}...${path.slice(-tail)}`;
}

export type ProjectFilter = 'recent' | 'all' | 'local';

export function filterProjects(
  projects: ProjectCardData[],
  filter: ProjectFilter,
  recentIds: string[],
  query: string,
): ProjectCardData[] {
  const trimmed = query.trim().toLowerCase();
  let scoped: ProjectCardData[];
  if (filter === 'recent') {
    scoped = recentIds
      .map((id) => projects.find((project) => project.id === id))
      .filter((project): project is ProjectCardData => Boolean(project));
  } else if (filter === 'local') {
    scoped = projects.filter((project) => project.type === 'local');
  } else {
    scoped = projects;
  }
  if (!trimmed) return scoped;
  return scoped.filter(
    (project) =>
      project.name.toLowerCase().includes(trimmed) ||
      project.description.toLowerCase().includes(trimmed) ||
      (project.path?.toLowerCase().includes(trimmed) ?? false),
  );
}
