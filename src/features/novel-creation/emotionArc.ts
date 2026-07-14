import type { Chapter, EmotionArc, EmotionPoint, Novel } from '../../types/novel';

const CODE_FENCE_PATTERN = /^```(?:json)?\s*([\s\S]*?)\s*```$/;

export interface EmotionPointCandidate {
  chapterId: string;
  score: number;
  reason: string;
}

export type { EmotionArc, EmotionPoint } from '../../types/novel';

export type ParsedEmotionPoint =
  | { kind: 'ok'; point: EmotionPointCandidate }
  | { kind: 'invalid' };

export type EmotionMessage = { role: 'system' | 'user'; content: string };

function normalizeScore(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(-100, Math.min(100, Math.round(value)));
}

export function mergeEmotionPoints(
  current: EmotionArc | null,
  novel: Novel,
  points: EmotionPointCandidate[],
  now: string,
): EmotionArc {
  const validIds = new Set(novel.chapters.map((chapter) => chapter.id));
  const merged = new Map((current?.points ?? []).map((point) => [point.chapterId, point]));
  for (const candidate of points) {
    if (!validIds.has(candidate.chapterId)) continue;
    const score = normalizeScore(candidate.score);
    if (score === null) continue;
    merged.set(candidate.chapterId, {
      chapterId: candidate.chapterId,
      score,
      reason: typeof candidate.reason === 'string' ? candidate.reason : '',
      updatedAt: now,
    });
  }
  return { points: [...merged.values()], updatedAt: now };
}

function limitText(text: string, max: number): string {
  const chars = Array.from(text.trim());
  if (chars.length <= max) return chars.join('');
  const half = Math.floor(max / 2);
  return `${chars.slice(0, half).join('')}\n...\n${chars.slice(-half).join('')}`;
}

export function buildEmotionPrompt(novel: Novel, chapter: Chapter, index: number, total: number): EmotionMessage[] {
  return [
    {
      role: 'system',
      content: '你是小说章节情绪分析助手。使用固定标尺：-100 表示极度低落或压抑，0 表示中性平稳，100 表示极度高昂或积极，绝对值表示情绪强度。严格输出 JSON：{"score": number, "reason": string}。score 为 -100 到 100 的整数，reason 为不超过 40 字的一句依据。只输出 JSON。',
    },
    {
      role: 'user',
      content: [
        `小说标题：${novel.title}`,
        novel.summary ? `小说简介：${novel.summary}` : '',
        novel.blueprint ? `作品蓝图：\n${limitText(novel.blueprint, 1800)}` : '',
        novel.idea ? `创意：${limitText(novel.idea, 600)}` : '',
        `章节位置：第 ${index + 1} 章 / 共 ${total} 章`,
        `本章标题：${chapter.title || '未命名章节'}`,
        `本章正文：\n${limitText(chapter.content, 6000)}`,
      ].filter(Boolean).join('\n'),
    },
  ];
}

export function parseEmotionResult(text: string, chapter: Chapter): ParsedEmotionPoint {
  const trimmed = text.trim();
  const match = trimmed.match(CODE_FENCE_PATTERN);
  try {
    const parsed: unknown = JSON.parse(match ? match[1].trim() : trimmed);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { kind: 'invalid' };
    const record = parsed as Record<string, unknown>;
    const score = normalizeScore(record.score);
    if (score === null) return { kind: 'invalid' };
    return {
      kind: 'ok',
      point: {
        chapterId: chapter.id,
        score,
        reason: typeof record.reason === 'string' ? record.reason.trim() : '',
      },
    };
  } catch {
    return { kind: 'invalid' };
  }
}

export function assertEmotionArcSelfCheck(): void {
  const now = '2026-01-01T00:00:00.000Z';
  const novel = { chapters: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] } as unknown as Novel;
  const base = mergeEmotionPoints(null, novel, [
    { chapterId: 'a', score: 50, reason: 'a' },
    { chapterId: 'b', score: -30, reason: 'b' },
  ], now);
  const updated = mergeEmotionPoints(base, novel, [{ chapterId: 'b', score: 80, reason: 'b2' }], now);
  if (updated.points.find((point) => point.chapterId === 'a')?.score !== 50) throw new Error('emotion arc self-check: upsert deleted old point');
  const guarded = mergeEmotionPoints(null, novel, [
    { chapterId: 'missing', score: 10, reason: '' },
    { chapterId: 'a', score: Number.NaN, reason: '' },
    { chapterId: 'b', score: 150, reason: '' },
    { chapterId: 'c', score: 33.7, reason: '' },
  ], now);
  if (guarded.points.length !== 2 || guarded.points.find((point) => point.chapterId === 'b')?.score !== 100 || guarded.points.find((point) => point.chapterId === 'c')?.score !== 34) {
    throw new Error('emotion arc self-check: validation failed');
  }
}

assertEmotionArcSelfCheck();
