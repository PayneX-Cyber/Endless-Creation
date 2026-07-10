import { rendererBridge } from '../../services/rendererBridge';
import { assertStoreZipSelfCheck, createStoreZip, textToBytes, type StoreZipEntry } from '../../services/storeZip';
import type { Novel } from '../../types/novel';

export async function copyWholeBookMarkdown(novel: Novel): Promise<void> {
  const markdown = buildWholeBookMarkdown(novel);
  if (!markdown) {
    window.alert('暂无可复制的正文');
    return;
  }
  try {
    await rendererBridge.copyText(markdown);
    window.alert('全书 Markdown 已复制');
  } catch {
    window.alert('复制失败，请手动复制');
  }
}

export async function exportWholeBookMarkdownFile(novel: Novel): Promise<void> {
  const markdown = buildWholeBookMarkdown(novel);
  if (!markdown) {
    window.alert('暂无可导出的正文');
    return;
  }
  const defaultName = `${novel.title.trim() || '未命名小说'}.md`;
  try {
    const result = await rendererBridge.saveTextFile(defaultName, markdown);
    if (result.ok) window.alert('全书 Markdown 已导出');
    else window.alert(result.message || '已取消导出');
  } catch {
    window.alert('导出失败，请重试');
  }
}

export async function exportStoryboardDocFile(novel: Novel): Promise<void> {
  const html = buildStoryboardDocHtml(novel);
  if (!html) {
    window.alert('暂无可导出的内容');
    return;
  }
  const defaultName = `${novel.title.trim() || '未命名小说'}.doc`;
  try {
    const result = await rendererBridge.saveTextFile(defaultName, html, 'doc');
    if (result.ok) window.alert('Word 分镜本已导出');
    else window.alert(result.message || '已取消导出');
  } catch {
    window.alert('导出失败，请重试');
  }
}

export async function exportOfflinePackage(novel: Novel): Promise<void> {
  const defaultName = `${novel.title.trim() || '未命名小说'}.zip`;
  try {
    assertStoreZipSelfCheck();
    const zip = createStoreZip(buildOfflinePackageFiles(novel));
    const result = await rendererBridge.saveBinaryFile(defaultName, zip, 'zip');
    if (result.ok) window.alert('离线包已导出');
    else window.alert(result.message || '已取消导出');
  } catch {
    window.alert('导出失败，请重试');
  }
}

function escapeDocHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function docParagraphs(text: string): string {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${escapeDocHtml(line)}</p>`)
    .join('');
}

function buildOfflinePackageFiles(novel: Novel): StoreZipEntry[] {
  const title = novel.title.trim() || '未命名小说';
  const indexHtml = buildStoryboardDocHtml(novel)
    ?? `<!DOCTYPE html><html><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"><title>${escapeDocHtml(title)}</title></head><body><h1>${escapeDocHtml(title)}</h1><p>暂无正文内容。</p></body></html>`;
  const markdown = buildWholeBookMarkdown(novel) ?? `# ${title}\n\n暂无正文内容。`;
  const readme = [
    `${title} · 离线包`,
    '',
    '包含文件：',
    '- index.html：双击可在浏览器中阅读全书',
    '- novel.md：Markdown 全书正文',
    '- novel.json：原始项目数据（可重新导入）',
    '',
    '资源说明：',
    '当前小说未绑定图片/音频资源，离线包仅含文本内容。',
  ].join('\n');
  return [
    { name: 'index.html', data: textToBytes(indexHtml) },
    { name: 'novel.md', data: textToBytes(markdown) },
    { name: 'novel.json', data: textToBytes(JSON.stringify(novel, null, 2)) },
    { name: 'README.txt', data: textToBytes(readme) },
  ];
}

function buildStoryboardDocHtml(novel: Novel): string | null {
  const title = novel.title.trim() || '未命名小说';
  const chapters = novel.chapters.slice().sort((a, b) => a.order - b.order);
  const chapterTitleById = new Map(chapters.map((chapter) => [chapter.id, chapter.title.trim() || '未命名章节']));
  const filledChapters = chapters.filter((chapter) => chapter.content.trim() || chapter.outline?.trim());
  const hasOverview = Boolean(novel.summary.trim() || novel.idea?.trim() || novel.blueprint?.trim());
  if (!filledChapters.length && !hasOverview && !novel.foreshadowings.length) return null;

  const sections: string[] = [`<h1>${escapeDocHtml(title)}</h1>`];

  const overview: string[] = [];
  if (novel.summary.trim()) overview.push(`<h3>概要</h3>${docParagraphs(novel.summary)}`);
  if (novel.idea?.trim()) overview.push(`<h3>创意</h3>${docParagraphs(novel.idea)}`);
  if (novel.blueprint?.trim()) overview.push(`<h3>蓝图</h3>${docParagraphs(novel.blueprint)}`);
  if (overview.length) sections.push(overview.join(''));

  for (const chapter of filledChapters) {
    sections.push(`<h2>第 ${chapter.order + 1} 章 · ${escapeDocHtml(chapter.title.trim() || '未命名章节')}</h2>`);
    if (chapter.outline?.trim()) sections.push(`<h4>大纲</h4>${docParagraphs(chapter.outline)}`);
    if (chapter.content.trim()) sections.push(docParagraphs(chapter.content));
  }

  if (novel.foreshadowings.length) {
    const rows = novel.foreshadowings
      .map((item) => {
        const statusText = item.status === 'paidOff' ? '已回收' : '埋设中';
        const planted = item.plantedChapterId ? (chapterTitleById.get(item.plantedChapterId) ?? '（未知章节）') : '（未指定）';
        const payoff = item.payoffChapterId ? (chapterTitleById.get(item.payoffChapterId) ?? '（未知章节）') : '—';
        return `<tr><td>${escapeDocHtml(item.title)}</td><td>${statusText}</td><td>${escapeDocHtml(planted)}</td><td>${escapeDocHtml(payoff)}</td><td>${escapeDocHtml(item.note?.trim() || '')}</td></tr>`;
      })
      .join('');
    sections.push(
      `<h2>伏笔清单</h2><table border="1" cellspacing="0" cellpadding="6"><thead><tr><th>简述</th><th>状态</th><th>埋设章节</th><th>回收章节</th><th>备注</th></tr></thead><tbody>${rows}</tbody></table>`,
    );
  }

  return `<!DOCTYPE html><html><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"><title>${escapeDocHtml(title)}</title></head><body>${sections.join('')}</body></html>`;
}

function buildWholeBookMarkdown(novel: Novel): string | null {
  const chapters = novel.chapters.filter((chapter) => chapter.content.trim()).sort((a, b) => a.order - b.order);
  if (!chapters.length) return null;
  const parts = [`# ${novel.title.trim() || '未命名小说'}`];
  if (novel.summary.trim()) parts.push(novel.summary.trim());
  for (const chapter of chapters) {
    parts.push(`## 第 ${chapter.order + 1} 章 · ${chapter.title.trim() || '未命名章节'}`, chapter.content.trim());
  }
  return parts.join('\n\n');
}
