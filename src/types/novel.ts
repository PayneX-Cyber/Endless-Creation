export interface ChapterVersion {
  id: string;
  content: string;
  createdAt: string;
}

export interface Chapter {
  id: string;
  title: string;
  content: string;
  outline?: string;
  versions?: ChapterVersion[];
  selectedVersionId?: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface Foreshadowing {
  id: string;
  title: string;                 // 伏笔简述（必需，空则不落库）
  plantedChapterId: string;      // 埋设章节引用（可为空串 = 未指定章节）
  status: 'planted' | 'paidOff'; // 埋设中 / 已回收
  payoffChapterId?: string;      // 回收章节引用（可选）
  note?: string;                 // 备注：怎么回收 / 暗示内容（可选）
  createdAt: string;
  updatedAt: string;
}

export interface Novel {
  id: string;
  projectId?: string;
  title: string;
  summary: string;
  note: string;
  idea?: string;
  blueprint?: string;
  chapters: Chapter[];
  foreshadowings: Foreshadowing[];
  version: 4;
  createdAt: string;
  updatedAt: string;
}

export type NovelSummary = Pick<Novel, 'id' | 'projectId' | 'title' | 'summary' | 'createdAt' | 'updatedAt'> & {
  chapterCount: number;
  wordCount: number;
  filledChapterCount: number;
};

export type NovelResult = { ok: boolean; message: string; novel?: Novel };
export type NovelListResult = { ok: boolean; message?: string; novels: NovelSummary[] };
