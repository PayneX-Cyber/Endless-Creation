import { useEffect, useMemo, useRef, useState } from 'react';
import { rendererBridge } from '../../services/rendererBridge';
import type { Chapter, Novel } from '../../types/novel';
import { createId } from './novelShared';
import { orderedChapters } from './novelStructure';
import {
  buildEmotionPrompt,
  mergeEmotionPoints,
  parseEmotionResult,
  type EmotionPointCandidate,
} from './emotionArc';
import './EmotionArcPanel.css';

type ResultStatus = 'success' | 'failed' | 'canceled' | 'unanalyzed';
interface AnalysisResult {
  chapter: Chapter;
  status: ResultStatus;
  candidate?: EmotionPointCandidate;
}
interface ReadyModel {
  channel: { id: string; name?: string };
  model: string;
  baseUrl: string;
  apiKey: string;
}
interface Props {
  novel: Novel;
  resolveModel: (onIssue: (message: string) => void) => ReadyModel | null;
  onUpdateNovel: (update: (novel: Novel) => Novel) => void;
}

const WIDTH = 900;
const HEIGHT = 360;
const PAD_X = 42;
const PAD_Y = 32;

function pointPosition(index: number, count: number, score: number) {
  const x = count <= 1 ? WIDTH / 2 : PAD_X + index * ((WIDTH - PAD_X * 2) / (count - 1));
  const y = PAD_Y + (100 - score) * ((HEIGHT - PAD_Y * 2) / 200);
  return { x, y };
}

function lineSegments(points: Array<{ x: number; y: number } | null>): string[] {
  const segments: string[] = [];
  let current: string[] = [];
  for (const point of points) {
    if (point) current.push(`${point.x},${point.y}`);
    else if (current.length) {
      segments.push(current.join(' '));
      current = [];
    }
  }
  if (current.length) segments.push(current.join(' '));
  return segments;
}

