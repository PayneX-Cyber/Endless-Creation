import { useEffect, useMemo, useRef, useState } from 'react';
import { projectAssetService } from '../../services/projectAssetService';
import type { ImageAsset, ProjectAsset, ProjectAssetBase, TextAsset } from '../../types/projectAssets';
import './AssetManagement.css';

const emptyForm: AssetForm = { title: '', content: '', tags: '', note: '', source: 'manual' };
const sourceOptions: Array<NonNullable<ProjectAssetBase['source']>> = ['manual', 'image-workbench', 'canvas', 'prompt-library'];

type AssetForm = { title: string; content: string; tags: string; note: string; source: NonNullable<ProjectAssetBase['source']> };

export function AssetManagement({ projectId }: { projectId: string }) {
  const [assets, setAssets] = useState<ProjectAsset[]>([]);
  const [query, setQuery] = useState('');
  const [form, setForm] = useState<AssetForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [previewMap, setPreviewMap] = useState<Record<string, string>>({});
  const [previewAsset, setPreviewAsset] = useState<ImageAsset | null>(null);
  const [feedback, setFeedback] = useState('');
  const [isLoading, setLoading] = useState(true);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  const editingAsset = useMemo(() => assets.find((asset) => asset.id === editingId) ?? null, [assets, editingId]);
  const textAssets = useMemo(() => assets.filter((asset): asset is TextAsset => asset.kind === 'text'), [assets]);

  useEffect(() => {
    setQuery('');
    setForm(emptyForm);
    setEditingId(null);
    setPreviewMap({});
    setPreviewAsset(null);
    setFeedback('');
  }, [projectId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const request = query.trim() ? projectAssetService.searchAssets(projectId, query) : projectAssetService.listAssets(projectId);
    void request.then((items) => { if (active) setAssets(items); }).catch((error) => { if (active) setFeedback(error instanceof Error ? error.message : '\u52a0\u8f7d\u8d44\u4ea7\u5931\u8d25\u3002'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [query, projectId]);

  useEffect(() => {
    const targets = assets.filter((asset): asset is ImageAsset => asset.kind === 'image' && asset.status !== 'missing' && !previewMap[asset.id]);
    if (!targets.length) return;
    let active = true;
    void Promise.all(targets.map(async (asset) => {
      try {
        return [asset.id, await projectAssetService.readImageAssetDataUrl(projectId, asset)] as const;
      } catch {
        await projectAssetService.updateAsset(projectId, asset.id, { status: 'missing' });
        return [asset.id, null] as const;
      }
    })).then((entries) => {
      if (!active) return;
      const nextPreview = Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => Boolean(entry[1])));
      if (Object.keys(nextPreview).length) setPreviewMap((current) => ({ ...current, ...nextPreview }));
      const missingIds = new Set(entries.filter(([, dataUrl]) => !dataUrl).map(([id]) => id));
      if (missingIds.size) setAssets((current) => current.map((asset) => missingIds.has(asset.id) ? { ...asset, status: 'missing' } : asset));
    });
    return () => { active = false; };
  }, [assets, previewMap]);

  async function reload() {
    const items = query.trim() ? await projectAssetService.searchAssets(projectId, query) : await projectAssetService.listAssets(projectId);
    setAssets(items);
  }

  async function saveAsset() {
    if (!form.title.trim() && !form.content.trim()) { setFeedback('\u8bf7\u586b\u5199\u6807\u9898\u6216\u5185\u5bb9\u3002'); return; }
    if (editingAsset) {
      const patch = { title: form.title, tags: parseTags(form.tags), note: form.note, source: form.source, data: editingAsset.kind === 'text' ? { content: form.content } : undefined };
      await projectAssetService.updateAsset(projectId, editingAsset.id, patch);
      setFeedback(editingAsset.kind === 'image' ? '\u56fe\u7247\u8d44\u4ea7\u5df2\u66f4\u65b0\u3002' : '\u6587\u672c\u8d44\u4ea7\u5df2\u66f4\u65b0\u3002');
    } else {
      await projectAssetService.createTextAsset(projectId, { title: form.title, content: form.content, tags: parseTags(form.tags), note: form.note, source: form.source });
      setFeedback('\u6587\u672c\u8d44\u4ea7\u5df2\u65b0\u589e\u3002');
    }
    setForm(emptyForm);
    setEditingId(null);
    await reload();
  }

  async function importImage(file: File | undefined) {
    if (!file) return;
    try {
      await projectAssetService.importImageAsset(projectId, file);
      setFeedback('\u56fe\u7247\u8d44\u4ea7\u5df2\u5bfc\u5165\u3002');
      await reload();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : '\u56fe\u7247\u8d44\u4ea7\u5bfc\u5165\u5931\u8d25\u3002');
    }
  }

  function editAsset(asset: ProjectAsset) {
    setEditingId(asset.id);
    setForm({ title: asset.title, content: asset.kind === 'text' ? asset.data.content : '', tags: asset.tags.join(', '), note: asset.note ?? '', source: asset.source ?? 'manual' });
  }

  async function deleteAsset(asset: ProjectAsset) {
    await projectAssetService.deleteAsset(projectId, asset.id);
    setPreviewMap((current) => { const next = { ...current }; delete next[asset.id]; return next; });
    setFeedback('\u8d44\u4ea7\u5df2\u5220\u9664\u3002');
    if (editingId === asset.id) { setEditingId(null); setForm(emptyForm); }
    await reload();
  }

  return (
    <main className="asset-management" aria-label={'\u8d44\u4ea7\u7ba1\u7406'}>
      <section className="asset-management__header">
        <div><p>Assets v1</p><h1>{'\u8d44\u4ea7\u7ba1\u7406'}</h1><span>{'\u5f53\u524d\u672c\u5730\u9879\u76ee\u5185\u7684\u6587\u672c\u4e0e\u56fe\u7247\u8d44\u4ea7\u3002'}</span></div>
        <div className="asset-management__header-actions"><input ref={imageInputRef} accept="image/png,image/jpeg,image/webp" className="asset-management__file-input" onChange={(event) => { void importImage(event.currentTarget.files?.[0]); event.currentTarget.value = ''; }} type="file" /><button onClick={() => imageInputRef.current?.click()} type="button">{'\u5bfc\u5165\u56fe\u7247'}</button></div>
      </section>

      <section className="asset-management__panel asset-management__form" aria-label={'\u65b0\u589e\u6587\u672c\u8d44\u4ea7'}>
        <div className="asset-management__panel-head"><h2>{editingAsset ? `\u7f16\u8f91${editingAsset.kind === 'image' ? '\u56fe\u7247' : '\u6587\u672c'}\u8d44\u4ea7` : '\u65b0\u589e\u6587\u672c\u8d44\u4ea7'}</h2><span>{textAssets.length} {'\u6761\u6587\u672c'} {'\u00b7'} {assets.length - textAssets.length} {'\u5f20\u56fe\u7247'}</span></div>
        <div className="asset-management__form-grid"><label><span>{'\u6807\u9898'}</span><input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder={'\u4f8b\u5982\uff1a\u89d2\u8272\u8bbe\u5b9a'} /></label><label><span>{'\u6807\u7b7e'}</span><input value={form.tags} onChange={(event) => setForm((current) => ({ ...current, tags: event.target.value }))} placeholder={'\u7528\u9017\u53f7\u5206\u9694'} /></label></div>
        {!editingAsset || editingAsset.kind === 'text' ? <label><span>{'\u5185\u5bb9'}</span><textarea value={form.content} onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))} placeholder={'\u8f93\u5165\u53ef\u590d\u7528\u7684\u6587\u672c\u3001\u8bbe\u5b9a\u6216\u63d0\u793a\u8bcd\u2026'} /></label> : null}
        <div className="asset-management__form-grid"><label><span>{'\u5907\u6ce8'}</span><input value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} placeholder={'\u53ef\u9009'} /></label><label><span>{'\u6765\u6e90'}</span><select value={form.source} onChange={(event) => setForm((current) => ({ ...current, source: event.target.value as AssetForm['source'] }))}>{sourceOptions.map((source) => <option key={source} value={source}>{sourceLabel(source)}</option>)}</select></label></div>
        <div className="asset-management__form-actions"><button onClick={() => void saveAsset()} type="button">{editingAsset ? '\u4fdd\u5b58\u66f4\u65b0' : '\u65b0\u589e\u6587\u672c'}</button>{editingAsset && <button onClick={() => { setEditingId(null); setForm(emptyForm); }} type="button">{'\u53d6\u6d88\u7f16\u8f91'}</button>}</div>
      </section>

      <section className="asset-management__toolbar" aria-label={'\u641c\u7d22\u8d44\u4ea7'}><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={'\u641c\u7d22\u6807\u9898\u3001\u6807\u7b7e\u3001\u5185\u5bb9\u3001\u6587\u4ef6\u540d\u6216\u6765\u6e90\u2026'} type="search" /></section>
      {feedback && <div className="asset-management__feedback" aria-live="polite">{feedback}</div>}
      <section className="asset-management__panel" aria-label={'\u8d44\u4ea7\u5217\u8868'}>{isLoading ? <div className="asset-management__empty">{'\u6b63\u5728\u52a0\u8f7d\u8d44\u4ea7\u2026'}</div> : assets.length === 0 ? <div className="asset-management__empty"><strong>{'\u6682\u65e0\u8d44\u4ea7'}</strong><span>{'\u65b0\u589e\u6587\u672c\u6216\u5bfc\u5165\u56fe\u7247\u540e\uff0c\u8d44\u4ea7\u4f1a\u663e\u793a\u5728\u8fd9\u91cc\u3002'}</span></div> : <div className="asset-management__list">{assets.map((asset) => <AssetCard asset={asset} key={asset.id} previewUrl={asset.kind === 'image' ? previewMap[asset.id] : ''} onDelete={deleteAsset} onEdit={editAsset} onPreview={(image) => setPreviewAsset(image)} />)}</div>}</section>
      {previewAsset && <ImagePreviewModal asset={previewAsset} imageUrl={previewMap[previewAsset.id]} onClose={() => setPreviewAsset(null)} />}
    </main>
  );
}

