import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { rendererBridge } from '../../services/rendererBridge';
import './ImageWorkbench.css';

type GenerationStatus = 'idle' | 'editing' | 'ready' | 'generating' | 'succeeded' | 'failed' | 'cancelled';
type QualityOption = '自动' | '低' | '中' | '高';
type Palette = 'blue' | 'cyan' | 'violet' | 'orange';

interface ReferenceImage { id: string; name: string; source: 'mock' | 'result'; previewLabel: string; palette: Palette; }
interface ImageGenerationConfig { modelId: string; size: string; quality: QualityOption; count: number; style: string; styleStrength: number; referenceWeight: number; saveToProject: boolean; }
interface ImageGenerationRequest { id: string; prompt: string; negativePrompt: string; references: ReferenceImage[]; config: ImageGenerationConfig; createdAt: string; }
interface GenerationResult { id: string; requestId: string; variantName: string; status: 'succeeded' | 'failed'; palette: Palette; }
interface GenerationHistoryItem { id: string; request: ImageGenerationRequest; status: GenerationStatus; results: GenerationResult[]; createdAt: string; durationMs?: number; errorMessage?: string; }

const qualityOptions: QualityOption[] = ['自动', '高', '中', '低'];
const quickActionsTop = ['提示词库', '方案库', '参数设置', '改稿实验', '存为模板'] as const;
const quickActionsBottom = ['存方案包', '复制', '清空', 'Prompt Lab'] as const;
const palettes: Palette[] = ['blue', 'cyan', 'violet', 'orange'];
const baseConfig: ImageGenerationConfig = { modelId: 'GPT Image 2', size: '1536×1024', quality: '高', count: 4, style: '电影感', styleStrength: 72, referenceWeight: 60, saveToProject: true };
let idSeed = 0;
function createId(prefix: string) { idSeed += 1; return `${prefix}-${Date.now()}-${idSeed}`; }

