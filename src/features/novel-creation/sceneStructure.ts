import type { Chapter, Scene } from '../../types/novel';
import { createId } from './novelShared';

function sortScenes(scenes: Scene[]): Scene[] {
  return scenes
    .map((scene, position) => ({ scene, position }))
    .sort((a, b) => (a.scene.order - b.scene.order) || (a.position - b.position))
    .map(({ scene }) => scene);
}

export function orderedScenes(chapter: Chapter): Scene[] {
  return sortScenes(chapter.scenes);
}

export function chapterText(chapter: Chapter): string {
  return orderedScenes(chapter)
    .map((scene) => scene.content)
    .filter((content) => content.trim())
    .join('\n\n');
}

function normalizeOrder(scenes: Scene[]): Scene[] {
  return scenes.map((scene, order) => (scene.order === order ? scene : { ...scene, order }));
}

export function initialScenes(): Scene[] {
  return [{ id: createId('scene'), title: '', content: '', order: 0 }];
}

export function createScene(existing: Scene[]): Scene {
  const order = existing.reduce((max, scene) => Math.max(max, scene.order), -1) + 1;
  return { id: createId('scene'), title: '', content: '', order };
}

export function renameScene(scenes: Scene[], sceneId: string, title: string): Scene[] {
  return normalizeOrder(sortScenes(scenes)
    .map((scene) => (scene.id === sceneId ? { ...scene, title } : scene)));
}

export function reorderScenes(scenes: Scene[], sceneId: string, direction: 'up' | 'down'): Scene[] {
  const ordered = sortScenes(scenes);
  const index = ordered.findIndex((scene) => scene.id === sceneId);
  const target = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= ordered.length) return scenes;
  const [moved] = ordered.splice(index, 1);
  ordered.splice(target, 0, moved);
  return normalizeOrder(ordered);
}

export function canRemoveScene(scenes: Scene[]): boolean {
  return scenes.length > 1;
}

export function adjacentSceneId(scenes: Scene[], removingId: string): string | undefined {
  const ordered = sortScenes(scenes);
  const index = ordered.findIndex((scene) => scene.id === removingId);
  if (index < 0) return undefined;
  return ordered[index + 1]?.id ?? ordered[index - 1]?.id;
}

export function removeScene(scenes: Scene[], sceneId: string): Scene[] {
  if (!canRemoveScene(scenes) || !scenes.some((scene) => scene.id === sceneId)) return scenes;
  return normalizeOrder(sortScenes(scenes).filter((scene) => scene.id !== sceneId));
}

export function assertSceneStructureSelfCheck(): void {
  const scene = (id: string, order: number, content = ''): Scene => ({ id, title: '', content, order });
  const chapter = (scenes: Scene[]): Chapter => ({ scenes } as Chapter);

  const tied = [scene('b', 1), scene('a', 0), scene('c', 1)];
  const tiedSnapshot = tied.map((item) => item.id).join(',');
  if (orderedScenes(chapter(tied)).map((item) => item.id).join(',') !== 'a,b,c'
    || tied.map((item) => item.id).join(',') !== tiedSnapshot) {
    throw new Error('scene structure self-check: stable non-mutating order');
  }

  const text = chapterText(chapter([
    scene('a', 0, '  A  '),
    scene('empty', 1, '   '),
    scene('b', 2, 'B'),
  ]));
  if (text !== '  A  \n\nB' || chapterText(chapter([scene('empty', 0, '')])) !== '') {
    throw new Error('scene structure self-check: chapterText');
  }

  const created = createScene([scene('a', 3)]);
  const initial = initialScenes();
  if (created.title !== '' || created.content !== '' || created.order !== 4
    || initial.length !== 1 || initial[0].title !== '' || initial[0].content !== '' || initial[0].order !== 0) {
    throw new Error('scene structure self-check: create defaults');
  }

  const reordered = reorderScenes([scene('a', 0), scene('b', 1), scene('c', 2)], 'b', 'down');
  if (reordered.map((item) => `${item.id}:${item.order}`).join(',') !== 'a:0,c:1,b:2') {
    throw new Error('scene structure self-check: reorder');
  }

  const pair = [scene('a', 0), scene('b', 1)];
  const singleton = [pair[0]];
  if (canRemoveScene(singleton) || removeScene(singleton, 'a') !== singleton
    || adjacentSceneId(pair, 'a') !== 'b' || adjacentSceneId(pair, 'b') !== 'a'
    || removeScene(pair, 'a').map((item) => `${item.id}:${item.order}`).join(',') !== 'b:0') {
    throw new Error('scene structure self-check: safe remove');
  }
}

assertSceneStructureSelfCheck();
