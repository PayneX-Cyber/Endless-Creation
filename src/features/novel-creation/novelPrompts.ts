import type { Chapter, Novel } from '../../types/novel';

type TextMessage = { role: 'system' | 'user'; content: string };

export function buildContinueChapterPrompt(novel: Novel, chapter: Chapter): TextMessage[] {
  const tail = chapter.content.slice(-1500);
  return [
    { role: 'system', content: '你是小说续写助手，保持原文风格，直接输出正文，不解释。' },
    {
      role: 'user',
      content: [
        `小说标题：${novel.title}`,
        novel.summary ? `小说简介：${novel.summary}` : '',
        `当前章节：${chapter.title || '未命名章节'}`,
        '当前章节末尾：',
        tail || '本章还没有正文，请根据章节标题续写一段开头。',
        '请续写一段正文。',
      ].filter(Boolean).join('\n'),
    },
  ];
}

export function buildPolishChapterPrompt(novel: Novel, chapter: Chapter, text: string): TextMessage[] {
  return buildEditPrompt(novel, chapter, text, '润色下面正文：保持原意，优化表达、节奏和错别字，直接输出润色后的正文，不解释，不加标题。');
}

export function buildRewriteChapterPrompt(novel: Novel, chapter: Chapter, text: string): TextMessage[] {
  return buildEditPrompt(novel, chapter, text, '改写下面正文：保持剧情信息，换一种更流畅、更有张力的写法，直接输出改写后的正文，不解释，不加标题。');
}

function buildEditPrompt(novel: Novel, chapter: Chapter, text: string, instruction: string): TextMessage[] {
  return [
    { role: 'system', content: '你是小说文本编辑助手，只输出可直接使用的正文，不解释，不加标题。' },
    {
      role: 'user',
      content: [
        `小说标题：${novel.title}`,
        novel.summary ? `小说简介：${novel.summary}` : '',
        `当前章节：${chapter.title || '未命名章节'}`,
        instruction,
        text,
      ].filter(Boolean).join('\n'),
    },
  ];
}

export function buildBlueprintPrompt(idea: string): TextMessage[] {
  return [
    { role: 'system', content: '你是小说策划助手，根据创意输出作品蓝图。直接输出蓝图内容，不解释，不加标题，不使用 Markdown 标记。' },
    {
      role: 'user',
      content: [
        `创意：${idea}`,
        '请基于这句创意写一段作品蓝图，依次覆盖：题材与基调、核心冲突、主要角色（2-4 人，含姓名与动机）、世界观要点、整体故事走向。',
        '用连贯的中文段落书写，总长度 300-500 字。',
      ].join('\n'),
    },
  ];
}

export function buildOutlinePrompt(novel: Novel): TextMessage[] {
  return [
    { role: 'system', content: '你是小说大纲助手，只按用户要求的固定格式输出章节大纲，不解释，不加开场白或总结。' },
    {
      role: 'user',
      content: [
        `小说标题：${novel.title}`,
        novel.summary ? `小说简介：${novel.summary}` : '',
        '作品蓝图：',
        novel.blueprint || '',
        '请基于作品蓝图生成全书章节大纲，共 8-16 章，剧情完整、前后连贯。',
        '严格按以下格式输出，每章两行，章与章之间空一行：',
        '第1章 章节标题',
        '大纲：本章剧情要点，80 字以内。',
        '除章节列表外不要输出任何其他内容。',
      ].filter(Boolean).join('\n'),
    },
  ];
}

export function buildChapterFromOutlinePrompt(novel: Novel, chapter: Chapter): TextMessage[] {
  const tail = chapter.content.slice(-800);
  return [
    { role: 'system', content: '你是小说写作助手，按本章大纲写正文，直接输出正文，不解释，不加标题。' },
    {
      role: 'user',
      content: [
        `小说标题：${novel.title}`,
        novel.summary ? `小说简介：${novel.summary}` : '',
        novel.blueprint ? `作品蓝图：${novel.blueprint}` : '',
        `当前章节：${chapter.title || '未命名章节'}`,
        '本章大纲：',
        chapter.outline || '',
        tail ? `已写正文末尾：\n${tail}` : '',
        tail ? '请衔接已写内容，按本章大纲继续写正文。' : '请按本章大纲写出本章正文。',
      ].filter(Boolean).join('\n'),
    },
  ];
}

export interface ParsedOutlineChapter {
  title: string;
  outline: string;
}

const OUTLINE_HEADER_PATTERN = /^[\s#*>-]*(?:第\s*[0-9０-９一二两三四五六七八九十百千零〇]+\s*[章回节]|(?:Chapter|chapter)\s*\d+|\d+\s*[.、．])\s*(.*)$/;

export function parseOutlineText(text: string): ParsedOutlineChapter[] {
  const chapters: ParsedOutlineChapter[] = [];
  let current: { title: string; outlineLines: string[] } | null = null;
  for (const line of text.split(/\r?\n/)) {
    const headerMatch = line.match(OUTLINE_HEADER_PATTERN);
    if (headerMatch) {
      if (current) chapters.push(finishOutlineChapter(current));
      current = { title: cleanOutlineTitle(headerMatch[1]), outlineLines: [] };
      continue;
    }
    if (!current) continue;
    const trimmed = line.trim();
    if (!trimmed) continue;
    current.outlineLines.push(trimmed.replace(/^(?:大纲|梗概|概要|内容)\s*[:：]\s*/, ''));
  }
  if (current) chapters.push(finishOutlineChapter(current));
  return chapters;
}

function finishOutlineChapter(chapter: { title: string; outlineLines: string[] }): ParsedOutlineChapter {
  return { title: chapter.title || '未命名章节', outline: chapter.outlineLines.join('\n') };
}

function cleanOutlineTitle(raw: string): string {
  return raw.replace(/[*#]+/g, '').replace(/^[\s:：、.．\-—·]+/, '').trim();
}