export function ImageWorkbench() {
  const [promptText, setPromptText] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [references, setReferences] = useState<ReferenceImage[]>([]);
  const [config, setConfig] = useState<ImageGenerationConfig>(baseConfig);
  const [status, setStatus] = useState<GenerationStatus>('idle');
  const [results, setResults] = useState<GenerationResult[]>([]);
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null);
  const [history, setHistory] = useState<GenerationHistoryItem[]>([]);
  const [currentRequest, setCurrentRequest] = useState<ImageGenerationRequest | null>(null);
  const [feedback, setFeedback] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [previewResult, setPreviewResult] = useState<GenerationResult | null>(null);
  const timerRef = useRef<number | null>(null);
  const trimmedPrompt = promptText.trim();
  const canGenerate = trimmedPrompt.length > 0 && status !== 'generating';
  const statusLabel = getStatusLabel(status);
  const selectedResult = results.find((result) => result.id === selectedResultId) ?? null;
  const parameterSummary = `${config.modelId} · ${config.size} · ${config.quality} · ${config.count} 张`;

  const createRequestSnapshot = useCallback((): ImageGenerationRequest => ({ id: createId('request'), prompt: promptText.trim(), negativePrompt, references: references.map((item) => ({ ...item })), config: { ...config }, createdAt: new Date().toISOString() }), [config, negativePrompt, promptText, references]);
  const clearGenerationTimer = useCallback(() => { if (timerRef.current !== null) { window.clearTimeout(timerRef.current); timerRef.current = null; } }, []);
  const runMockGeneration = useCallback((request: ImageGenerationRequest) => {
    clearGenerationTimer();
    const startedAt = performance.now();
    setCurrentRequest(request); setStatus('generating'); setErrorMessage(''); setFeedback('Mock AI 正在分析提示词、参考图和参数。');
    timerRef.current = window.setTimeout(() => {
      if (Math.random() < 0.1) {
        const failedItem: GenerationHistoryItem = { id: createId('history'), request, status: 'failed', results: [], createdAt: new Date().toISOString(), durationMs: Math.round(performance.now() - startedAt), errorMessage: 'Mock AI 生成请求失败。请重试，或调整提示词与参数后再次生成。' };
        setStatus('failed'); setErrorMessage('Mock AI 生成请求失败。请重试，或调整提示词与参数后再次生成。'); setFeedback(''); setHistory((current) => [failedItem, ...current].slice(0, 12)); timerRef.current = null; return;
      }
      const nextResults: GenerationResult[] = Array.from({ length: Math.min(Math.max(request.config.count, 1), 4) }, (_, index) => ({ id: createId('result'), requestId: request.id, variantName: `变体 ${index + 1}`, status: 'succeeded', palette: palettes[index % palettes.length] }));
      const historyItem: GenerationHistoryItem = { id: createId('history'), request, status: 'succeeded', results: nextResults, createdAt: new Date().toISOString(), durationMs: Math.round(performance.now() - startedAt) };
      setResults(nextResults); setSelectedResultId(nextResults[0]?.id ?? null); setStatus('succeeded'); setFeedback('Mock 生成完成，已写入历史。'); setErrorMessage(''); setHistory((current) => [historyItem, ...current].slice(0, 12)); timerRef.current = null;
    }, 960);
  }, [clearGenerationTimer]);
  const handleGenerate = useCallback(() => { if (!canGenerate) return; runMockGeneration(createRequestSnapshot()); }, [canGenerate, createRequestSnapshot, runMockGeneration]);
  const handleCancel = useCallback(() => { if (status !== 'generating') return; clearGenerationTimer(); setStatus('cancelled'); setFeedback('已取消生成。'); setErrorMessage(''); }, [clearGenerationTimer, status]);
  useEffect(() => () => clearGenerationTimer(), [clearGenerationTimer]);
  useEffect(() => { function onKeyDown(event: KeyboardEvent) { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); handleGenerate(); } if (event.key === 'Escape') { if (status === 'generating') handleCancel(); if (previewResult) setPreviewResult(null); } } window.addEventListener('keydown', onKeyDown); return () => window.removeEventListener('keydown', onKeyDown); }, [handleCancel, handleGenerate, previewResult, status]);

  function updatePrompt(value: string) { setPromptText(value); setErrorMessage(''); if (status === 'generating') return; setStatus(value.trim() ? 'ready' : 'idle'); }
  function updateConfig(patch: Partial<ImageGenerationConfig>) { setConfig((current) => ({ ...current, ...patch })); if (status === 'idle') setStatus('editing'); }
  function addMockReference(source: ReferenceImage['source'] = 'mock', result?: GenerationResult) { setReferences((current) => { if (current.length >= 4) { setFeedback('参考图最多添加 4 张。'); return current; } const nextIndex = current.length + 1; const item: ReferenceImage = { id: createId('ref'), name: source === 'result' ? `${result?.variantName ?? '结果'}参考图` : `参考图 ${nextIndex}`, source, previewLabel: source === 'result' ? (result?.variantName ?? `结果 ${nextIndex}`) : `参考图 ${nextIndex}`, palette: result?.palette ?? palettes[(nextIndex - 1) % palettes.length] }; setFeedback(`已添加${item.name}。`); return [...current, item]; }); if (status === 'idle') setStatus('editing'); }
  function removeReference(id: string) { setReferences((current) => current.filter((item) => item.id !== id)); setFeedback('已移除参考图。'); }
  async function copyText(text: string, success: string) { if (!text.trim()) { setFeedback('没有可复制的内容。'); return; } try { await rendererBridge.copyText(text); setFeedback(success); } catch { setFeedback('复制失败，请手动复制。'); } }
  function handleQuickAction(action: string) { if (action === '清空') { setPromptText(''); setNegativePrompt(''); setStatus('idle'); setFeedback('提示词已清空。'); return; } if (action === '复制') { void copyText(promptText, '提示词已复制。'); return; } setFeedback(`${action} 是 mock 入口，暂未接入真实功能。`); }
  async function copyResultConfig(result: GenerationResult) { if (!currentRequest) { setFeedback('暂无生成参数可复制。'); return; } await copyText(JSON.stringify({ resultId: result.id, prompt: currentRequest.prompt, negativePrompt: currentRequest.negativePrompt, config: currentRequest.config }, null, 2), '参数已复制。'); }
  function deleteResult(resultId: string) { setResults((current) => { const next = current.filter((item) => item.id !== resultId); if (selectedResultId === resultId) setSelectedResultId(next[0]?.id ?? null); if (next.length === 0 && status === 'succeeded') setStatus('idle'); return next; }); setFeedback('结果已删除。'); }
  function restoreHistory(item: GenerationHistoryItem) { clearGenerationTimer(); setPromptText(item.request.prompt); setNegativePrompt(item.request.negativePrompt); setReferences(item.request.references.map((ref) => ({ ...ref }))); setConfig({ ...item.request.config }); setCurrentRequest(item.request); setResults(item.results.map((result) => ({ ...result }))); setSelectedResultId(item.results[0]?.id ?? null); setStatus(item.status); setErrorMessage(item.errorMessage ?? ''); setFeedback('已从历史恢复。'); }
  function deleteHistory(id: string) { setHistory((current) => current.filter((item) => item.id !== id)); setFeedback('历史记录已删除。'); }
  const generateLabel = useMemo(() => { if (!trimmedPrompt) return '生成图片'; if (status === 'generating') return '正在生成…'; if (status === 'succeeded') return '再次生成'; if (status === 'failed') return '重试生成'; if (status === 'cancelled') return '重新生成'; return `生成 ${config.count} 张图片`; }, [config.count, status, trimmedPrompt]);
  const promptError = !trimmedPrompt && status !== 'idle' ? '生成前需要填写提示词。' : '';

  return (
    <main className="image-workbench" aria-label="生图工作台">
      <section className="image-workbench__frame">
        <header className="image-workbench__topbar"><div className="image-workbench__title-group"><p className="image-workbench__eyebrow">智能生成</p><h1>生图工作台</h1><p>参数 + 提示词 + 结果</p></div><div className="image-workbench__top-actions"><button className="image-workbench__button" onClick={() => addMockReference()} type="button">导入参考图</button><button className="image-workbench__button image-workbench__button--primary" disabled={!canGenerate} onClick={handleGenerate} type="button">{generateLabel}</button></div></header>
        <div className="image-workbench__columns image-workbench__columns--merged">
          <section className="image-workbench__card image-workbench__card--composer image-workbench__card--image-studio">
            <div className="image-studio__params" aria-label="生图参数"><div className="image-studio__field image-studio__field--select"><span>图片模型</span><strong>{config.modelId} ? 3 通道</strong><ChevronDownIcon /></div><div className="image-studio__field"><span>尺寸</span><strong>{config.size}</strong></div><div className="image-studio__field image-studio__field--quality"><span>质量</span><div className="image-studio__quality-group" role="group" aria-label="质量">{qualityOptions.map((option) => <button aria-pressed={config.quality === option} className={config.quality === option ? 'image-studio__quality image-studio__quality--active' : 'image-studio__quality'} key={option} onClick={() => updateConfig({ quality: option })} type="button">{option}</button>)}</div></div><CompactNumber label="数量" value={config.count} min={1} max={4} onChange={(count) => updateConfig({ count })} /><CompactNumber label="风格强度" value={config.styleStrength} min={0} max={100} suffix="%" onChange={(styleStrength) => updateConfig({ styleStrength })} /><CompactNumber disabled={references.length === 0} hint={references.length === 0 ? '添加参考图后启用' : undefined} label="参考权重" value={config.referenceWeight} min={0} max={100} suffix="%" onChange={(referenceWeight) => updateConfig({ referenceWeight })} /></div>
            <div className="image-studio__status-strip"><label className="image-studio__save-option"><input checked={config.saveToProject} onChange={(event) => updateConfig({ saveToProject: event.target.checked })} type="checkbox" /><span aria-hidden="true" className="image-workbench__checkbox"><CheckIcon /></span><span>保存到本地项目</span></label><div className="image-studio__queue-inline"><span>队列</span><strong>{status === 'generating' ? 'Mock 任务执行中' : '暂无等待任务'}</strong></div></div>
            <label className="image-studio__prompt-area"><span>提示词</span><textarea aria-invalid={Boolean(promptError)} aria-label="提示词" maxLength={4000} onChange={(event) => updatePrompt(event.target.value)} placeholder="描述画面主体、风格、构图、光线和用途" value={promptText} /></label><div className="image-studio__count" aria-live="polite">{promptText.length}/4000</div>{promptError && <div className="image-studio__hint image-studio__hint--error" role="alert">{promptError}</div>}
            <label className="image-studio__prompt-area image-studio__prompt-area--negative"><span>反向提示词</span><textarea aria-label="反向提示词" maxLength={1000} onChange={(event) => setNegativePrompt(event.target.value)} placeholder="不希望出现的元素，例如低清晰度、畸形、过曝" value={negativePrompt} /></label>
            <div className="image-studio__upload-zone"><button className="image-studio__upload-button" disabled={references.length >= 4} onClick={() => addMockReference()} type="button"><UploadIcon /><span>上传参考图</span></button><div><strong>可选上传参考图，支持图生图/重绘</strong><p>最多 4 张，每张 8MB；当前模型会走参考图生成通道。</p></div></div>
            <div className="image-studio__reference-list" aria-label="参考图列表">{references.length === 0 ? <span className="image-studio__empty-inline">暂无参考图，参考权重暂不可用。</span> : references.map((ref) => <div className={`image-studio__reference image-studio__reference--${ref.palette}`} key={ref.id}><span>{ref.previewLabel}</span><button aria-label={`移除${ref.name}`} onClick={() => removeReference(ref.id)} type="button">移除</button></div>)}</div>
            <div className="image-studio__actions" aria-label="快捷操作"><div className="image-studio__action-row">{quickActionsTop.map((action, index) => <button className={`image-studio__action ${index === 1 ? 'image-studio__action--warm' : ''}`} key={action} onClick={() => handleQuickAction(action)} type="button"><ActionIcon variant={index} /><span>{action}</span></button>)}</div><div className="image-studio__action-row image-studio__action-row--secondary">{quickActionsBottom.map((action, index) => <button className="image-studio__action image-studio__action--ghost" key={action} onClick={() => handleQuickAction(action)} type="button"><ActionIcon variant={index + 5} /><span>{action}</span></button>)}</div></div>
            {status === 'generating' && <div className="image-studio__loading" aria-busy="true"><span /><p>Mock AI 正在分析提示词、参考图和参数。</p><button onClick={handleCancel} type="button">取消</button></div>}{(status === 'failed' || errorMessage) && <div className="image-studio__hint image-studio__hint--error" role="alert">{errorMessage || 'Mock AI 生成请求失败。请重试，或调整提示词与参数后再次生成。'}</div>}{status === 'cancelled' && <div className="image-studio__hint" role="status">已取消生成。</div>}{feedback && <div className="image-studio__hint" aria-live="polite">{feedback}</div>}
            <button className="image-workbench__generate image-studio__submit" disabled={!canGenerate} onClick={handleGenerate} type="button">{generateLabel}</button>
          </section>
          <section className="image-workbench__card image-workbench__card--results"><div className="image-workbench__card-head"><h2>结果画布</h2><span>网格 / 对比</span></div><ResultPanel currentRequest={currentRequest} onAddReference={(result) => addMockReference('result', result)} onCopyConfig={copyResultConfig} onDeleteResult={deleteResult} onPreview={setPreviewResult} onSelect={setSelectedResultId} results={results} selectedResultId={selectedResultId} status={status} /><HistoryPanel history={history} onDelete={deleteHistory} onRestore={restoreHistory} /><div className="image-workbench__status-card" aria-live="polite"><strong>生成状态：{statusLabel}</strong><span>{selectedResult ? `${selectedResult.variantName} · ${parameterSummary}` : '种子 / 尺寸 / 质量元数据与快捷操作'}</span></div></section>
        </div>
        <footer className="image-workbench__statusbar">Mock 工作流：提示词 / 参数 / 参考图 / 结果 / 历史</footer>
      </section>{previewResult && <PreviewModal onClose={() => setPreviewResult(null)} result={previewResult} />}
    </main>
  );
}

