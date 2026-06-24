export type ThemeMode = 'dark' | 'light';

export type CreationMode = 'text' | 'image' | 'video' | 'library';
export type GenerationMode = CreationMode;

export type GenerationTaskStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export interface NavItem {
  id: CreationMode;
  label: string;
  description: string;
  shortcut: string;
}

export interface RecentProject {
  id: string;
  title: string;
  type: string;
  updatedAt: string;
  status: 'draft' | 'ready' | 'review';
}

export interface GenerationResult {
  title: string;
  summary: string;
  content: string;
}

export interface GenerationTask {
  id: string;
  mode: GenerationMode;
  prompt: string;
  status: GenerationTaskStatus;
  createdAt: string;
  updatedAt: string;
  result?: GenerationResult;
  errorMessage?: string;
}
