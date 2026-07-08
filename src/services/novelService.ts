import { rendererBridge } from './rendererBridge';
import type { Novel } from '../types/novel';

export const novelService = {
  listNovels: (projectId?: string) => rendererBridge.listNovels(projectId),
  createNovel: (input: { title: string; summary?: string; note?: string; projectId?: string }) => rendererBridge.createNovel(input),
  loadNovel: (id: string) => rendererBridge.loadNovel(id),
  saveNovel: (novel: Novel) => rendererBridge.saveNovel(novel),
  deleteNovel: (id: string) => rendererBridge.deleteNovel(id),
};

