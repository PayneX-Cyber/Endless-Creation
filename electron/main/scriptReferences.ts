// main 权威引用扫描：不 import src/types（electron tsconfig rootDir 限制），
// 用本地结构类型副本，与 src/types/script.ts 协议保持对称。
interface RefScene {
  id: string;
  title: string;
  referenceIds: string[];
}
interface RefEpisode {
  id: string;
  title: string;
  scenes: RefScene[];
}
interface RefScript {
  id: string;
  title: string;
  episodes: RefEpisode[];
}

export interface SettingReference {
  scriptId: string;
  scriptTitle: string;
  episodeId: string;
  episodeTitle: string;
  sceneId: string;
  sceneTitle: string;
}

// 纯遍历：给定一组 Script 与设定 ID，返回所有引用该设定的场次位置。
// 不读文件、不缓存计数；main 删除 handler 负责先读盘形成 Script[] 再调用。
export function findSettingReferences(scripts: RefScript[], settingId: string): SettingReference[] {
  const references: SettingReference[] = [];
  for (const script of scripts) {
    for (const episode of script.episodes) {
      for (const scene of episode.scenes) {
        if (scene.referenceIds.includes(settingId)) {
          references.push({
            scriptId: script.id,
            scriptTitle: script.title,
            episodeId: episode.id,
            episodeTitle: episode.title,
            sceneId: scene.id,
            sceneTitle: scene.title,
          });
        }
      }
    }
  }
  return references;
}
