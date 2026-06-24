import { contextBridge, ipcRenderer } from 'electron';
import type { EndlessCreationBridge } from './bridgeTypes';

const bridge: EndlessCreationBridge = {
  app: {
    getVersion: () => ipcRenderer.invoke('app:get-version'),
    getPlatform: () => ipcRenderer.invoke('app:get-platform'),
  },
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
  },
  clipboard: {
    writeText: (text: string) => ipcRenderer.invoke('clipboard:write-text', text),
  },
};

contextBridge.exposeInMainWorld('endlessCreationBridge', bridge);
