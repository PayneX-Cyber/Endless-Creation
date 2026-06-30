import { contextBridge, ipcRenderer } from 'electron';
import type { EndlessCreationBridge } from './bridgeTypes';

const bridge: EndlessCreationBridge = {
  app: {
    getVersion: () => ipcRenderer.invoke('app:get-version'),
    getPlatform: () => ipcRenderer.invoke('app:get-platform'),
    loadImageGenerationHistory: () => ipcRenderer.invoke('app:load-image-generation-history'),
    saveImageGenerationHistory: (items) => ipcRenderer.invoke('app:save-image-generation-history', items),
    openGeneratedImageLocation: (localPath) => ipcRenderer.invoke('app:open-generated-image-location', localPath),
    selectGeneratedImagesDirectory: (currentPath) => ipcRenderer.invoke('app:select-generated-images-directory', currentPath),
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
    generateImage: (request) => ipcRenderer.invoke('api:generate-image', request),
    cancelImageGeneration: (requestId) => ipcRenderer.invoke('api:cancel-image-generation', requestId),
  },
};

contextBridge.exposeInMainWorld('endlessCreationBridge', bridge);
