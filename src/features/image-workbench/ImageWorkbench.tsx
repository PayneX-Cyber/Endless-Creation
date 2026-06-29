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
interface GenerationResult { id: string; requestId: string; variantName: string; status: 'succeeded' | 'failed'; palette: Palette; imageUrl?: string; revisedPrompt?: string; localPath?: string; fileName?: string; mimeType?: string; }
interface GenerationHistoryItem { id: string; request: ImageGenerationRequest; status: GenerationStatus; results: GenerationResult[]; createdAt: string; durationMs?: number; errorMessage?: string; }
interface ModelPreferences { imageModel?: string; imageModels?: string[]; }
interface ApiProviderChannel { id: string; name?: string; baseUrl?: string; apiKey?: string; apiFormat?: string; enabled?: boolean; models?: string[]; }
interface ApiProviderStore { channels?: ApiProviderChannel[]; }
interface ImageModelOption { value: string; modelName: string; channelName: string; label: string; }
interface SizePreset { label: string; width?: number; height?: number; value?: string; }

const MODEL_PREFERENCES_STORAGE_KEY = 'endless-creation.model-preferences';
const API_PROVIDER_STORAGE_KEY = 'endless-creation.api-provider-config';
const qualityOptions: QualityOption[] = ['自动', '高', '中', '低'];
const quickActionsTop = ['提示词库', '方案库', '参数设置', '改稿实验', '存为模板'] as const;
const quickActionsBottom = ['存方案包', '复制', '清空', 'Prompt Lab'] as const;
const palettes: Palette[] = ['blue', 'cyan', 'violet', 'orange'];
const baseConfig: ImageGenerationConfig = { modelId: '', size: '1536×1024', quality: '高', count: 1, style: '电影感', styleStrength: 72, referenceWeight: 60, saveToProject: true };
const sizePresets: SizePreset[] = [
  { label: '1:1', width: 1024, height: 1024 },
  { label: '3:2', width: 1536, height: 1024 },
  { label: '2:3', width: 1024, height: 1536 },
  { label: '4:3', width: 1360, height: 1024 },
  { label: '3:4', width: 1024, height: 1360 },
  { label: '16:9', width: 1536, height: 864 },
  { label: '9:16', width: 864, height: 1536 },
  { label: '1:1(2k)', width: 2048, height: 2048 },
  { label: '16:9(2k)', width: 2048, height: 1152 },
  { label: '9:16(2k)', width: 1152, height: 2048 },
  { label: '16:9(4k)', width: 4096, height: 2304 },
  { label: '9:16(4k)', width: 2304, height: 4096 },
  { label: 'auto', value: 'auto' },
];
let idSeed = 0;
function createId(prefix: string) { idSeed += 1; return `${prefix}-${Date.now()}-${idSeed}`; }

