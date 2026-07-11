import type { Chapter, Novel } from '../../types/novel';

const STORAGE_KEY = 'endless-creation.novel-emotion-arcs';
const CODE_FENCE_PATTERN = /^```(?:json)?\s*([\s\S]*?)\s*```$/;

export interface EmotionPointCandidate {
  chapterId: string;
  score: number;
  reason: string;
}

export interface EmotionPoint extends EmotionPointCandidate {
  updatedAt: string;
}

export interface EmotionArc {
  points: EmotionPoint[];
  updatedAt: string;
}

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

function parseStoredArc(value: unknown): EmotionArc | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.points)) return null;
  const points: EmotionPoint[] = [];
  for (const valuePoint of record.points) {
    if (!valuePoint || typeof valuePoint !== 'object') continue;
    const point = valuePoint as Record<string, unknown>;
    if (typeof point.chapterId !== 'string' || !point.chapterId) continue;
    if (typeof point.score !== 'number' || !Number.isFinite(point.score) || point.score < -100 || point.score > 100) continue;
    if (typeof point.reason !== 'string' || typeof point.updatedAt !== 'string') continue;
    points.push({ chapterId: point.chapterId, score: point.score, reason: point.reason, updatedAt: point.updatedAt });
  }
  return { points, updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : '' };
}

function readAllArcs(): Record<string, unknown> {
  const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
  if (!raw) return {};
  const parsed: unknown = JSON.parse(raw);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
}

export function readEmotionArc(novelId: string): EmotionArc | null {
  try {
    return parseStoredArc(readAllArcs()[novelId]);
  } catch {
    return null;
  }
}

export function upsertEmotionPoints(
  novel: Novel,
  points: EmotionPointCandidate[],
): { ok: boolean; arc?: EmotionArc; message?: string } {
  try {
    const allArcs = readAllArcs();
    const nextArc = mergeEmotionPoints(parseStoredArc(allArcs[novel.id]), novel, points, new Date().toISOString());
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify({ ...allArcs, [novel.id]: nextArc }));
    return { ok: true, arc: nextArc };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : '保存失败，请重试' };
  }
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
