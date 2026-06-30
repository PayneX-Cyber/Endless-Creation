import { rendererBridge } from './rendererBridge';
import type { Novel } from '../types/novel';

export const novelService = {
  listNovels: () => rendererBridge.listNovels(),
  createNovel: (input: { title: string; summary?: string; note?: string }) => rendererBridge.createNovel(input),
  loadNovel: (id: string) => rendererBridge.loadNovel(id),
  saveNovel: (novel: Novel) => rendererBridge.saveNovel(novel),
  deleteNovel: (id: string) => rendererBridge.deleteNovel(id),
};

