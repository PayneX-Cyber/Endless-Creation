import type { Chapter, Novel, Volume } from '../../types/novel';

// 按 order 升序返回卷（order 相同则保留原始位置），不改原数组。
function sortedVolumes(novel: Novel): Volume[] {
  return novel.volumes
    .map((volume, position) => ({ volume, position }))
    .sort((a, b) => (a.volume.order - b.volume.order) || (a.position - b.position))
    .map((item) => item.volume);
}

// 按 order 升序返回分组内章节（order 相同则保留原始位置）。
function sortGroup(chapters: { chapter: Chapter; position: number }[]): Chapter[] {
  return chapters
    .sort((a, b) => (a.chapter.order - b.chapter.order) || (a.position - b.position))
    .map((item) => item.chapter);
}

// 按卷分组章节：正式卷按 order 升序，未分卷（volume: null）恒定末位。
export function groupChaptersByVolume(novel: Novel): { volume: Volume | null; chapters: Chapter[] }[] {
  const volumeIds = new Set(novel.volumes.map((volume) => volume.id));
  const buckets = new Map<string, { chapter: Chapter; position: number }[]>();
  const unassigned: { chapter: Chapter; position: number }[] = [];
  novel.chapters.forEach((chapter, position) => {
    if (chapter.volumeId && volumeIds.has(chapter.volumeId)) {
      const bucket = buckets.get(chapter.volumeId) ?? [];
      bucket.push({ chapter, position });
      buckets.set(chapter.volumeId, bucket);
    } else {
      unassigned.push({ chapter, position });
    }
  });
  const groups = sortedVolumes(novel).map((volume) => ({
    volume: volume as Volume | null,
    chapters: sortGroup(buckets.get(volume.id) ?? []),
  }));
  groups.push({ volume: null, chapters: sortGroup(unassigned) });
  return groups;
}

// 按卷序展开为线性章节数组，不改原对象。
export function orderedChapters(novel: Novel): Chapter[] {
  return groupChaptersByVolume(novel).flatMap((group) => group.chapters);
}

// 归一卷 order 为连续下标，仅在 order 变化时复制对象。
function reindexVolumes(volumes: Volume[]): Volume[] {
  return volumes.map((volume, order) => (volume.order === order ? volume : { ...volume, order }));
}

// 按分组归一各章节 order，仅在 order 变化时复制对象，其余保持引用。
function reindexGroups(novel: Novel): Chapter[] {
  const groups = groupChaptersByVolume(novel);
  const byId = new Map<string, Chapter>();
  for (const group of groups) {
    group.chapters.forEach((chapter, order) => {
      byId.set(chapter.id, chapter.order === order ? chapter : { ...chapter, order });
    });
  }
  return novel.chapters.map((chapter) => byId.get(chapter.id) ?? chapter);
}

// 追加新卷到正式卷末尾（标题 trim 后非空由调用方保证），返回新 Novel。
export function createVolume(novel: Novel, title: string): Novel {
  const now = new Date().toISOString();
  const volume: Volume = {
    id: `volume-${crypto.randomUUID()}`,
    title,
    order: novel.volumes.length,
    createdAt: now,
    updatedAt: now,
  };
  return { ...novel, volumes: reindexVolumes([...novel.volumes, volume]), updatedAt: now };
}

// 重命名指定卷，返回新 Novel。
export function renameVolume(novel: Novel, volumeId: string, title: string): Novel {
  const now = new Date().toISOString();
  return {
    ...novel,
    volumes: novel.volumes.map((volume) => (volume.id === volumeId ? { ...volume, title, updatedAt: now } : volume)),
    updatedAt: now,
  };
}

// 上移/下移指定卷并归一 order，越界返回原对象。
export function reorderVolumes(novel: Novel, volumeId: string, direction: 'up' | 'down'): Novel {
  const ordered = sortedVolumes(novel);
  const index = ordered.findIndex((volume) => volume.id === volumeId);
  const target = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= ordered.length) return novel;
  const [moved] = ordered.splice(index, 1);
  ordered.splice(target, 0, moved);
  const now = new Date().toISOString();
  return { ...novel, volumes: reindexVolumes(ordered).map((volume) => ({ ...volume, updatedAt: now })), updatedAt: now };
}

