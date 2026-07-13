import { useEffect, useState } from 'react';
import type { Chapter, Novel } from '../../types/novel';

export type ChapterSearchField = 'content' | 'title' | 'outline';

export interface ChapterSearchResult {
  chapterId: string;
  chapterNumber: number;
  chapterTitle: string;
  field: ChapterSearchField;
  matchOffset: number;
  matchedText: string;
  snippet: string;
  snippetMatchOffset: number;
}

export interface ChapterLocateRequest {
  chapterId: string;
  offset: number;
  text: string;
  requestId: number;
}

const FIELD_LABEL: Record<ChapterSearchField, string> = {
  content: '正文',
  title: '标题',
  outline: '大纲',
};

export function reorderChapters(chapters: Chapter[], fromIndex: number, toIndex: number): Chapter[] {
  const ordered = [...chapters].sort((a, b) => a.order - b.order);
  if (fromIndex < 0 || fromIndex >= ordered.length || toIndex < 0 || toIndex >= ordered.length) return ordered;
  const [moved] = ordered.splice(fromIndex, 1);
  ordered.splice(toIndex, 0, moved);
  return ordered.map((chapter, order) => ({ ...chapter, order }));
}

export function searchChapters(novel: Novel, keyword: string): ChapterSearchResult[] {
  const query = keyword.trim();
  if (!query) return [];
  const normalizedQuery = query.toLocaleLowerCase();
  return [...novel.chapters].sort((a, b) => a.order - b.order).flatMap((chapter, index) => {
    const fields: [ChapterSearchField, string][] = [
      ['content', chapter.content],
      ['title', chapter.title],
      ['outline', chapter.outline ?? ''],
    ];
    return fields.flatMap(([field, value]) => {
      const matchOffset = value.toLocaleLowerCase().indexOf(normalizedQuery);
      if (matchOffset < 0) return [];
      const snippetStart = Math.max(0, matchOffset - 36);
      const snippetEnd = Math.min(value.length, matchOffset + query.length + 36);
      return [{
        chapterId: chapter.id,
        chapterNumber: index + 1,
        chapterTitle: chapter.title || '未命名章节',
        field,
        matchOffset,
        matchedText: value.slice(matchOffset, matchOffset + query.length),
        snippet: `${snippetStart ? '…' : ''}${value.slice(snippetStart, snippetEnd).replace(/\s+/g, ' ')}${snippetEnd < value.length ? '…' : ''}`,
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
              <button key={`${result.chapterId}-${result.field}`} onClick={() => onSelect(result)} type="button">
                <span>第 {result.chapterNumber} 章 · {result.chapterTitle}<small>{FIELD_LABEL[result.field]}</small></span>
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
    { id: 'b', title: 'Beta', content: 'Second KEYWORD', outline: '', order: 1 },
    { id: 'a', title: 'Alpha', content: 'First', outline: 'keyword outline', order: 0 },
  ] as Chapter[];
  const reordered = reorderChapters(chapters, 1, 0);
  const results = searchChapters({ chapters } as Novel, 'keyword');
  if (reordered.map((chapter) => `${chapter.id}:${chapter.order}`).join(',') !== 'b:0,a:1'
    || results.length !== 2
    || results.some((result) => !result.snippet.toLocaleLowerCase().includes('keyword'))) {
    throw new Error('Novel navigation self-check failed.');
  }
}

assertNovelNavigationSelfCheck();