function CompactNumber({ disabled = false, hint, label, max, min, onChange, suffix = '', value }: { disabled?: boolean; hint?: string; label: string; max: number; min: number; onChange: (value: number) => void; suffix?: string; value: number }) { return <div className={`image-studio__field ${disabled ? 'image-studio__field--disabled' : ''}`}><span>{label}</span><div className="image-studio__stepper"><button disabled={disabled || value <= min} onClick={() => onChange(Math.max(min, value - 1))} type="button">-</button><strong>{value}{suffix}</strong><button disabled={disabled || value >= max} onClick={() => onChange(Math.min(max, value + 1))} type="button">+</button></div>{hint && <small>{hint}</small>}</div>; }
function ResultPanel({ currentRequest, onAddReference, onCopyConfig, onDeleteResult, onPreview, onSelect, results, selectedResultId, status }: { currentRequest: ImageGenerationRequest | null; onAddReference: (result: GenerationResult) => void; onCopyConfig: (result: GenerationResult) => void; onDeleteResult: (id: string) => void; onPreview: (result: GenerationResult) => void; onSelect: (id: string) => void; results: GenerationResult[]; selectedResultId: string | null; status: GenerationStatus }) { if (status === 'generating') return <div className="image-results__loading" aria-busy="true"><span /><strong>正在生成图片…</strong><p>Mock AI 正在排布画面与风格。</p></div>; if (results.length === 0) return <div className="image-results__empty"><strong>还没有生成图片</strong><p>输入提示词并点击生成后，结果会显示在这里。</p></div>; return <div className="image-results__grid">{results.map((result) => <div className="image-results__item" key={result.id}><button aria-pressed={selectedResultId === result.id} className={`image-workbench__result-card image-workbench__result-card--${result.palette} ${selectedResultId === result.id ? 'image-workbench__result-card--active' : ''}`} onClick={() => onSelect(result.id)} onKeyDown={(event) => { if (event.key === 'Enter') onSelect(result.id); }} type="button"><MockImage palette={result.palette} /><div className="image-workbench__result-meta"><span>{result.variantName}</span><span aria-hidden="true">...</span></div></button><div className="image-results__actions"><button onClick={() => onPreview(result)} type="button">预览</button><button onClick={() => onAddReference(result)} type="button">加入参考图</button><button disabled={!currentRequest} onClick={() => void onCopyConfig(result)} type="button">复制参数</button><button onClick={() => onDeleteResult(result.id)} type="button">删除</button></div></div>)}</div>; }
function HistoryPanel({ history, onDelete, onRestore }: { history: GenerationHistoryItem[]; onDelete: (id: string) => void; onRestore: (item: GenerationHistoryItem) => void }) { return <section className="image-history" aria-label="生成历史"><div className="image-history__head"><h3>生成历史</h3><span>{history.length}</span></div>{history.length === 0 ? <div className="image-history__empty">暂无生成历史</div> : history.map((item) => <div className="image-history__item" key={item.id}><button onClick={() => onRestore(item)} type="button"><strong>{summarize(item.request.prompt)}</strong><span>{formatTime(item.createdAt)} · {item.request.config.modelId} · {item.request.config.size} · {item.request.config.count} 张</span></button><span className={`image-history__badge image-history__badge--${item.status}`}>{getStatusLabel(item.status)}</span><button aria-label="删除历史" onClick={() => onDelete(item.id)} type="button">删除</button></div>)}</section>; }
function PreviewModal({ onClose, result }: { onClose: () => void; result: GenerationResult }) { return <div className="image-preview-modal" role="dialog" aria-modal="true" aria-label="预览结果"><div><button aria-label="关闭预览" onClick={onClose} type="button">关闭</button><MockImage palette={result.palette} /><strong>{result.variantName}</strong></div></div>; }
function MockImage({ palette }: { palette: Palette }) { const colorA = palette === 'cyan' ? '#20c7d2' : palette === 'violet' ? '#8b5cf6' : palette === 'orange' ? '#f59e0b' : '#5a7cff'; const colorB = palette === 'cyan' ? '#31d3e8' : palette === 'violet' ? '#a78bfa' : palette === 'orange' ? '#fb7185' : '#6fa0ff'; return <div className="image-workbench__mock-image" aria-hidden="true"><svg viewBox="0 0 220 150" role="img"><defs><linearGradient id={`image-gradient-${palette}`} x1="0" x2="1" y1="1" y2="0"><stop offset="0" stopColor={colorA} /><stop offset="1" stopColor={colorB} /></linearGradient></defs><rect width="220" height="150" rx="12" fill="#252d3f" /><circle cx="64" cy="47" r="20" fill="#f7a91b" /><path d="M24 130L90 64L144 116L194 40L206 130H24Z" fill={`url(#image-gradient-${palette})`} /></svg></div>; }
function getStatusLabel(status: GenerationStatus) { return ({ idle: '未开始', editing: '编辑中', ready: '待生成', generating: '正在生成…', succeeded: '已完成', failed: '失败', cancelled: '已取消' } satisfies Record<GenerationStatus, string>)[status]; }
function summarize(text: string) { return text.length > 34 ? `${text.slice(0, 34)}…` : text; }
function formatTime(value: string) { return new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }); }
function ActionIcon({ variant }: { variant: number }) { const paths = [<path key="book" d="M5 5.5h9a3 3 0 0 1 3 3v10H8a3 3 0 0 0-3 3v-16Z" />, <path key="box" d="M4 8h16M7 8V5h10v3M7 12h10M8 16h8" />, <path key="gear" d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7ZM12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3" />, <path key="flask" d="M9 3h6M10 3v5l-5 9a3 3 0 0 0 2.6 4.5h8.8A3 3 0 0 0 19 17l-5-9V3" />, <path key="bookmark" d="M6 4h12v17l-6-3-6 3V4Z" />, <path key="save" d="M5 4h12l2 2v14H5V4ZM8 4v6h8M8 17h8" />, <path key="copy" d="M8 8h11v11H8zM5 5h11" />, <path key="clear" d="M5 7h14M10 11v6M14 11v6M8 7l1-3h6l1 3M7 7l1 14h8l1-14" />, <path key="lab" d="M7 17 17 7M9 7h8v8" />]; return <SvgIcon>{paths[variant] ?? paths[0]}</SvgIcon>; }
function SvgIcon({ children }: { children: ReactNode }) { return <svg aria-hidden="true" fill="none" focusable="false" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">{children}</svg>; }
function CheckIcon() { return <SvgIcon><path d="M5 12l4 4L19 6" /></SvgIcon>; }
function ChevronDownIcon() { return <SvgIcon><path d="m6 9 6 6 6-6" /></SvgIcon>; }
function UploadIcon() { return <SvgIcon><path d="M12 16V4M7 9l5-5 5 5M5 20h14" /></SvgIcon>; }
