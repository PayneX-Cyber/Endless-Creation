import type { Episode, Script, ScriptScene } from '../../types/script';

function now(): string {
  return new Date().toISOString();
}

function newId(): string {
  return crypto.randomUUID();
}

function normalizeOrder<T extends { order: number }>(items: T[]): T[] {
  return items.map((item, order) => (item.order === order ? item : { ...item, order }));
}

function sortByOrder<T extends { order: number }>(items: T[]): T[] {
  return items
    .map((item, position) => ({ item, position }))
    .sort((a, b) => (a.item.order - b.item.order) || (a.position - b.position))
    .map(({ item }) => item);
}

function createScene(order: number): ScriptScene {
  const timestamp = now();
  return {
    id: newId(),
    title: '',
    content: '',
    order,
    referenceIds: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function createEpisode(order: number): Episode {
  const timestamp = now();
  return {
    id: newId(),
    title: '',
    order,
    scenes: [createScene(0)],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createInitialScript(projectId: string, title?: string): Script {
  const timestamp = now();
  return {
    id: newId(),
    projectId,
    title: title && title.trim() ? title : '未命名剧本',
    episodes: [createEpisode(0)],
    schemaVersion: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function withEpisodes(script: Script, episodes: Episode[]): Script {
  return { ...script, episodes, updatedAt: now() };
}

function mapEpisode(script: Script, episodeId: string, update: (episode: Episode) => Episode): Script {
  return withEpisodes(
    script,
    script.episodes.map((episode) => (episode.id === episodeId ? update(episode) : episode)),
  );
}

export function addEpisode(script: Script): Script {
  const order = script.episodes.reduce((max, episode) => Math.max(max, episode.order), -1) + 1;
  return withEpisodes(script, normalizeOrder(sortByOrder([...script.episodes, createEpisode(order)])));
}

export function renameEpisode(script: Script, episodeId: string, title: string): Script {
  return mapEpisode(script, episodeId, (episode) => ({ ...episode, title, updatedAt: now() }));
}

export function moveEpisode(script: Script, episodeId: string, direction: -1 | 1): Script {
  const ordered = sortByOrder(script.episodes);
  const index = ordered.findIndex((episode) => episode.id === episodeId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= ordered.length) return script;
  const next = [...ordered];
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved);
  return withEpisodes(script, normalizeOrder(next));
}

export function removeEpisode(script: Script, episodeId: string): Script {
  if (script.episodes.length <= 1) {
    throw new Error('至少保留一集');
  }
  if (!script.episodes.some((episode) => episode.id === episodeId)) return script;
  return withEpisodes(
    script,
    normalizeOrder(sortByOrder(script.episodes.filter((episode) => episode.id !== episodeId))),
  );
}

export function restoreEpisode(script: Script, episode: Episode, index: number): Script {
  if (script.episodes.some((item) => item.id === episode.id)) return script;
  const episodes = sortByOrder(script.episodes);
  const insertAt = Math.max(0, Math.min(index, episodes.length));
  const next = [...episodes];
  next.splice(insertAt, 0, structuredClone(episode));
  return withEpisodes(script, normalizeOrder(next));
}

export function addScene(script: Script, episodeId: string): { script: Script; sceneId: string } {
  const episode = script.episodes.find((item) => item.id === episodeId);
  if (!episode) return { script, sceneId: '' };
  const order = episode.scenes.reduce((max, scene) => Math.max(max, scene.order), -1) + 1;
  const scene = createScene(order);
  const nextScript = mapEpisode(script, episodeId, (current) => ({
    ...current,
    scenes: normalizeOrder(sortByOrder([...current.scenes, scene])),
    updatedAt: now(),
  }));
  return { script: nextScript, sceneId: scene.id };
}

export function updateScene(
  script: Script,
  episodeId: string,
  sceneId: string,
  patch: Partial<Pick<ScriptScene, 'title' | 'content' | 'referenceIds'>>,
): Script {
  return mapEpisode(script, episodeId, (episode) => ({
    ...episode,
    scenes: episode.scenes.map((scene) =>
      scene.id === sceneId ? { ...scene, ...patch, updatedAt: now() } : scene,
    ),
    updatedAt: now(),
  }));
}

export function moveScene(script: Script, episodeId: string, sceneId: string, direction: -1 | 1): Script {
  return mapEpisode(script, episodeId, (episode) => {
    const ordered = sortByOrder(episode.scenes);
    const index = ordered.findIndex((scene) => scene.id === sceneId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ordered.length) return episode;
    const next = [...ordered];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    return { ...episode, scenes: normalizeOrder(next), updatedAt: now() };
  });
}

export function removeScene(script: Script, episodeId: string, sceneId: string): Script {
  const episode = script.episodes.find((item) => item.id === episodeId);
  if (episode && episode.scenes.length <= 1) {
    throw new Error('至少保留一个场次');
  }
  return mapEpisode(script, episodeId, (current) => {
    if (!current.scenes.some((scene) => scene.id === sceneId)) return current;
    return {
      ...current,
      scenes: normalizeOrder(sortByOrder(current.scenes.filter((scene) => scene.id !== sceneId))),
      updatedAt: now(),
    };
  });
}

export function restoreScene(
  script: Script,
  episodeId: string,
  scene: ScriptScene,
  index: number,
): Script {
  return mapEpisode(script, episodeId, (episode) => {
    if (episode.scenes.some((item) => item.id === scene.id)) return episode;
    const scenes = sortByOrder(episode.scenes);
    const insertAt = Math.max(0, Math.min(index, scenes.length));
    const next = [...scenes];
    next.splice(insertAt, 0, structuredClone(scene));
    return { ...episode, scenes: normalizeOrder(next), updatedAt: now() };
  });
}

export function findMissingReferenceIds(script: Script, validSettingIds: Iterable<string>): string[] {
  const validIds = new Set(validSettingIds);
  const missing = new Set<string>();
  for (const episode of script.episodes) {
    for (const scene of episode.scenes) {
      for (const settingId of scene.referenceIds) {
        if (!validIds.has(settingId)) missing.add(settingId);
      }
    }
  }
  return [...missing];
}

export function cloneScriptSnapshot(script: Script): Script {
  return structuredClone(script);
}
