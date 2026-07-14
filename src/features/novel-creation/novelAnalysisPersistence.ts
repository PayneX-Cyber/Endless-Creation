import type { CharacterGraph, EmotionArc, Novel, NovelResult } from '../../types/novel';

export const EMOTION_ARC_STORAGE_KEY = 'endless-creation.novel-emotion-arcs';
export const CHARACTER_GRAPH_STORAGE_KEY = 'endless-creation.novel-character-graphs';

type StorageTable = Record<string, unknown>;
type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function isEmotionArc(value: unknown): value is EmotionArc {
  if (!value || typeof value !== 'object') return false;
  const arc = value as EmotionArc;
  return typeof arc.updatedAt === 'string'
    && Array.isArray(arc.points)
    && arc.points.every((point) => typeof point?.chapterId === 'string'
      && typeof point.score === 'number'
      && Number.isFinite(point.score)
      && point.score >= -100
      && point.score <= 100
      && typeof point.reason === 'string'
      && typeof point.updatedAt === 'string');
}

export function isCharacterGraph(value: unknown): value is CharacterGraph {
  if (!value || typeof value !== 'object') return false;
  const graph = value as CharacterGraph;
  return Array.isArray(graph.characters)
    && graph.characters.every((item) => typeof item?.name === 'string'
      && typeof item.role === 'string'
      && typeof item.description === 'string')
    && Array.isArray(graph.relationships)
    && graph.relationships.every((item) => typeof item?.from === 'string'
      && typeof item.to === 'string'
      && typeof item.label === 'string');
}

function readTable(storage: StorageLike, key: string): StorageTable | null {
  try {
    const raw = storage.getItem(key);
    if (raw === null) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as StorageTable : null;
  } catch {
    return null;
  }
}

function removeEntry(storage: StorageLike, key: string, table: StorageTable, novelId: string): void {
  const next = { ...table };
  delete next[novelId];
  try {
    if (Object.keys(next).length) storage.setItem(key, JSON.stringify(next));
    else storage.removeItem(key);
  } catch {
    // Novel is already durable; retry residue cleanup on the next load.
  }
}

export async function migrateLegacyNovelAnalysis(
  novel: Novel,
  storage: StorageLike,
  saveNovel: (novel: Novel) => Promise<NovelResult>,
): Promise<Novel> {
  const emotionTable = readTable(storage, EMOTION_ARC_STORAGE_KEY);
  const graphTable = readTable(storage, CHARACTER_GRAPH_STORAGE_KEY);
  const legacyEmotion = emotionTable?.[novel.id];
  const legacyGraph = graphTable?.[novel.id];
  const validEmotion = isEmotionArc(legacyEmotion);
  const validGraph = isCharacterGraph(legacyGraph);
  const migrateEmotion = novel.emotionArc === undefined && validEmotion;
  const migrateGraph = novel.characterGraph === undefined && validGraph;

  if (migrateEmotion || migrateGraph) {
    const nextNovel: Novel = {
      ...novel,
      ...(migrateEmotion ? { emotionArc: legacyEmotion } : {}),
      ...(migrateGraph ? { characterGraph: legacyGraph } : {}),
      updatedAt: new Date().toISOString(),
    };
    try {
      const saved = await saveNovel(nextNovel);
      if (!saved.ok) return novel;
      if (validEmotion && emotionTable) removeEntry(storage, EMOTION_ARC_STORAGE_KEY, emotionTable, novel.id);
      if (validGraph && graphTable) removeEntry(storage, CHARACTER_GRAPH_STORAGE_KEY, graphTable, novel.id);
      return saved.novel ? { ...nextNovel, updatedAt: saved.novel.updatedAt } : nextNovel;
    } catch {
      return novel;
    }
  }

  if (novel.emotionArc !== undefined && validEmotion && emotionTable) {
    removeEntry(storage, EMOTION_ARC_STORAGE_KEY, emotionTable, novel.id);
  }
  if (novel.characterGraph !== undefined && validGraph && graphTable) {
    removeEntry(storage, CHARACTER_GRAPH_STORAGE_KEY, graphTable, novel.id);
  }
  return novel;
}
