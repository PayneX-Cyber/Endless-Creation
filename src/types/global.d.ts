import type { EndlessCreationBridge } from './electronBridge';

declare global {
  interface Window {
    endlessCreationBridge?: EndlessCreationBridge;
  }
}

export {};
