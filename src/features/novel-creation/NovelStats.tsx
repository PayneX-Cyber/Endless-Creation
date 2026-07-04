import type { Novel } from '../../types/novel';
import { countWords } from './novelShared';

function briefTitle(title: string, max: number): string {
  const normalized = title.replace(/\s+/g, ' ').trim();
  if (!normalized) return '未命名章节';
  const chars = Array.from(normalized);
  return chars.length > max ? `${chars.slice(0, max).join('')}…` : normalized;
}

function formatNumber(value: number): string {
  return value.toLocaleString('zh-CN');
}

export function NovelStats({ novel }: { novel: Novel }) {
  const ordered = [...novel.chapters].sort((a, b) => a.order - b.order);
  const totalChapters = ordered.length;
  const doneChapters = ordered
    .map((chapter, displayIndex) => ({ chapter, displayIndex, words: countWords(chapter.content) }))
    .filter((entry) => entry.chapter.content.trim() !== '');
  const doneCount = doneChapters.length;
  const totalWords = ordered.reduce((sum, chapter) => sum + countWords(chapter.content), 0);
  const progress = totalChapters ? Math.round((doneCount / totalChapters) * 100) : 0;
  const avgDoneWords = doneCount ? Math.round(doneChapters.reduce((sum, entry) => sum + entry.words, 0) / doneCount) : null;
  let longest = doneCount ? doneChapters[0] : null;
  let shortest = doneCount ? doneChapters[0] : null;
  for (const entry of doneChapters) {
    if (longest && entry.words > longest.words) longest = entry;
    if (shortest && entry.words < shortest.words) shortest = entry;
  }

  return (
    <section className="novel-stats" aria-label="创作概览">
      <h3 className="novel-stats__title">创作概览</h3>
      <div className="novel-stats__grid">
        <div className="novel-stats__cell"><strong>{formatNumber(totalWords)}</strong><span>总字数</span></div>
        <div className="novel-stats__cell"><strong>{doneCount} / {totalChapters}</strong><span>章节进度</span></div>
        <div className="novel-stats__cell"><strong>{progress}%</strong><span>完成度</span></div>
      </div>
      {doneCount > 0 && longest && shortest && avgDoneWords !== null ? (
        <div className="novel-stats__grid">
          <div className="novel-stats__cell"><strong>{formatNumber(avgDoneWords)}</strong><span>平均章节字数</span></div>
          <div className="novel-stats__cell"><strong>第 {longest.displayIndex + 1} 章 · {briefTitle(longest.chapter.title, 12)} · {formatNumber(longest.words)} 字</strong><span>最长章节</span></div>
          <div className="novel-stats__cell"><strong>第 {shortest.displayIndex + 1} 章 · {briefTitle(shortest.chapter.title, 12)} · {formatNumber(shortest.words)} 字</strong><span>最短章节</span></div>
        </div>
      ) : (
        <p className="novel-stats__hint">完成首章后展示平均字数、最长章节和最短章节。</p>
      )}
    </section>
  );
}