// 删除卷但不删章：清空相关章节 volumeId，归一未分卷 order，返回新 Novel。
export function deleteVolume(novel: Novel, volumeId: string): Novel {
  if (!novel.volumes.some((volume) => volume.id === volumeId)) return novel;
  const now = new Date().toISOString();
  const detached: Novel = {
    ...novel,
    volumes: reindexVolumes(novel.volumes.filter((volume) => volume.id !== volumeId)),
    chapters: novel.chapters.map((chapter) => (chapter.volumeId === volumeId ? { ...chapter, volumeId: undefined, updatedAt: now } : chapter)),
    updatedAt: now,
  };
  return { ...detached, chapters: reindexGroups(detached) };
}

// 删除指定章节后按分组归一各组 order（组内 order 单一事实源），返回新 Novel。
export function deleteChapterInStructure(novel: Novel, chapterId: string): Novel {
  if (!novel.chapters.some((chapter) => chapter.id === chapterId)) return novel;
  const filtered: Novel = {
    ...novel,
    chapters: novel.chapters.filter((chapter) => chapter.id !== chapterId),
    updatedAt: new Date().toISOString(),
  };
  return { ...filtered, chapters: reindexGroups(filtered) };
}

// 统计某卷下的章节数（删除确认文案用）。
export function countChaptersInVolume(novel: Novel, volumeId: string): number {
  return novel.chapters.filter((chapter) => chapter.volumeId === volumeId).length;
}

// 跨卷移动 + 卷内重排 + 归属更新 + 源/目标分组 order 归一，返回新 Novel。
export function moveChapterInStructure(
  novel: Novel,
  chapterId: string,
  target: { volumeId: string | null; toIndex: number },
): Novel {
  const chapter = novel.chapters.find((item) => item.id === chapterId);
  if (!chapter) return novel;
  const now = new Date().toISOString();
  const nextVolumeId = target.volumeId && novel.volumes.some((volume) => volume.id === target.volumeId)
    ? target.volumeId
    : undefined;
  const detached: Novel = {
    ...novel,
    chapters: novel.chapters.map((item) => (item.id === chapterId ? { ...item, volumeId: nextVolumeId, updatedAt: now } : item)),
    updatedAt: now,
  };
  const groups = groupChaptersByVolume(detached);
  const groupKey = nextVolumeId ?? null;
  const targetGroup = groups.find((group) => (group.volume?.id ?? null) === groupKey);
  const targetChapters = (targetGroup?.chapters ?? []).filter((item) => item.id !== chapterId);
  const movedChapter = detached.chapters.find((item) => item.id === chapterId)!;
  const clampedIndex = Math.max(0, Math.min(target.toIndex, targetChapters.length));
  targetChapters.splice(clampedIndex, 0, movedChapter);
  const orderInGroup = new Map(targetChapters.map((item, order) => [item.id, order]));
  const withTargetOrder: Novel = {
    ...detached,
    chapters: detached.chapters.map((item) => (orderInGroup.has(item.id) ? { ...item, order: orderInGroup.get(item.id)! } : item)),
  };
  return { ...withTargetOrder, chapters: reindexGroups(withTargetOrder) };
}

