import { useMemo, useState } from 'react';

export interface EditorSnapshot {
  content: string;
  selectionStart: number;
  selectionEnd: number;
}

export interface EditorHistory {
  snapshots: EditorSnapshot[];
  pointer: number;
}

export interface TextMatch {
  offset: number;
  length: number;
}

const HISTORY_LIMIT = 100;

export function resetEditorHistory(snapshot: EditorSnapshot): EditorHistory {
  return { snapshots: [snapshot], pointer: 0 };
}

export function pushEditorHistory(history: EditorHistory, snapshot: EditorSnapshot): EditorHistory {
  const current = history.snapshots[history.pointer];
  if (current?.content === snapshot.content) return history;
  const snapshots = [...history.snapshots.slice(0, history.pointer + 1), snapshot].slice(-HISTORY_LIMIT);
  return { snapshots, pointer: snapshots.length - 1 };
}

export function undoEditorHistory(history: EditorHistory): { history: EditorHistory; snapshot: EditorSnapshot | null } {
  if (history.pointer <= 0) return { history, snapshot: null };
  const next = { ...history, pointer: history.pointer - 1 };
  return { history: next, snapshot: next.snapshots[next.pointer] };
}

export function redoEditorHistory(history: EditorHistory): { history: EditorHistory; snapshot: EditorSnapshot | null } {
  if (history.pointer >= history.snapshots.length - 1) return { history, snapshot: null };
  const next = { ...history, pointer: history.pointer + 1 };
  return { history: next, snapshot: next.snapshots[next.pointer] };
}

export function findTextMatches(content: string, keyword: string): TextMatch[] {
  const query = keyword.trim();
  if (!query) return [];
  const matches: TextMatch[] = [];
  const source = content.toLocaleLowerCase();
  const target = query.toLocaleLowerCase();
  let offset = 0;
  while ((offset = source.indexOf(target, offset)) >= 0) {
    matches.push({ offset, length: query.length });
    offset += Math.max(1, query.length);
  }
  return matches;
}

export function replaceAllText(content: string, matches: TextMatch[], replacement: string): string {
  return matches.reduceRight((next, match) => next.slice(0, match.offset) + replacement + next.slice(match.offset + match.length), content);
}

interface ChapterFindReplaceProps {
  content: string;
  disabled: boolean;
  onLocate: (match: TextMatch) => void;
  onReplace: (content: string, selectionStart: number, selectionEnd: number) => void;
}

export function ChapterFindReplace({ content, disabled, onLocate, onReplace }: ChapterFindReplaceProps) {
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const matches = useMemo(() => findTextMatches(content, query), [content, query]);
  const safeIndex = matches.length ? Math.min(currentIndex, matches.length - 1) : 0;

  function selectMatch(index: number, nextMatches = matches) {
    if (!nextMatches.length) return;
    const normalized = (index + nextMatches.length) % nextMatches.length;
    setCurrentIndex(normalized);
    onLocate(nextMatches[normalized]);
  }

  function updateQuery(value: string) {
    setQuery(value);
    const nextMatches = findTextMatches(content, value);
    setCurrentIndex(0);
    if (nextMatches.length) onLocate(nextMatches[0]);
  }

  function replaceCurrent() {
    const match = matches[safeIndex];
    if (!match) return;
    const nextContent = content.slice(0, match.offset) + replacement + content.slice(match.offset + match.length);
    const nextMatches = findTextMatches(nextContent, query);
    const nextIndex = nextMatches.findIndex((item) => item.offset >= match.offset + replacement.length);
    onReplace(nextContent, match.offset, match.offset + replacement.length);
    if (nextMatches.length) selectMatch(nextIndex >= 0 ? nextIndex : 0, nextMatches);
  }

  function replaceAll() {
    if (!matches.length) return;
    const nextContent = replaceAllText(content, matches, replacement);
    onReplace(nextContent, 0, 0);
    setCurrentIndex(0);
  }

  const status = !query.trim() ? '输入关键词开始查找' : matches.length ? `${safeIndex + 1} / ${matches.length}` : '无匹配';

  return (
    <section className="novel-editor-find" aria-label="章内查找替换">
      <div className="novel-editor-find__fields">
        <input aria-label="查找关键词" disabled={disabled} onChange={(event) => updateQuery(event.target.value)} placeholder="查找正文…" type="search" value={query} />
        <input aria-label="替换文本" disabled={disabled} onChange={(event) => setReplacement(event.target.value)} placeholder="替换为…" value={replacement} />
        <span aria-live="polite">{status}</span>
      </div>
      <div className="novel-editor-find__actions">
        <button className="novel-flow__ghost" disabled={disabled || !matches.length} onClick={() => selectMatch(safeIndex - 1)} type="button">上一个</button>
        <button className="novel-flow__ghost" disabled={disabled || !matches.length} onClick={() => selectMatch(safeIndex + 1)} type="button">下一个</button>
        <button className="novel-flow__ghost" disabled={disabled || !matches.length} onClick={replaceCurrent} type="button">替换</button>
        <button className="novel-flow__ghost" disabled={disabled || !matches.length} onClick={replaceAll} type="button">全部替换</button>
      </div>
    </section>
  );
}

function assertNovelEditorToolsSelfCheck(): void {
  const baseline = { content: 'one', selectionStart: 3, selectionEnd: 3 };
  const pushed = pushEditorHistory(resetEditorHistory(baseline), { content: 'one two', selectionStart: 7, selectionEnd: 7 });
  const undone = undoEditorHistory(pushed);
  const redone = redoEditorHistory(undone.history);
  const matches = findTextMatches('Key key', 'key');
  if (undone.snapshot?.content !== 'one'
    || redone.snapshot?.content !== 'one two'
    || matches.length !== 2
    || replaceAllText('Key key', matches, 'x') !== 'x x') {
    throw new Error('Novel editor tools self-check failed.');
  }
}

assertNovelEditorToolsSelfCheck();
