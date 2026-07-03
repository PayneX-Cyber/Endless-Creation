import type { Chapter, Novel } from '../../types/novel';

export type TextMessage = { role: 'system' | 'user'; content: string };

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

export function buildChapterFromOutlinePrompt(novel: Novel, chapter: Chapter, previousChapter?: Chapter): TextMessage[] {
  const tail = chapter.content.slice(-800);
  const previousTail = previousChapter?.content.trim() ? previousChapter.content.trim().slice(-600) : '';
  return [
    { role: 'system', content: '你是小说写作助手，按本章大纲写正文，直接输出正文，不解释，不加标题。' },
    {
      role: 'user',
      content: [
        `小说标题：${novel.title}`,
        novel.summary ? `小说简介：${novel.summary}` : '',
        novel.blueprint ? `作品蓝图：${novel.blueprint}` : '',
        previousTail ? `上一章《${previousChapter?.title || '未命名章节'}》结尾：\n${previousTail}` : '',
        `当前章节：${chapter.title || '未命名章节'}`,
        '本章大纲：',
        chapter.outline || '',
        tail ? `已写正文末尾：\n${tail}` : '',
        tail ? '请衔接已写内容，按本章大纲继续写正文。' : previousTail ? '请自然衔接上一章结尾，按本章大纲写出本章正文。' : '请按本章大纲写出本章正文。',
      ].filter(Boolean).join('\n'),
    },
  ];
}

export function buildMissingOutlinePrompt(novel: Novel, chapters: Chapter[]): TextMessage[] {
  const chapterLines = chapters.map((chapter, index) => {
    const status = chapter.content.trim() ? '已完成' : '未开始';
    const outline = chapter.outline?.trim() ? `大纲：${chapter.outline.trim()}` : '大纲：缺失';
    return `第${index + 1}章 ${chapter.title || '未命名章节'}（${status}）\n${outline}`;
  });
  const missingLines = chapters
    .map((chapter, index) => ({ chapter, index }))
    .filter(({ chapter }) => !chapter.outline?.trim())
    .map(({ chapter, index }) => `第${index + 1}章 ${chapter.title || '未命名章节'}`);
  return [
    { role: 'system', content: '你是小说大纲助手，只按用户要求的固定格式输出章节大纲，不解释，不加开场白或总结。' },
    {
      role: 'user',
      content: [
        `小说标题：${novel.title}`,
        novel.summary ? `小说简介：${novel.summary}` : '',
        novel.idea ? `创意：${novel.idea}` : '',
        novel.blueprint ? `作品蓝图：${novel.blueprint}` : '',
        '全书章节现状如下：',
        chapterLines.join('\n\n'),
        '请只为下面这些缺少大纲的章节补写大纲，剧情需与前后章节自然衔接：',
        missingLines.join('\n'),
        '严格按以下格式输出，每章两行，章与章之间空一行，章号和章节标题保持不变：',
        '第1章 章节标题',
        '大纲：本章剧情要点，80 字以内。',
        '除这些章节外不要输出任何其他内容。',
      ].filter(Boolean).join('\n'),
    },
  ];
}

export interface ParsedOutlineChapter {
  title: string;
  outline: string;
}

export type InspirationChatMessage = { role: 'ai' | 'user'; text: string };

export const INSPIRATION_OPENING_MESSAGE = '灵感像猫，总在不经意间跳上你的书桌。别慌，我手里正好有根故事逗猫棒。告诉我，它这次给你留下了什么？一个画面，一句对白，还是一种挥之不去的感觉？';

function formatInspirationTranscript(history: InspirationChatMessage[]): string {
  return history.map((message) => `${message.role === 'ai' ? '文思' : '用户'}：${message.text}`).join('\n');
}

export function buildInspirationChatPrompt(history: InspirationChatMessage[]): TextMessage[] {
  const userTurns = history.filter((message) => message.role === 'user').length;
  const stageHint = userTurns >= 4
    ? '灵感信息已经比较充分，请先简短回应用户，再在结尾主动建议用户点击「生成蓝图」进入下一步。'
    : '请先简短回应用户的想法，再围绕故事类型、主角、核心冲突、基调、结局方向中尚未明确的部分，提出一个具体的问题引导用户补充。';
  return [
    { role: 'system', content: '你是小说灵感助手「文思」，语气亲切自然、带一点文学气息。每次回复 80-160 字，只输出对话内容本身，不用列表，不用 Markdown，不加引号和角色前缀。' },
    {
      role: 'user',
      content: [
        '以下是你（文思）和用户到目前为止的对话记录：',
        formatInspirationTranscript(history),
        `这是用户的第 ${userTurns} 轮输入。${stageHint}`,
        '请以文思的身份直接输出给用户的回复。',
      ].join('\n'),
    },
  ];
}

export function buildBlueprintFromConversationPrompt(history: InspirationChatMessage[]): TextMessage[] {
  return [
    { role: 'system', content: '你是小说策划助手，根据灵感对话输出作品蓝图。直接输出蓝图内容，不解释，不加标题，不使用 Markdown 标记。' },
    {
      role: 'user',
      content: [
        '以下是用户与灵感助手「文思」的对话记录：',
        formatInspirationTranscript(history),
        '请基于对话中的灵感写一段作品蓝图，依次覆盖：题材与基调、核心冲突、主要角色（2-4 人，含姓名与动机）、世界观要点、整体故事走向。对话中用户明确表达的设定必须保留。',
        '用连贯的中文段落书写，总长度 300-500 字。',
      ].join('\n'),
    },
  ];
}

const OUTLINE_HEADER_PATTERN =/^[\s#*>-]*(?:第\s*[0-9０-９一二两三四五六七八九十百千零〇]+\s*[章回节]|(?:Chapter|chapter)\s*\d+|\d+\s*[.、．])\s*(.*)$/;

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
