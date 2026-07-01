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
