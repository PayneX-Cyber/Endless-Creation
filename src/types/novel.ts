export interface ChapterVersion {
  id: string;
  content: string;
  createdAt: string;
}

export type ChapterStatus = 'draft' | 'inProgress' | 'done';

export interface Volume {
  id: string;
  title: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface Chapter {
  id: string;
  title: string;
  content: string;
  outline?: string;
  versions?: ChapterVersion[];
  selectedVersionId?: string;
  status?: ChapterStatus;
  wordTarget?: number;
  volumeId?: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export type SettingType = 'character' | 'location' | 'organization' | 'item' | 'term' | 'rule' | 'other';

export interface SettingEntry {
  id: string;
  type: SettingType;
  title: string;
  body: string;
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

export interface EmotionPoint {
  chapterId: string;
  score: number;
  reason: string;
  updatedAt: string;
}

export interface EmotionArc {
  points: EmotionPoint[];
  updatedAt: string;
}

export interface GraphCharacter {
  name: string;
  role: string;
  description: string;
}

export interface GraphRelationship {
  from: string;
  to: string;
  label: string;
}

export interface CharacterGraph {
  characters: GraphCharacter[];
  relationships: GraphRelationship[];
}

export interface Novel {
  id: string;
  projectId?: string;
  title: string;
  summary: string;
  note: string;
  idea?: string;
  blueprint?: string;
  wordTarget?: number;
  volumes: Volume[];
  chapters: Chapter[];
  foreshadowings: Foreshadowing[];
  settings?: SettingEntry[];
  pinnedSettingIds?: string[];
  pinnedForeshadowingIds?: string[];
  emotionArc?: EmotionArc;
  characterGraph?: CharacterGraph;
  version: 7;
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
