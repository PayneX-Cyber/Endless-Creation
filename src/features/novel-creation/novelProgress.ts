import type { Chapter, ChapterStatus, Novel } from '../../types/novel';
import { countWords } from './novelShared';
import { chapterText } from './sceneStructure';

export const CHAPTER_STATUS_ORDER: ChapterStatus[] = ['draft', 'inProgress', 'done'];

export const CHAPTER_STATUS_LABEL: Record<ChapterStatus, string> = {
  draft: '草稿',
  inProgress: '进行中',
  done: '完成',
};

export const PROGRESS_LABELS = {
  sectionTitle: '长篇进度',
  statusCompletion: '状态完成率',
  wordCompletion: '字数达成率',
  contentCompletion: '正文完成度',
  statusDistribution: '章节状态分布',
  totalWords: '总字数',
  novelTarget: '总字数目标',
  chapterTarget: '本章字数目标',
  noTarget: '未设目标',
  targetPlaceholder: '设定目标字数',
};

// 软门禁提示：只静态提示，不阻断写作。
export const SOFT_GATE_HINTS = {
  belowTarget: (remaining: number) => `距本章目标还差约 ${remaining} 字。`,
  reachedTarget: '本章已达到设定字数目标。',
  markDone: '本章正文已充实，可将状态标记为「完成」。',
};

// 统一口径：显式状态优先；缺失时 空=草稿 / 有正文=进行中。完成必须显式设置。
export function resolveChapterStatus(chapter: Chapter): ChapterStatus {
  if (chapter.status === 'draft' || chapter.status === 'inProgress' || chapter.status === 'done') {
    return chapter.status;
  }
  return chapterText(chapter).trim() ? 'inProgress' : 'draft';
}

export interface ProgressSummary {
  totalChapters: number;
  totalWords: number;
  statusCounts: Record<ChapterStatus, number>;
  doneCount: number;
  statusCompletionRate: number;
  novelWordTarget?: number;
  wordCompletionRate?: number;
}

export function summarizeProgress(novel: Novel): ProgressSummary {
  const statusCounts: Record<ChapterStatus, number> = { draft: 0, inProgress: 0, done: 0 };
  let totalWords = 0;
  for (const chapter of novel.chapters) {
    statusCounts[resolveChapterStatus(chapter)] += 1;
    totalWords += countWords(chapterText(chapter));
  }
  const totalChapters = novel.chapters.length;
  const doneCount = statusCounts.done;
  const statusCompletionRate = totalChapters ? doneCount / totalChapters : 0;
  const novelWordTarget = typeof novel.wordTarget === 'number' && novel.wordTarget > 0 ? novel.wordTarget : undefined;
  const wordCompletionRate = novelWordTarget ? totalWords / novelWordTarget : undefined;
  return {
    totalChapters,
    totalWords,
    statusCounts,
    doneCount,
    statusCompletionRate,
    novelWordTarget,
    wordCompletionRate,
  };
}

export function formatPercent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}
