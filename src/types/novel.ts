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

export interface Novel {
  id: string;
  title: string;
  summary: string;
  note: string;
  idea?: string;
  blueprint?: string;
  chapters: Chapter[];
  version: 3;
  createdAt: string;
  updatedAt: string;
}

export type NovelSummary = Pick<Novel, 'id' | 'title' | 'summary' | 'createdAt' | 'updatedAt'> & {
  chapterCount: number;
  wordCount: number;
  filledChapterCount: number;
};

export type NovelResult = { ok: boolean; message: string; novel?: Novel };
export type NovelListResult = { ok: boolean; message?: string; novels: NovelSummary[] };
