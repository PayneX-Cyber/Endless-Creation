import { rendererBridge } from './rendererBridge';
import type { ProjectSettings } from '../types/script';

// 薄 service：只转发到 rendererBridge，不维护第二套 draft。
export const projectSettingsService = {
  load: (projectId: string) => rendererBridge.loadProjectSettings(projectId),
  save: (settings: ProjectSettings) => rendererBridge.saveProjectSettings(settings),
  delete: (projectId: string, settingId: string) => rendererBridge.deleteProjectSetting(projectId, settingId),
};