export function EmotionArcPanel({ novel, resolveModel, onUpdateNovel }: Props) {
  const chapters = useMemo(() => orderedChapters(novel), [novel]);
  const arc = novel.emotionArc ?? null;
  const [results, setResults] = useState<AnalysisResult[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);
  const runRef = useRef(0);
  const requestIdRef = useRef<string | null>(null);
  const activeChapterIdRef = useRef<string | null>(null);

  useEffect(() => {
    setResults(null);
    setSelectedIds(new Set());
    return () => {
      runRef.current += 1;
      const requestId = requestIdRef.current;
      requestIdRef.current = null;
      if (requestId) void rendererBridge.cancelTextGeneration(requestId);
    };
  }, [novel.id]);

  const confirmed = useMemo(() => new Map(
    (arc?.points ?? []).filter((point) => chapters.some((chapter) => chapter.id === point.chapterId)).map((point) => [point.chapterId, point]),
  ), [arc, chapters]);
  const candidates = useMemo(() => new Map(
    (results ?? []).filter((result) => result.candidate && selectedIds.has(result.chapter.id)).map((result) => [result.chapter.id, result.candidate!]),
  ), [results, selectedIds]);
  const detailChapter = chapters.find((chapter) => chapter.id === detailId) ?? null;
  const detailPoint = detailId ? candidates.get(detailId) ?? confirmed.get(detailId) : undefined;

  async function analyze(targets: Chapter[]) {
    if (busy) return;
    const ready = resolveModel(setError);
    if (!ready) return;
    const eligible = targets.filter((chapter) => chapter.content.trim());
    if (!eligible.length) {
      setError('没有可分析的正文。');
      return;
    }
    const runId = ++runRef.current;
    const next: AnalysisResult[] = chapters.map((chapter) => ({
      chapter,
      status: 'unanalyzed',
    }));
    setBusy(true);
    setError('');
    setResults(next);
    setDetailId(null);
    for (let index = 0; index < eligible.length; index += 1) {
      if (runRef.current !== runId) break;
      const chapter = eligible[index];
      activeChapterIdRef.current = chapter.id;
      setProgress(`分析中 ${index + 1}/${eligible.length} · ${chapter.title || '未命名章节'}`);
      const requestId = createId('text-request');
      requestIdRef.current = requestId;
      try {
        const result = await rendererBridge.generateText({
          requestId,
          channelId: ready.channel.id,
          channelLabel: ready.channel.name,
          projectId: novel.id,
          requestType: 'novel.emotionArc',
          baseUrl: ready.baseUrl,
          apiKey: ready.apiKey,
          model: ready.model,
          messages: buildEmotionPrompt(novel, chapter, chapters.findIndex((item) => item.id === chapter.id), chapters.length),
          temperature: 0.2,
          maxTokens: 180,
        });
        if (runRef.current !== runId) break;
        const parsed = result.ok && result.text ? parseEmotionResult(result.text, chapter) : { kind: 'invalid' as const };
        const itemIndex = next.findIndex((item) => item.chapter.id === chapter.id);
        next[itemIndex] = parsed.kind === 'ok'
          ? { chapter, status: 'success', candidate: parsed.point }
          : { chapter, status: 'failed' };
        setResults([...next]);
      } catch {
        const itemIndex = next.findIndex((item) => item.chapter.id === chapter.id);
        next[itemIndex] = { chapter, status: 'failed' };
        setResults([...next]);
      } finally {
        if (requestIdRef.current === requestId) requestIdRef.current = null;
      }
    }
    if (runRef.current !== runId) return;
    finishAnalysis(next);
  }

  function finishAnalysis(next: AnalysisResult[]) {
    setBusy(false);
    setProgress('');
    activeChapterIdRef.current = null;
    setResults(next);
    setSelectedIds(new Set(next.filter((item) => item.status === 'success').map((item) => item.chapter.id)));
  }

  function stopAnalysis() {
    const requestId = requestIdRef.current;
    const activeChapterId = activeChapterIdRef.current;
    runRef.current += 1;
    requestIdRef.current = null;
    if (requestId) void rendererBridge.cancelTextGeneration(requestId);
    setBusy(false);
    setProgress('');
    setResults((current) => {
      const next = current ?? [];
      return next.map((item) => item.status === 'unanalyzed' && item.chapter.id === activeChapterId
        ? { ...item, status: 'canceled' }
        : item);
    });
    activeChapterIdRef.current = null;
  }

  function confirm() {
    if (!results || !selectedIds.size) return;
    const points = results.flatMap((result) => result.candidate && selectedIds.has(result.chapter.id) ? [result.candidate] : []);
    const now = new Date().toISOString();
    onUpdateNovel((current) => ({
      ...current,
      emotionArc: mergeEmotionPoints(current.emotionArc ?? null, current, points, now),
      updatedAt: now,
    }));
    setResults(null);
    setSelectedIds(new Set());
    setError('');
  }

  const confirmedPositions = chapters.map((chapter, index) => {
    const point = confirmed.get(chapter.id);
    return point ? pointPosition(index, chapters.length, point.score) : null;
  });
  const candidatePositions = chapters.map((chapter, index) => {
    const point = candidates.get(chapter.id);
    return point ? pointPosition(index, chapters.length, point.score) : null;
  });
  const labelEvery = Math.max(1, Math.ceil(chapters.length / 10));

  return (
    <div className="emotion-arc">
      <div className="novel-project-panel__head">
        <div className="novel-project-panel__heading"><h2>情感曲线</h2><p>查看全书各章的情绪基调与起伏</p></div>
        {!busy && !results && <button className="novel-flow__primary novel-flow__primary--compact" disabled={!chapters.some((chapter) => chapter.content.trim())} onClick={() => void analyze(chapters)} type="button">分析情绪</button>}
        {busy && <button className="novel-flow__ghost" onClick={stopAnalysis} type="button">停止分析</button>}
      </div>
      {error && <div className="emotion-arc__error" role="alert">{error}</div>}
      {busy && <div className="emotion-arc__progress" aria-live="polite">{progress}</div>}
      {chapters.length ? (
        <div className="emotion-arc__chart">
          <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="小说章节情感曲线">
            <line className="emotion-arc__zero" x1={PAD_X} x2={WIDTH - PAD_X} y1={HEIGHT / 2} y2={HEIGHT / 2} />
            <text className="emotion-arc__axis-label" x="8" y={PAD_Y + 4}>+100</text>
            <text className="emotion-arc__axis-label" x="17" y={HEIGHT / 2 + 4}>0</text>
            <text className="emotion-arc__axis-label" x="8" y={HEIGHT - PAD_Y + 4}>-100</text>
            {lineSegments(confirmedPositions).map((points) => <polyline className="emotion-arc__line" key={`confirmed-${points}`} points={points} />)}
            {lineSegments(candidatePositions).map((points) => <polyline className="emotion-arc__line emotion-arc__line--candidate" key={`candidate-${points}`} points={points} />)}
            {chapters.map((chapter, index) => {
              const candidate = candidates.get(chapter.id);
              const point = candidate ?? confirmed.get(chapter.id);
              const position = pointPosition(index, chapters.length, point?.score ?? 0);
              return (
                <g className="emotion-arc__marker" key={chapter.id} role="button" tabIndex={0}
                  aria-label={`${chapter.title || '未命名章节'}，${point ? `${point.score} 分，${point.reason}` : '暂无分值'}`}
                  onClick={() => setDetailId(chapter.id)}
                  onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setDetailId(chapter.id); }}>
                  <circle className={point ? candidate ? 'emotion-arc__dot emotion-arc__dot--candidate' : 'emotion-arc__dot' : 'emotion-arc__gap'} cx={position.x} cy={position.y} r="6" />
                  {index % labelEvery === 0 && <text className="emotion-arc__chapter-label" x={position.x} y={HEIGHT - 8} textAnchor="middle">{index + 1}</text>}
                </g>
              );
            })}
          </svg>
        </div>
      ) : <div className="novel-empty"><strong>还没有章节</strong><span>新增章节并写入正文后即可分析情绪。</span></div>}
      {!busy && !results && chapters.length > 0 && confirmed.size === 0 && <div className="emotion-arc__empty">还没有情绪分析，点“分析情绪”开始。</div>}
      {detailChapter && !results && (
        <div className="emotion-arc__detail">
          <div><strong>{detailChapter.title || '未命名章节'}</strong><span>{detailPoint ? `${detailPoint.score} 分` : '暂无分值'}</span></div>
          {detailPoint?.reason && <p>{detailPoint.reason}</p>}
          <button className="novel-flow__primary novel-flow__primary--compact" disabled={!detailChapter.content.trim()} onClick={() => void analyze([detailChapter])} type="button">重新分析本章</button>
          {!detailChapter.content.trim() && <small>本章暂无正文</small>}
        </div>
      )}
      {results && !busy && (
        <div className="emotion-arc__candidates">
          <div className="emotion-arc__candidate-tools">
            <strong>分析候选</strong>
            <button type="button" onClick={() => setSelectedIds(new Set(results.filter((item) => item.status === 'success').map((item) => item.chapter.id)))}>全选</button>
            <button type="button" onClick={() => setSelectedIds(new Set())}>清空</button>
          </div>
          <div className="emotion-arc__candidate-list">
            {results.map((result) => (
              <label className="emotion-arc__candidate" key={result.chapter.id}>
                {result.status === 'success' && result.candidate
                  ? <input type="checkbox" checked={selectedIds.has(result.chapter.id)} onChange={(event) => setSelectedIds((current) => { const next = new Set(current); event.target.checked ? next.add(result.chapter.id) : next.delete(result.chapter.id); return next; })} />
                  : <span className="emotion-arc__status">{result.status === 'failed' ? '分析失败' : result.status === 'canceled' ? '已取消' : '未分析'}</span>}
                <span><strong>{result.chapter.title || '未命名章节'}</strong>{result.candidate && <small>{result.candidate.score} 分 · {result.candidate.reason || '暂无依据'}</small>}</span>
              </label>
            ))}
          </div>
          <div className="emotion-arc__actions">
            <button className="novel-flow__ghost" onClick={() => { setResults(null); setSelectedIds(new Set()); }} type="button">取消</button>
            <button className="novel-flow__primary novel-flow__primary--compact" disabled={!selectedIds.size} onClick={confirm} type="button">确认落库</button>
          </div>
        </div>
      )}
    </div>
  );
}