function AssetCard({ asset, onDelete, onEdit, onPreview, previewUrl }: { asset: ProjectAsset; previewUrl: string; onDelete: (asset: ProjectAsset) => void; onEdit: (asset: ProjectAsset) => void; onPreview: (asset: ImageAsset) => void }) {
  const missing = asset.kind === 'image' && asset.status === 'missing';
  return <article className={`asset-card ${asset.kind === 'image' ? 'asset-card--image' : ''}`}><div className="asset-card__preview">{asset.kind === 'image' ? previewUrl ? <img src={previewUrl} alt={asset.title} /> : <span>{missing ? '\u4e22\u5931' : '\u56fe\u7247'}</span> : <span>{'\u6587\u672c'}</span>}</div><div className="asset-card__main"><span className={`asset-card__kind asset-card__kind--${asset.kind}`}>{asset.kind === 'text' ? '\u6587\u672c' : '\u56fe\u7247'}</span><h3>{asset.title}</h3>{asset.kind === 'text' ? <p>{asset.data.content}</p> : <p>{missing ? '\u8d44\u4ea7\u6587\u4ef6\u4e22\u5931\uff0c\u65e0\u6cd5\u4f7f\u7528' : asset.data.fileName}</p>}<div className="asset-card__meta">{asset.tags.map((tag) => <span key={tag}>{tag}</span>)}<span>{sourceLabel(asset.source ?? 'manual')}</span>{asset.status === 'missing' && <span>missing</span>}{asset.note && <span>{asset.note}</span>}</div></div><div className="asset-card__actions">{asset.kind === 'image' && <button disabled={!previewUrl} onClick={() => onPreview(asset)} type="button">{'\u9884\u89c8'}</button>}<button onClick={() => onEdit(asset)} type="button">{'\u7f16\u8f91'}</button><button onClick={() => void onDelete(asset)} type="button">{'\u5220\u9664'}</button></div></article>;
}

