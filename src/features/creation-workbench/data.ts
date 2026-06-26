import type { NavItem, RecentProject } from '../../types/workspace';

export const NAV_ITEMS: NavItem[] = [
  { id: 'text', label: '文本生成', description: '脚本、文案、长文结构', shortcut: 'Ctrl 1' },
  { id: 'image', label: '图片生成', description: '概念图、海报、分镜', shortcut: 'Ctrl 2' },
  { id: 'video', label: '视频生成', description: '镜头脚本与成片规划', shortcut: 'Ctrl 3' },
  { id: 'library', label: '项目库', description: '素材、草稿、历史版本', shortcut: 'Ctrl 4' },
];

export const RECENT_PROJECTS: RecentProject[] = [
  { id: 'p1', title: '品牌短片脚本探索', type: '视频企划', updatedAt: '今天 09:42', status: 'draft' },
  { id: 'p2', title: '新品发布视觉方向', type: '图片集', updatedAt: '昨天 18:16', status: 'review' },
  { id: 'p3', title: '创作者周报初稿', type: '文本', updatedAt: '周一 14:03', status: 'ready' },
];

export const QUICK_ACTIONS = [
  { title: '从一句想法开始', body: '输入主题，生成可继续编辑的创作大纲。', meta: '推荐' },
  { title: '整理已有素材', body: '把零散灵感归档为项目、角色和场景。', meta: '项目' },
  { title: '创建多模态方案', body: '同步规划文案、主视觉与视频分镜。', meta: '工作流' },
];
