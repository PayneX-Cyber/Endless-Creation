export interface ScriptScene {
  id: string;
  title: string;
  content: string;
  order: number;
  referenceIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Episode {
  id: string;
  title: string;
  order: number;
  scenes: ScriptScene[];      // 不变量 length >= 1
  createdAt: string;
  updatedAt: string;
}

export interface Script {
  id: string;
  projectId: string;
  title: string;
  episodes: Episode[];        // 不变量 length >= 1
  schemaVersion: 1;
  createdAt: string;
  updatedAt: string;
}

export interface ScriptSummary {
  id: string;
  projectId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectSettingEntry {
  id: string;
  projectId: string;
  type: 'character' | 'location';
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectSettings {
  projectId: string;
  entries: ProjectSettingEntry[];
  schemaVersion: 1;
}

export interface SettingReference {
  scriptId: string;
  scriptTitle: string;
  episodeId: string;
  episodeTitle: string;
  sceneId: string;
  sceneTitle: string;
}

export interface OperationResult {
  ok: boolean;
  message?: string;
}

export interface ScriptListResult extends OperationResult {
  summaries?: ScriptSummary[];
}

export interface ScriptResult extends OperationResult {
  script?: Script;
}

export interface ProjectSettingsResult extends OperationResult {
  settings?: ProjectSettings;
}

export interface DeleteSettingResult extends OperationResult {
  references?: SettingReference[];
}