export function ImageWorkbench() {
  const [modelPreferences, setModelPreferences] = useState<ModelPreferences>(() => readLocalStorage(MODEL_PREFERENCES_STORAGE_KEY, {}));
  const [apiProviderStore, setApiProviderStore] = useState<ApiProviderStore>(() => readLocalStorage(API_PROVIDER_STORAGE_KEY, {}));
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
  const [isModelMenuOpen, setModelMenuOpen] = useState(false);
  const timerRef = useRef<number | null>(null);
  const modelMenuRef = useRef<HTMLDivElement | null>(null);
  const generationRunRef = useRef(0);
  const activeImageRequestIdRef = useRef<string | null>(null);
  const trimmedPrompt = promptText.trim();
  const imageModelOptions = useMemo(() => resolveImageModelOptions(modelPreferences, apiProviderStore), [apiProviderStore, modelPreferences]);
  const selectedImageModel = imageModelOptions.find((option) => option.value === config.modelId) ?? null;
  const canGenerate = trimmedPrompt.length > 0 && Boolean(selectedImageModel) && status !== 'generating';
  const statusLabel = getStatusLabel(status);
  const selectedResult = results.find((result) => result.id === selectedResultId) ?? null;
  const imageModelLabel = selectedImageModel?.label ?? '未配置图片模型';
  const parameterSummary = `${imageModelLabel} · ${config.size} · ${config.quality} · ${config.count} 张`;

  const refreshModelStores = useCallback(() => {
    setModelPreferences(readLocalStorage(MODEL_PREFERENCES_STORAGE_KEY, {}));
    setApiProviderStore(readLocalStorage(API_PROVIDER_STORAGE_KEY, {}));
  }, []);

  useEffect(() => {
    refreshModelStores();

    function refreshOnFocus() {
      refreshModelStores();
    }

    function refreshOnVisibilityChange() {
      if (!document.hidden) refreshModelStores();
    }

    function refreshOnStorage(event: StorageEvent) {
      if (event.key === MODEL_PREFERENCES_STORAGE_KEY || event.key === API_PROVIDER_STORAGE_KEY) refreshModelStores();
    }

    window.addEventListener('focus', refreshOnFocus);
    document.addEventListener('visibilitychange', refreshOnVisibilityChange);
    window.addEventListener('storage', refreshOnStorage);
    window.addEventListener('endless-creation:model-preferences-updated', refreshOnFocus);
    return () => {
      window.removeEventListener('focus', refreshOnFocus);
      document.removeEventListener('visibilitychange', refreshOnVisibilityChange);
      window.removeEventListener('storage', refreshOnStorage);
      window.removeEventListener('endless-creation:model-preferences-updated', refreshOnFocus);
    };
  }, [refreshModelStores]);

  useEffect(() => {
    const preferredModel = normalizeImageModelValue(modelPreferences.imageModel, imageModelOptions);
    const nextModelId = preferredModel || imageModelOptions[0]?.value || '';
    setConfig((current) => current.modelId === nextModelId ? current : { ...current, modelId: nextModelId });
  }, [imageModelOptions, modelPreferences.imageModel]);

  useEffect(() => {
    if (!isModelMenuOpen) return;
    function closeOnOutsidePointerDown(event: PointerEvent) {
      if (!modelMenuRef.current?.contains(event.target as Node)) setModelMenuOpen(false);
    }
    document.addEventListener('pointerdown', closeOnOutsidePointerDown, true);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointerDown, true);
  }, [isModelMenuOpen]);

  const createRequestSnapshot = useCallback((): ImageGenerationRequest => ({ id: createId('request'), prompt: promptText.trim(), negativePrompt, references: references.map((item) => ({ ...item })), config: { ...config }, createdAt: new Date().toISOString() }), [config, negativePrompt, promptText, references]);
  const clearGenerationTimer = useCallback(() => { if (timerRef.current !== null) { window.clearTimeout(timerRef.current); timerRef.current = null; } }, []);
  const runImageGeneration = useCallback(async (request: ImageGenerationRequest) => {
    const runId = generationRunRef.current + 1;
    generationRunRef.current = runId;
    const startedAt = performance.now();
    const decodedModel = decodeChannelModel(request.config.modelId);
    const channel = findChannelForModel(request.config.modelId, apiProviderStore);
    const validationError = validateImageGenerationRequest(request, channel, decodedModel?.model);

    if (validationError) {
      const failedItem: GenerationHistoryItem = { id: createId('history'), request, status: 'failed', results: [], createdAt: new Date().toISOString(), durationMs: 0, errorMessage: validationError };
      setStatus('failed'); setErrorMessage(validationError); setFeedback(''); setHistory((current) => [failedItem, ...current].slice(0, 12)); return;
    }

    activeImageRequestIdRef.current = request.id;
    setCurrentRequest(request); setStatus('generating'); setErrorMessage(''); setFeedback('正在调用真实生图 API…');

    try {
      const response = await rendererBridge.generateImage({
        requestId: request.id,
        channelId: channel!.id,
        channelLabel: channel!.name?.trim() || '未命名渠道',
        baseUrl: channel!.baseUrl!,
        apiKey: channel!.apiKey!,
        model: decodedModel!.model,
        prompt: request.prompt,
        negativePrompt: request.negativePrompt,
        size: normalizeImageSize(request.config.size),
        quality: normalizeImageQuality(request.config.quality),
        count: request.config.count,
      });

      if (generationRunRef.current !== runId) return;
      activeImageRequestIdRef.current = null;

      if (!response.ok || !response.images?.length) {
        const message = response.message || '生图 API 未返回图片。';
        const failedItem: GenerationHistoryItem = { id: createId('history'), request, status: 'failed', results: [], createdAt: new Date().toISOString(), durationMs: Math.round(performance.now() - startedAt), errorMessage: message };
        setStatus('failed'); setErrorMessage(message); setFeedback(''); setHistory((current) => [failedItem, ...current].slice(0, 12)); return;
      }

      const nextResults: GenerationResult[] = response.images.map((image, index) => ({ id: createId('result'), requestId: request.id, variantName: `变体 ${index + 1}`, status: 'succeeded', palette: palettes[index % palettes.length], imageUrl: image.b64Json ? `data:image/png;base64,${image.b64Json}` : image.url, revisedPrompt: image.revisedPrompt, localPath: image.localPath, fileName: image.fileName, mimeType: image.mimeType }));
      const historyItem: GenerationHistoryItem = { id: createId('history'), request, status: 'succeeded', results: nextResults, createdAt: new Date().toISOString(), durationMs: Math.round(performance.now() - startedAt) };
      setResults(nextResults); setSelectedResultId(nextResults[0]?.id ?? null); setStatus('succeeded'); setFeedback('真实生图完成，已写入历史。'); setErrorMessage(''); setHistory((current) => [historyItem, ...current].slice(0, 12));
    } catch (error) {
      if (generationRunRef.current !== runId) return;
      activeImageRequestIdRef.current = null;
      const message = error instanceof Error ? error.message : '生图请求失败，请稍后重试。';
      const failedItem: GenerationHistoryItem = { id: createId('history'), request, status: 'failed', results: [], createdAt: new Date().toISOString(), durationMs: Math.round(performance.now() - startedAt), errorMessage: message };
      setStatus('failed'); setErrorMessage(message); setFeedback(''); setHistory((current) => [failedItem, ...current].slice(0, 12));
    }
  }, [apiProviderStore]);
  const handleGenerate = useCallback(() => { if (!canGenerate) { if (!trimmedPrompt) setErrorMessage('生成前需要填写提示词。'); else if (!selectedImageModel) setErrorMessage('请先在 API配置 / 模型偏好 中选择图片模型。'); else setErrorMessage('当前状态暂不能生成。'); return; } void runImageGeneration(createRequestSnapshot()); }, [canGenerate, createRequestSnapshot, runImageGeneration, selectedImageModel, trimmedPrompt]);
  const handleCancel = useCallback(() => { if (status !== 'generating') return; const requestId = activeImageRequestIdRef.current; generationRunRef.current += 1; activeImageRequestIdRef.current = null; clearGenerationTimer(); setStatus('cancelled'); setFeedback('已停止等待，远端请求可能仍在执行。'); setErrorMessage(''); if (requestId) { void rendererBridge.cancelImageGeneration(requestId).then((result) => { setFeedback(result.ok ? result.message : '已停止等待，远端请求可能仍在执行。'); }).catch(() => { setFeedback('已停止等待，远端请求可能仍在执行。'); }); } }, [clearGenerationTimer, status]);
  useEffect(() => () => clearGenerationTimer(), [clearGenerationTimer]);
  useEffect(() => { function onKeyDown(event: KeyboardEvent) { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); handleGenerate(); } if (event.key === 'Escape') { if (status === 'generating') handleCancel(); if (previewResult) setPreviewResult(null); } } window.addEventListener('keydown', onKeyDown); return () => window.removeEventListener('keydown', onKeyDown); }, [handleCancel, handleGenerate, previewResult, status]);

  function updatePrompt(value: string) { setPromptText(value); setErrorMessage(''); if (status === 'generating') return; setStatus(value.trim() ? 'ready' : 'idle'); }
  function updateConfig(patch: Partial<ImageGenerationConfig>) { setConfig((current) => ({ ...current, ...patch })); if (status === 'idle') setStatus('editing'); }
  function addMockReference(source: ReferenceImage['source'] = 'mock', result?: GenerationResult) { setReferences((current) => { if (current.length >= 4) { setFeedback('参考图最多添加 4 张。'); return current; } const nextIndex = current.length + 1; const item: ReferenceImage = { id: createId('ref'), name: source === 'result' ? `${result?.variantName ?? '结果'}参考图` : `参考图 ${nextIndex}`, source, previewLabel: source === 'result' ? (result?.variantName ?? `结果 ${nextIndex}`) : `参考图 ${nextIndex}`, palette: result?.palette ?? palettes[(nextIndex - 1) % palettes.length] }; setFeedback(`已添加${item.name}。`); return [...current, item]; }); if (status === 'idle') setStatus('editing'); }
  function removeReference(id: string) { setReferences((current) => current.filter((item) => item.id !== id)); setFeedback('已移除参考图。'); }
  async function copyText(text: string, success: string) { if (!text.trim()) { setFeedback('没有可复制的内容。'); return; } try { await rendererBridge.copyText(text); setFeedback(success); } catch { setFeedback('复制失败，请手动复制。'); } }
  function handleQuickAction(action: string) { if (action === '清空') { setPromptText(''); setNegativePrompt(''); setStatus('idle'); setFeedback('提示词已清空。'); return; } if (action === '复制') { void copyText(promptText, '提示词已复制。'); return; } setFeedback(`${action} 暂未接入真实功能。`); }
  async function copyResultConfig(result: GenerationResult) { if (!currentRequest) { setFeedback('暂无生成参数可复制。'); return; } await copyText(JSON.stringify({ resultId: result.id, prompt: currentRequest.prompt, negativePrompt: currentRequest.negativePrompt, config: currentRequest.config, localPath: result.localPath, fileName: result.fileName, mimeType: result.mimeType }, null, 2), '参数已复制。'); }
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
<div className="image-studio__params" aria-label="生图参数"><div className="image-studio__model-menu" ref={modelMenuRef}><button className="image-studio__field image-studio__field--select image-studio__model-trigger" type="button" disabled={imageModelOptions.length === 0} aria-haspopup="listbox" aria-expanded={isModelMenuOpen} onClick={() => { if (imageModelOptions.length) setModelMenuOpen((open) => !open); }}><span>图片模型</span><strong>{imageModelLabel}</strong><ChevronDownIcon /></button>{isModelMenuOpen && imageModelOptions.length ? <div className="image-studio__model-dropdown" role="listbox" aria-label="图片模型">{imageModelOptions.map((option) => { const selected = option.value === config.modelId; return <button className={selected ? 'image-studio__model-option image-studio__model-option--active' : 'image-studio__model-option'} type="button" role="option" aria-selected={selected} key={option.value} onClick={() => { updateConfig({ modelId: option.value }); setModelMenuOpen(false); }}><span aria-hidden="true" /><strong>{option.label}</strong></button>; })}</div> : null}</div><SizeField value={config.size} onChange={(size) => updateConfig({ size })} /><div className="image-studio__field image-studio__field--quality"><span>质量</span><div className="image-studio__quality-group" role="group" aria-label="质量">{qualityOptions.map((option) => <button aria-pressed={config.quality === option} className={config.quality === option ? 'image-studio__quality image-studio__quality--active' : 'image-studio__quality'} key={option} onClick={() => updateConfig({ quality: option })} type="button">{option}</button>)}</div></div><CompactNumber label="数量" value={config.count} min={1} max={4} onChange={(count) => updateConfig({ count })} /></div>
            <div className="image-studio__status-strip"><label className="image-studio__save-option"><input checked={config.saveToProject} onChange={(event) => updateConfig({ saveToProject: event.target.checked })} type="checkbox" /><span aria-hidden="true" className="image-workbench__checkbox"><CheckIcon /></span><span>保存到本地项目</span></label><div className="image-studio__queue-inline"><span>队列</span><strong>{status === 'generating' ? '真实 API 生成中' : '暂无等待任务'}</strong></div></div>
            <label className="image-studio__prompt-area"><span>提示词</span><textarea aria-invalid={Boolean(promptError)} aria-label="提示词" maxLength={4000} onChange={(event) => updatePrompt(event.target.value)} placeholder="描述画面主体、风格、构图、光线和用途" value={promptText} /></label><div className="image-studio__count" aria-live="polite">{promptText.length}/4000</div>{promptError && <div className="image-studio__hint image-studio__hint--error" role="alert">{promptError}</div>}
            <label className="image-studio__prompt-area image-studio__prompt-area--negative"><span>反向提示词</span><textarea aria-label="反向提示词" maxLength={1000} onChange={(event) => setNegativePrompt(event.target.value)} placeholder="不希望出现的元素，例如低清晰度、畸形、过曝" value={negativePrompt} /></label>
            <div className="image-studio__upload-zone"><button className="image-studio__upload-button" disabled={references.length >= 4} onClick={() => addMockReference()} type="button"><UploadIcon /><span>上传参考图</span></button><div><strong>可选上传参考图，支持图生图/重绘</strong><p>最多 4 张，每张 8MB；当前模型会走参考图生成通道。</p></div></div>
            <div className="image-studio__reference-list" aria-label="参考图列表">{references.length === 0 ? <span className="image-studio__empty-inline">暂无参考图。</span> : references.map((ref) => <div className={`image-studio__reference image-studio__reference--${ref.palette}`} key={ref.id}><span>{ref.previewLabel}</span><button aria-label={`移除${ref.name}`} onClick={() => removeReference(ref.id)} type="button">移除</button></div>)}</div>
            <div className="image-studio__actions" aria-label="快捷操作"><div className="image-studio__action-row">{quickActionsTop.map((action, index) => <button className={`image-studio__action ${index === 1 ? 'image-studio__action--warm' : ''}`} key={action} onClick={() => handleQuickAction(action)} type="button"><ActionIcon variant={index} /><span>{action}</span></button>)}</div><div className="image-studio__action-row image-studio__action-row--secondary">{quickActionsBottom.map((action, index) => <button className="image-studio__action image-studio__action--ghost" key={action} onClick={() => handleQuickAction(action)} type="button"><ActionIcon variant={index + 5} /><span>{action}</span></button>)}</div></div>
            {status === 'generating' && <div className="image-studio__loading" aria-busy="true"><span /><p>真实 API 正在生成图片…</p><button onClick={handleCancel} type="button">取消</button></div>}{(status === 'failed' || errorMessage) && <div className="image-studio__hint image-studio__hint--error" role="alert">{errorMessage || '生图请求失败，请重试或检查配置。'}</div>}{status === 'cancelled' && <div className="image-studio__hint" role="status">已停止等待，远端请求可能仍在执行。</div>}{feedback && <div className="image-studio__hint" aria-live="polite">{feedback}</div>}
            <button className="image-workbench__generate image-studio__submit" disabled={!canGenerate} onClick={handleGenerate} type="button">{generateLabel}</button>
          </section>
          <section className="image-workbench__card image-workbench__card--results"><div className="image-workbench__card-head"><h2>结果画布</h2><span>网格 / 对比</span></div><ResultPanel currentRequest={currentRequest} onAddReference={(result) => addMockReference('result', result)} onCopyConfig={copyResultConfig} onDeleteResult={deleteResult} onPreview={setPreviewResult} onSelect={setSelectedResultId} results={results} selectedResultId={selectedResultId} status={status} /><HistoryPanel history={history} onDelete={deleteHistory} onRestore={restoreHistory} /><div className="image-workbench__status-card" aria-live="polite"><strong>生成状态：{statusLabel}</strong><span>{selectedResult ? `${selectedResult.variantName} · ${parameterSummary}` : '种子 / 尺寸 / 质量元数据与快捷操作'}</span></div></section>
        </div>
        <footer className="image-workbench__statusbar">工作流：提示词 / 参数 / 参考图 / 结果 / 历史</footer>
      </section>{previewResult && <PreviewModal onClose={() => setPreviewResult(null)} result={previewResult} />}
    </main>
  );
}