// 模块自检：沿用项目 emotionArc.ts 的 assertXxxSelfCheck() 模式，文件尾直接调用。
export function assertNovelStructureSelfCheck(): void {
  const now = '2026-01-01T00:00:00.000Z';
  const base = (over: Partial<Novel>): Novel => ({
    id: 'n', title: '', summary: '', note: '', chapters: [], foreshadowings: [], volumes: [],
    version: 8, createdAt: now, updatedAt: now, ...over,
  }) as Novel;
  const ch = (id: string, order: number, volumeId?: string): Chapter =>
    ({ id, title: id, scenes: [{ id: `scene-${id}`, title: '', content: '', order: 0 }], order, volumeId, createdAt: now, updatedAt: now }) as Chapter;
  const vol = (id: string, order: number): Volume => ({ id, title: id, order, createdAt: now, updatedAt: now });

  // v6 未分卷保持相对顺序
  const v6 = base({ chapters: [ch('a', 0), ch('b', 1), ch('c', 2)] });
  if (orderedChapters(v6).map((c) => c.id).join(',') !== 'a,b,c') throw new Error('structure self-check: v6 order');

  // 正式卷顺序 + 未分卷末尾
  const mixed = base({
    volumes: [vol('v2', 1), vol('v1', 0)],
    chapters: [ch('u', 0), ch('x', 0, 'v1'), ch('y', 0, 'v2')],
  });
  if (orderedChapters(mixed).map((c) => c.id).join(',') !== 'x,y,u') throw new Error('structure self-check: volume order + unassigned tail');

  // 无效 volumeId 降级为未分卷
  const orphan = base({ volumes: [vol('v1', 0)], chapters: [ch('o', 0, 'ghost'), ch('p', 0, 'v1')] });
  if (orderedChapters(orphan).map((c) => c.id).join(',') !== 'p,o') throw new Error('structure self-check: orphan volumeId');

  // order 相同以原数组位置稳定兜底：同 order 卷按数组顺序，卷内同 order 章节按数组顺序
  const tie = base({
    volumes: [vol('vB', 0), vol('vA', 0)],
    chapters: [ch('a', 5, 'vB'), ch('b', 5, 'vB'), ch('c', 5, 'vA')],
  });
  if (orderedChapters(tie).map((c) => c.id).join(',') !== 'a,b,c') {
    throw new Error('structure self-check: equal-order position tiebreak');
  }

  // 跨卷移动：双侧分组 order 归一
  const moved = moveChapterInStructure(mixed, 'u', { volumeId: 'v1', toIndex: 0 });
  const v1Group = groupChaptersByVolume(moved).find((g) => g.volume?.id === 'v1');
  if (v1Group?.chapters.map((c) => `${c.id}:${c.order}`).join(',') !== 'u:0,x:1') throw new Error('structure self-check: cross-volume move');

  // 跨卷移动源侧归一：从含 3 章的卷移出首章，剩余两章 order 从 0 重排
  const sourceHeavy = base({
    volumes: [vol('v1', 0)],
    chapters: [ch('a', 0, 'v1'), ch('b', 1, 'v1'), ch('c', 2, 'v1')],
  });
  const afterSourceMove = moveChapterInStructure(sourceHeavy, 'a', { volumeId: null, toIndex: 0 });
  const sourceGroup = groupChaptersByVolume(afterSourceMove).find((g) => g.volume?.id === 'v1');
  if (sourceGroup?.chapters.map((c) => `${c.id}:${c.order}`).join(',') !== 'b:0,c:1') {
    throw new Error('structure self-check: source-side move reindex');
  }

  // 删除卷不删章，章节移入未分卷
  const afterDelete = deleteVolume(mixed, 'v1');
  if (afterDelete.chapters.length !== 3 || afterDelete.chapters.find((c) => c.id === 'x')?.volumeId !== undefined) {
    throw new Error('structure self-check: delete volume keeps chapters');
  }
  if (afterDelete.volumes.length !== 1 || afterDelete.volumes[0].order !== 0) throw new Error('structure self-check: delete volume reindex');

  // 删除卷后受影响分组 order 归一：脱卷章节在未分卷组内从 0 起连续
  const deleteOrderGroup = groupChaptersByVolume(afterDelete).find((g) => g.volume === null);
  if ((deleteOrderGroup?.chapters ?? []).some((c, order) => c.order !== order)) {
    throw new Error('structure self-check: delete volume chapter reindex');
  }

  // 删除章节后组内 order 归一：从含 3 章的卷删中间章，剩余两章 order 从 0 重排
  const afterChapterDelete = deleteChapterInStructure(sourceHeavy, 'b');
  const remainGroup = groupChaptersByVolume(afterChapterDelete).find((g) => g.volume?.id === 'v1');
  if (afterChapterDelete.chapters.length !== 2
    || remainGroup?.chapters.map((c) => `${c.id}:${c.order}`).join(',') !== 'a:0,c:1') {
    throw new Error('structure self-check: delete chapter reindex');
  }
}

assertNovelStructureSelfCheck();
