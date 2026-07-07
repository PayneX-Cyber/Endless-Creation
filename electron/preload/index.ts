import { contextBridge, ipcRenderer } from 'electron';
import type { EndlessCreationBridge } from './bridgeTypes';

const bridge: EndlessCreationBridge = {
  app: {
    getVersion: () => ipcRenderer.invoke('app:get-version'),
    getPlatform: () => ipcRenderer.invoke('app:get-platform'),
    loadImageGenerationHistory: () => ipcRenderer.invoke('app:load-image-generation-history'),
    saveImageGenerationHistory: (items) => ipcRenderer.invoke('app:save-image-generation-history', items),
    readGeneratedImageDataUrl: (localPath) => ipcRenderer.invoke('app:read-generated-image-data-url', localPath),
    openGeneratedImageLocation: (localPath) => ipcRenderer.invoke('app:open-generated-image-location', localPath),
    selectGeneratedImagesDirectory: (currentPath) => ipcRenderer.invoke('app:select-generated-images-directory', currentPath),
    loadProjectAssets: (projectId) => ipcRenderer.invoke('app:load-project-assets', projectId),
    saveProjectAssets: (projectId, collection) => ipcRenderer.invoke('app:save-project-assets', projectId, collection),
    deleteProjectAssetFile: (projectId, relativePath) => ipcRenderer.invoke('app:delete-project-asset-file', projectId, relativePath),
    importProjectImageAsset: (projectId, input) => ipcRenderer.invoke('app:import-project-image-asset', projectId, input),
    readProjectAssetImageDataUrl: (projectId, relativePath) => ipcRenderer.invoke('app:read-project-asset-image-data-url', projectId, relativePath),
    saveTextFile: (defaultName, content, format) => ipcRenderer.invoke('app:save-text-file', defaultName, content, format),
    saveBinaryFile: (defaultName, data, kind) => ipcRenderer.invoke('app:save-binary-file', defaultName, data, kind),
  },
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
  },
  clipboard: {
    writeText: (text: string) => ipcRenderer.invoke('clipboard:write-text', text),
  },
  api: {
    testConnection: (config) => ipcRenderer.invoke('api:test-connection', config),
    loadAiUsage: (projectId) => ipcRenderer.invoke('api:load-ai-usage', projectId),
    generateImage: (request) => ipcRenderer.invoke('api:generate-image', request),
    cancelImageGeneration: (requestId) => ipcRenderer.invoke('api:cancel-image-generation', requestId),
    generateText: (request) => ipcRenderer.invoke('api:generate-text', request),
    cancelTextGeneration: (requestId) => ipcRenderer.invoke('api:cancel-text-generation', requestId),
  },
  novel: {
    listNovels: () => ipcRenderer.invoke('novel:list-novels'),
    createNovel: (input) => ipcRenderer.invoke('novel:create-novel', input),
    loadNovel: (id) => ipcRenderer.invoke('novel:load-novel', id),
    saveNovel: (novel) => ipcRenderer.invoke('novel:save-novel', novel),
    deleteNovel: (id) => ipcRenderer.invoke('novel:delete-novel', id),
    onFlushBeforeClose: (callback) => {
      const handler = () => {
        void Promise.resolve(callback()).finally(() => {
          void ipcRenderer.invoke('novel:flush-before-close-done');
        });
      };
      ipcRenderer.on('novel:flush-before-close', handler);
      return () => ipcRenderer.removeListener('novel:flush-before-close', handler);
    },
    finishFlushBeforeClose: () => ipcRenderer.invoke('novel:flush-before-close-done'),
  },
};

contextBridge.exposeInMainWorld('endlessCreationBridge', bridge);