function CompactNumber({ disabled = false, hint, label, max, min, onChange, suffix = '', value }: { disabled?: boolean; hint?: string; label: string; max: number; min: number; onChange: (value: number) => void; suffix?: string; value: number }) { return <div className={`image-studio__field ${disabled ? 'image-studio__field--disabled' : ''}`}><span>{label}</span><div className="image-studio__stepper"><button disabled={disabled || value <= min} onClick={() => onChange(Math.max(min, value - 1))} type="button">-</button><strong>{value}{suffix}</strong><button disabled={disabled || value >= max} onClick={() => onChange(Math.min(max, value + 1))} type="button">+</button></div>{hint && <small>{hint}</small>}</div>; }
function SizeField({ onChange, value }: { onChange: (value: string) => void; value: string }) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    function closeOnPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false);
    }
    document.addEventListener('pointerdown', closeOnPointerDown, true);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnPointerDown, true);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isOpen]);

  function selectPreset(preset: SizePreset) {
    if (preset.value) {
      onChange(preset.value);
      setIsOpen(false);
      return;
    }
    if (preset.width && preset.height) {
      onChange(`${preset.width}×${preset.height}`);
      setIsOpen(false);
    }
  }

  return (
    <div className="image-studio__size-menu" ref={rootRef}>
      <button className="image-studio__field image-studio__size-trigger" type="button" aria-haspopup="dialog" aria-expanded={isOpen} onClick={() => setIsOpen((open) => !open)}>
        <span>画面比例</span>
        <strong>{getAspectRatioLabel(value)}</strong>
        <ChevronDownIcon />
      </button>
      {isOpen ? (
        <div className="image-studio__size-panel" role="dialog" aria-label="画面比例">
          <div className="image-studio__size-panel-head">
            <strong>画面比例</strong>
          </div>
          <strong className="image-studio__size-section-title">宽高比</strong>
          <div className="image-studio__size-presets" aria-label="宽高比预设">
            {sizePresets.map((preset) => {
              const presetValue = preset.value ?? `${preset.width}×${preset.height}`;
              const ratioStyle = getRatioPreviewStyle(preset);
              return <button className={presetValue === value ? 'image-studio__size-preset image-studio__size-preset--active' : 'image-studio__size-preset'} key={preset.label} type="button" onClick={() => selectPreset(preset)}><span className="image-studio__size-ratio-wrap" aria-hidden="true">{ratioStyle ? <span className="image-studio__size-ratio" style={ratioStyle} /> : <span className="image-studio__size-ratio image-studio__size-ratio--auto" />}</span><span>{preset.label}</span></button>;
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
function ResultPanel({ currentRequest, onAddReference, onCopyConfig, onDeleteResult, onPreview, onSelect, results, selectedResultId, status }: { currentRequest: ImageGenerationRequest | null; onAddReference: (result: GenerationResult) => void; onCopyConfig: (result: GenerationResult) => void; onDeleteResult: (id: string) => void; onPreview: (result: GenerationResult) => void; onSelect: (id: string) => void; results: GenerationResult[]; selectedResultId: string | null; status: GenerationStatus }) { if (status === 'generating') return <div className="image-results__loading" aria-busy="true"><span /><strong>正在生成图片…</strong><p>真实 API 正在生成图片，请稍候。</p></div>; if (results.length === 0) return <div className="image-results__empty"><strong>还没有生成图片</strong><p>输入提示词并点击生成后，结果会显示在这里。</p></div>; return <div className="image-results__grid">{results.map((result) => <div className="image-results__item" key={result.id}><button aria-pressed={selectedResultId === result.id} className={`image-workbench__result-card image-workbench__result-card--${result.palette} ${selectedResultId === result.id ? 'image-workbench__result-card--active' : ''}`} onClick={() => onSelect(result.id)} onKeyDown={(event) => { if (event.key === 'Enter') onSelect(result.id); }} type="button">{result.imageUrl ? <img className="image-workbench__generated-image" src={result.imageUrl} alt={result.variantName} /> : <MockImage palette={result.palette} />}<div className="image-workbench__result-meta"><span>{result.variantName}</span><span title={result.localPath}>{result.fileName || (result.localPath ? '已保存' : '...')}</span></div></button><div className="image-results__actions"><button onClick={() => onPreview(result)} type="button">预览</button><button onClick={() => onAddReference(result)} type="button">加入参考图</button><button disabled={!currentRequest} onClick={() => void onCopyConfig(result)} type="button">复制参数</button><button onClick={() => onDeleteResult(result.id)} type="button">删除</button></div></div>)}</div>; }
function HistoryPanel({ history, onDelete, onRestore }: { history: GenerationHistoryItem[]; onDelete: (id: string) => void; onRestore: (item: GenerationHistoryItem) => void }) { return <section className="image-history" aria-label="生成历史"><div className="image-history__head"><h3>生成历史</h3><span>{history.length}</span></div>{history.length === 0 ? <div className="image-history__empty">暂无生成历史</div> : history.map((item) => <div className="image-history__item" key={item.id}><button onClick={() => onRestore(item)} type="button"><strong>{summarize(item.request.prompt)}</strong><span>{formatTime(item.createdAt)} · {item.request.config.modelId} · {item.request.config.size} · {item.request.config.count} 张</span></button><span className={`image-history__badge image-history__badge--${item.status}`}>{getStatusLabel(item.status)}</span><button aria-label="删除历史" onClick={() => onDelete(item.id)} type="button">删除</button></div>)}</section>; }
function PreviewModal({ onClose, result }: { onClose: () => void; result: GenerationResult }) { return <div className="image-preview-modal" role="dialog" aria-modal="true" aria-label="预览结果"><div><button aria-label="关闭预览" onClick={onClose} type="button">关闭</button>{result.imageUrl ? <img className="image-workbench__generated-image" src={result.imageUrl} alt={result.variantName} /> : <MockImage palette={result.palette} />}<strong>{result.variantName}</strong></div></div>; }
function MockImage({ palette }: { palette: Palette }) { const colorA = palette === 'cyan' ? '#20c7d2' : palette === 'violet' ? '#8b5cf6' : palette === 'orange' ? '#f59e0b' : '#5a7cff'; const colorB = palette === 'cyan' ? '#31d3e8' : palette === 'violet' ? '#a78bfa' : palette === 'orange' ? '#fb7185' : '#6fa0ff'; return <div className="image-workbench__mock-image" aria-hidden="true"><svg viewBox="0 0 220 150" role="img"><defs><linearGradient id={`image-gradient-${palette}`} x1="0" x2="1" y1="1" y2="0"><stop offset="0" stopColor={colorA} /><stop offset="1" stopColor={colorB} /></linearGradient></defs><rect width="220" height="150" rx="12" fill="#252d3f" /><circle cx="64" cy="47" r="20" fill="#f7a91b" /><path d="M24 130L90 64L144 116L194 40L206 130H24Z" fill={`url(#image-gradient-${palette})`} /></svg></div>; }
function getStatusLabel(status: GenerationStatus) { return ({ idle: '未开始', editing: '编辑中', ready: '待生成', generating: '正在生成…', succeeded: '已完成', failed: '失败', cancelled: '已取消' } satisfies Record<GenerationStatus, string>)[status]; }
function summarize(text: string) { return text.length > 34 ? `${text.slice(0, 34)}…` : text; }
function formatTime(value: string) { return new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }); }
function readLocalStorage<T>(key: string, fallback: T): T {
  try {
    const rawValue = window.localStorage.getItem(key);
    if (!rawValue) return fallback;
    return JSON.parse(rawValue) as T;
  } catch {
    return fallback;
  }
}

function resolveImageModelOptions(modelPreferences: ModelPreferences, apiProviderStore: ApiProviderStore): ImageModelOption[] {
  const channelMap = new Map((apiProviderStore.channels ?? []).map((channel) => [channel.id, channel.name?.trim() || '未命名渠道']));
  return uniqueStrings(modelPreferences.imageModels ?? []).map((value) => {
    const decoded = decodeChannelModel(value);
    const modelName = decoded?.model || value;
    const channelName = decoded ? (channelMap.get(decoded.channelId) ?? '未知渠道') : '本地偏好';
    return { value, modelName, channelName, label: `${modelName} · ${channelName}` };
  });
}

function normalizeImageModelValue(value: string | undefined, options: ImageModelOption[]) {
  if (!value) return '';
  const exactMatch = options.find((option) => option.value === value);
  if (exactMatch) return exactMatch.value;
  const modelNameMatch = options.find((option) => option.modelName === value);
  return modelNameMatch?.value ?? '';
}

function findChannelForModel(value: string, apiProviderStore: ApiProviderStore) {
  const decoded = decodeChannelModel(value);
  if (!decoded) return null;
  return (apiProviderStore.channels ?? []).find((channel) => channel.id === decoded.channelId) ?? null;
}

function validateImageGenerationRequest(request: ImageGenerationRequest, channel: ApiProviderChannel | null, model: string | undefined) {
  if (!request.prompt.trim()) return '生成前需要填写提示词。';
  if (!request.config.modelId || !model) return '请先在 API配置 / 模型偏好 中选择图片模型。';
  if (!channel) return '找不到图片模型对应的 API 渠道，请返回 API配置 检查渠道。';
  if (channel.enabled === false) return '当前 API 渠道已禁用，请在 API配置 中启用后重试。';
  if (!channel.baseUrl?.trim()) return '当前 API 渠道缺少 Base URL。';
  if (!channel.apiKey?.trim()) return '当前 API 渠道缺少 API Key。';
  if (channel.apiFormat && channel.apiFormat !== 'openai') return '第一阶段仅支持 OpenAI-compatible 文生图。';
  return '';
}

function normalizeImageSize(size: string) {
  return size.replace('×', 'x');
}

function getAspectRatioLabel(value: string) {
  if (value === 'auto') return 'auto';
  const preset = sizePresets.find((item) => (item.value ?? `${item.width}×${item.height}`) === value);
  if (preset) return preset.label.replace(/\(.+\)$/, '');
  const match = value.match(/^(\d+)\s*[×x]\s*(\d+)$/i);
  if (!match) return value;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!width || !height) return value;
  const divisor = greatestCommonDivisor(width, height);
  return `${width / divisor}:${height / divisor}`;
}

function getRatioPreviewStyle(preset: SizePreset) {
  if (!preset.width || !preset.height) return null;
  const maxWidth = 48;
  const maxHeight = 32;
  const scale = Math.min(maxWidth / preset.width, maxHeight / preset.height);
  return {
    width: Math.max(12, Math.round(preset.width * scale)),
    height: Math.max(12, Math.round(preset.height * scale)),
  };
}

function greatestCommonDivisor(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b) {
    const next = a % b;
    a = b;
    b = next;
  }
  return a || 1;
}

function normalizeImageQuality(quality: QualityOption) {
  return ({ 自动: 'auto', 高: 'high', 中: 'medium', 低: 'low' } satisfies Record<QualityOption, string>)[quality];
}

function decodeChannelModel(value: string) {
  const separatorIndex = value.indexOf('::');
  if (separatorIndex <= 0) return null;
  const channelId = value.slice(0, separatorIndex);
  const model = value.slice(separatorIndex + 2);
  if (!channelId || !model) return null;
  return { channelId, model };
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function ActionIcon({ variant }: { variant: number }) { const paths = [<path key="book" d="M5 5.5h9a3 3 0 0 1 3 3v10H8a3 3 0 0 0-3 3v-16Z" />, <path key="box" d="M4 8h16M7 8V5h10v3M7 12h10M8 16h8" />, <path key="gear" d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7ZM12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3" />, <path key="flask" d="M9 3h6M10 3v5l-5 9a3 3 0 0 0 2.6 4.5h8.8A3 3 0 0 0 19 17l-5-9V3" />, <path key="bookmark" d="M6 4h12v17l-6-3-6 3V4Z" />, <path key="save" d="M5 4h12l2 2v14H5V4ZM8 4v6h8M8 17h8" />, <path key="copy" d="M8 8h11v11H8zM5 5h11" />, <path key="clear" d="M5 7h14M10 11v6M14 11v6M8 7l1-3h6l1 3M7 7l1 14h8l1-14" />, <path key="lab" d="M7 17 17 7M9 7h8v8" />]; return <SvgIcon>{paths[variant] ?? paths[0]}</SvgIcon>; }
function SvgIcon({ children }: { children: ReactNode }) { return <svg aria-hidden="true" fill="none" focusable="false" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">{children}</svg>; }
function CheckIcon() { return <SvgIcon><path d="M5 12l4 4L19 6" /></SvgIcon>; }
function ChevronDownIcon() { return <SvgIcon><path d="m6 9 6 6 6-6" /></SvgIcon>; }
function UploadIcon() { return <SvgIcon><path d="M12 16V4M7 9l5-5 5 5M5 20h14" /></SvgIcon>; }
