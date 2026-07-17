import { rendererBridge } from './rendererBridge';
import type { Script } from '../types/script';

// 薄 service：只转发到 rendererBridge，不维护第二套 draft 或引用计数。
export const scriptService = {
  listScripts: (projectId: string) => rendererBridge.listScripts(projectId),
  createScript: (input: { projectId: string; title?: string }) => rendererBridge.createScript(input),
  loadScript: (projectId: string, scriptId: string) => rendererBridge.loadScript(projectId, scriptId),
  saveScript: (script: Script) => rendererBridge.saveScript(script),
  deleteScript: (projectId: string, scriptId: string) => rendererBridge.deleteScript(projectId, scriptId),
};
