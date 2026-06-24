export interface EndlessCreationBridge {
  app: {
    getVersion(): Promise<string>;
    getPlatform(): Promise<string>;
  };
  window: {
    minimize(): Promise<void>;
    maximize(): Promise<void>;
    close(): Promise<void>;
  };
  clipboard: {
    writeText(text: string): Promise<void>;
  };
}