function ImagePreviewModal({ asset, imageUrl, onClose }: { asset: ImageAsset; imageUrl: string; onClose: () => void }) {
  return <div className="asset-preview-modal" role="dialog" aria-modal="true" aria-label={'\u9884\u89c8\u56fe\u7247\u8d44\u4ea7'} onClick={onClose}><div onClick={(event) => event.stopPropagation()}><button aria-label={'\u5173\u95ed\u9884\u89c8'} onClick={onClose} type="button">{'\u5173\u95ed'}</button>{imageUrl ? <img src={imageUrl} alt={asset.title} /> : <div className="asset-management__empty">{'\u8d44\u4ea7\u6587\u4ef6\u4e22\u5931\uff0c\u65e0\u6cd5\u4f7f\u7528'}</div>}<strong>{asset.title}</strong><span>{asset.data.fileName}</span></div></div>;
}

function parseTags(value: string): string[] {
  return Array.from(new Set(value.split(/[,\uFF0C\s]+/).map((tag) => tag.trim()).filter(Boolean))).slice(0, 12);
}
function sourceLabel(source: NonNullable<ProjectAssetBase['source']>) { return ({ manual: '\u624b\u52a8', 'image-workbench': '\u751f\u56fe\u5de5\u4f5c\u53f0', canvas: '\u753b\u5e03', 'prompt-library': '\u63d0\u793a\u8bcd\u5e93' } satisfies Record<NonNullable<ProjectAssetBase['source']>, string>)[source]; }
