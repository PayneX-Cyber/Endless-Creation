import { useEffect, useState } from 'react';
import type { Chapter, Novel } from '../../types/novel';
import { orderedChapters } from './novelStructure';
import { orderedScenes } from './sceneStructure';

export type ChapterSearchField = 'content' | 'title' | 'outline' | 'sceneTitle' | 'sceneOutline';

export interface ChapterSearchResult {
  chapterId: string;
  chapterNumber: number;
  chapterTitle: string;
  sceneId: string;
  sceneNumber: number;
  field: ChapterSearchField;
  matchOffset: number;
  matchedText: string;
  snippet: string;
  snippetMatchOffset: number;
}

export interface ChapterLocateRequest {
  chapterId: string;
  sceneId: string;
  offset?: number;
  text?: string;
  requestId: number;
}

const FIELD_LABEL: Record<ChapterSearchField, string> = {
  content: '正文',
  title: '标题',
  outline: '大纲',
  sceneTitle: '场景标题',
  sceneOutline: '场景大纲',
};

export function reorderChapters(chapters: Chapter[], fromIndex: number, toIndex: number): Chapter[] {
  const ordered = [...chapters];
  if (fromIndex < 0 || fromIndex >= ordered.length || toIndex < 0 || toIndex >= ordered.length) return ordered;
  const [moved] = ordered.splice(fromIndex, 1);
  ordered.splice(toIndex, 0, moved);
  return ordered.map((chapter, order) => ({ ...chapter, order }));
}

export function searchChapters(novel: Novel, keyword: string): ChapterSearchResult[] {
  const query = keyword.trim();
  if (!query) return [];
  const normalizedQuery = query.toLocaleLowerCase();
  return orderedChapters(novel).flatMap((chapter, index) => {
    const scenes = orderedScenes(chapter);
    const firstScene = scenes[0];
    const fields = [
      { field: 'title' as const, value: chapter.title, sceneId: firstScene.id, sceneNumber: 1 },
      { field: 'outline' as const, value: chapter.outline ?? '', sceneId: firstScene.id, sceneNumber: 1 },
      ...scenes.flatMap((scene, sceneIndex) => [
        { field: 'sceneTitle' as const, value: scene.title, sceneId: scene.id, sceneNumber: sceneIndex + 1 },
        { field: 'sceneOutline' as const, value: scene.outline ?? '', sceneId: scene.id, sceneNumber: sceneIndex + 1 },
        { field: 'content' as const, value: scene.content, sceneId: scene.id, sceneNumber: sceneIndex + 1 },
      ]),
    ];
    return fields.flatMap(({ field, value, sceneId, sceneNumber }) => {
      const matchOffset = value.toLocaleLowerCase().indexOf(normalizedQuery);
      if (matchOffset < 0) return [];
      const snippetStart = Math.max(0, matchOffset - 36);
      const snippetEnd = Math.min(value.length, matchOffset + query.length + 36);
      return [{
        chapterId: chapter.id,
        chapterNumber: index + 1,
        chapterTitle: chapter.title || '未命名章节',
        sceneId,
        sceneNumber,
        field,
        matchOffset,
        matchedText: value.slice(matchOffset, matchOffset + query.length),
        snippet: `${snippetStart ? '…' : ''}${value.slice(snippetStart, snippetEnd)}${snippetEnd < value.length ? '…' : ''}`,
        snippetMatchOffset: matchOffset - snippetStart + (snippetStart ? 1 : 0),
      }];
    });
  });
}

export function ChapterSearchPanel({ novel, onSelect }: { novel: Novel; onSelect: (result: ChapterSearchResult) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ChapterSearchResult[] | null>(null);

  useEffect(() => {
    if (!query.trim()) {
      setResults(null);
      return;
    }
    const handle = window.setTimeout(() => setResults(searchChapters(novel, query)), 180);
    return () => window.clearTimeout(handle);
  }, [novel, query]);

  return (
    <section className="novel-chapter-search" aria-label="跨章全文搜索">
      <label>
        <span>跨章全文搜索</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索章节标题、大纲或正文…" type="search" />
      </label>
      {results && (
        <div className="novel-chapter-search__results" aria-live="polite">
          {results.length ? results.map((result) => {
            const before = result.snippet.slice(0, result.snippetMatchOffset);
            const match = result.snippet.slice(result.snippetMatchOffset, result.snippetMatchOffset + result.matchedText.length);
            const after = result.snippet.slice(result.snippetMatchOffset + result.matchedText.length);
            return (
              <button key={`${result.chapterId}-${result.sceneId}-${result.field}`} onClick={() => onSelect(result)} type="button">
                <span>第 {result.chapterNumber} 章 · 场景 {result.sceneNumber} · {result.chapterTitle}<small>{FIELD_LABEL[result.field]}</small></span>
                <p>{before}<mark>{match}</mark>{after}</p>
              </button>
            );
          }) : <p className="novel-chapter-search__empty">没有找到匹配内容。</p>}
        </div>
      )}
    </section>
  );
}

function assertNovelNavigationSelfCheck(): void {
  const chapters = [
    { id: 'b', title: 'Beta', scenes: [{ id: 'sb', title: '', content: 'Second \n\n KEYWORD', order: 0 }], outline: '', order: 1 },
    { id: 'a', title: 'Alpha', scenes: [{ id: 'sa', title: '', outline: 'scene keyword', content: 'First', order: 0 }], outline: 'keyword outline', order: 0 },
  ] as Chapter[];
  const reordered = reorderChapters(chapters, 1, 0);
  const results = searchChapters({ chapters, volumes: [] } as unknown as Novel, 'keyword');
  if (reordered.map((chapter) => `${chapter.id}:${chapter.order}`).join(',') !== 'a:0,b:1'
    || results.length !== 3
    || results.some((result) => !result.sceneId || !result.snippet.toLocaleLowerCase().includes('keyword'))
    || results.some((result) => result.snippet.slice(result.snippetMatchOffset, result.snippetMatchOffset + result.matchedText.length).toLocaleLowerCase() !== 'keyword')
    || !results.some((result) => result.field === 'content' && result.sceneId === 'sb')) {
    throw new Error('Novel navigation self-check failed.');
  }
}

assertNovelNavigationSelfCheck();
