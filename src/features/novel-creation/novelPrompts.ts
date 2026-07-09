import type { Chapter, Foreshadowing, Novel } from '../../types/novel';

export type TextMessage = { role: 'system' | 'user'; content: string };
export type OptimizeType = 'dialogue' | 'environment' | 'psychology' | 'action';

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

export interface ParsedImportedChapter {
  title: string;
  content: string;
}

export interface ParsedManuscript {
  chapters: ParsedImportedChapter[];
  splitByHeaders: boolean;
}

export function parseImportedManuscript(text: string): ParsedManuscript {
  const lines = text.split(/\r?\n/);
  const chapters: { title: string; bodyLines: string[] }[] = [];
  const preambleLines: string[] = [];
  let current: { title: string; bodyLines: string[] } | null = null;
  for (const line of lines) {
    const headerMatch = line.match(OUTLINE_HEADER_PATTERN);
    if (headerMatch) {
      if (current) chapters.push(current);
      current = { title: cleanOutlineTitle(headerMatch[1]), bodyLines: [] };
      continue;
    }
    if (!current) {
      preambleLines.push(line);
      continue;
    }
    current.bodyLines.push(line);
  }
  if (current) chapters.push(current);

  if (!chapters.length) {
    const body = text.replace(/^\s+|\s+$/g, '');
    return { chapters: [{ title: '第 1 章', content: body }], splitByHeaders: false };
  }

  // 首个标题前的非空正文（序言/前言）收成开篇章节，不静默丢弃。
  const preamble = preambleLines.join('\n').replace(/^\s+|\s+$/g, '');
  const parsed: ParsedImportedChapter[] = [];
  if (preamble) parsed.push({ title: '开篇', content: preamble });
  chapters.forEach((chapter, index) => {
    parsed.push({
      title: chapter.title || `第 ${index + 1} 章`,
      content: chapter.bodyLines.join('\n').replace(/^\s+|\s+$/g, ''),
    });
  });
  return { chapters: parsed, splitByHeaders: true };
}

export function buildChapterReviewPrompt(novel: Novel, chapter: Chapter): TextMessage[] {
  return [
    {
      role: 'system',
      content: '你是小说评审助手，基于作品蓝图和章节大纲评估章节正文质量。输出评审意见，包含优点、问题和修改建议，直接输出评审内容，不加标题，不使用 Markdown 标记。',
    },
    {
      role: 'user',
      content: [
        `小说标题：${novel.title}`,
        novel.summary ? `小说简介：${novel.summary}` : '',
        novel.blueprint ? `作品蓝图：\n${novel.blueprint}` : '',
        `当前章节：${chapter.title || '未命名章节'}`,
        chapter.outline ? `本章大纲：\n${chapter.outline}` : '',
        '本章正文：',
        chapter.content,
        '请评审本章正文，指出优点、存在的问题（如偏离大纲、节奏拖沓、人物行为不合理等）以及修改建议。评审意见 200-400 字。',
      ].filter(Boolean).join('\n'),
    },
  ];
}

export function buildChapterConsistencyPrompt(novel: Novel, chapter: Chapter): TextMessage[] {
  const previousContext = buildPreviousChapterContext(novel, chapter);
  return [
    {
      role: 'system',
      content: '你是小说一致性检查助手。只检查疑似矛盾和定位建议，不改写正文。不要编造矛盾；如果没有明显问题，明确输出「未发现明显一致性问题」。',
    },
    {
      role: 'user',
      content: [
        `小说标题：${novel.title}`,
        novel.summary ? `小说简介：${novel.summary}` : '',
        novel.blueprint ? `作品蓝图：\n${novel.blueprint}` : '',
        novel.idea ? `创意：${novel.idea}` : '',
        '前文已完成章节摘录：',
        previousContext,
        `当前章节：${chapter.title || '未命名章节'}`,
        chapter.outline ? `本章大纲：\n${chapter.outline}` : '',
        '本章正文：',
        limitText(chapter.content, 5000),
        '请从四类维度做轻量一致性检查：1. 人物称呼、身份、关系漂移；2. 时间线、事件顺序冲突；3. 世界观、设定、规则矛盾；4. 本章是否明显违背蓝图或章节大纲。',
        '输出格式：总体判断、疑似矛盾、定位建议、修改建议。若未发现明显问题，请写「未发现明显一致性问题」，并给出 1-2 条保守提醒。',
      ].filter(Boolean).join('\n'),
    },
  ];
}

export function buildChapterRhythmPrompt(novel: Novel, chapter: Chapter): TextMessage[] {
  return [
    {
      role: 'system',
      content: '你是小说节奏检查助手。只指出节奏问题和调整建议，不改写正文，不输出新正文。',
    },
    {
      role: 'user',
      content: [
        `小说标题：${novel.title}`,
        novel.summary ? `小说简介：${novel.summary}` : '',
        novel.blueprint ? `作品蓝图：\n${novel.blueprint}` : '',
        novel.idea ? `创意：${novel.idea}` : '',
        `当前章节：${chapter.title || '未命名章节'}`,
        chapter.outline ? `本章大纲：\n${chapter.outline}` : '',
        '本章正文：',
        limitText(chapter.content, 5000),
        '请从四类维度做轻量节奏检查：1. 开头是否拖沓或进入冲突过慢；2. 中段是否重复、解释过多、缺少推进；3. 结尾是否缺少钩子或收束过急；4. 段落节奏、信息密度、情绪起伏是否失衡。',
        '输出格式：总体判断、节奏问题、定位建议、调整建议。不要改写正文，不要给出完整替换稿。',
      ].filter(Boolean).join('\n'),
    },
  ];
}

export function buildOptimizeSelectionPrompt(novel: Novel, chapter: Chapter, selectedText: string, type: OptimizeType): TextMessage[] {
  const typeInstruction: Record<OptimizeType, string> = {
    dialogue: '优化下面这段的对话：让人物语言更自然、更有个性、更符合身份与当前情绪，保留原有对话意图和信息，不新增剧情，不添加原文没有的台词。',
    environment: '优化下面这段的环境描写：增强画面感、氛围与感官细节，但不喧宾夺主、不拖慢节奏，保留原有情节推进。',
    psychology: '优化下面这段的心理描写：让人物内心活动更细腻、可信、贴合当前处境，不改变人物已有决定和剧情走向。',
    action: '优化下面这段的动作描写：增强动作清晰度、连贯性和画面感，让动作符合当前情绪与场景节奏，不改变剧情结果、人物关系和关键信息，不新增原文没有的大段动作。',
  };
  return [
    {
      role: 'system',
      content: '你是小说文本优化助手。只优化用户选中的片段，直接输出优化后的正文。不要解释，不要加标题，不要加引号，不要输出选中片段以外的内容。不改变剧情走向、人物关系和关键信息。输出长度应与原片段接近，不得大幅扩写或缩写。',
    },
    {
      role: 'user',
      content: [
        `小说标题：${novel.title}`,
        novel.summary ? `小说简介：${novel.summary}` : '',
        `当前章节：${chapter.title || '未命名章节'}`,
        typeInstruction[type],
        '选中片段：',
        selectedText,
      ].filter(Boolean).join('\n'),
    },
  ];
}

export interface ForeshadowingCandidate {
  title: string;
  note: string;
}

export interface ForeshadowingPayoffCandidate {
  foreshadowingId: string;
  note: string;
}

export type ParsedForeshadowingCandidates =
  | { kind: 'ok'; candidates: ForeshadowingCandidate[] }
  | { kind: 'empty' }
  | { kind: 'invalid' };

export type ParsedForeshadowingPayoffCandidates =
  | { kind: 'ok'; candidates: ForeshadowingPayoffCandidate[] }
  | { kind: 'empty' }
  | { kind: 'invalid' };

export function buildForeshadowingCandidatesPrompt(novel: Novel, chapter: Chapter): TextMessage[] {
  return [
    {
      role: 'system',
      content: '你是小说伏笔识别助手。职责是从当前章正文里找出作者可能想在后文回收的伏笔或线索（埋设的悬念、被强调的物件、未解释的反常、人物暗示等），只产「新埋」候选，不做回收判断，不匹配已有伏笔。严格输出 JSON 数组，最多 3 条，只挑最值得记的，宁缺毋滥。每条格式为 {"title": string, "note": string}：title 是伏笔简述（短句），note 说明为什么这可能是伏笔或后文可怎么回收（可为空串）。只输出 JSON，不要加解释、不要加代码围栏、不要加标题。若找不到，输出 []。',
    },
    {
      role: 'user',
      content: [
        `小说标题：${novel.title}`,
        novel.summary ? `小说简介：${novel.summary}` : '',
        novel.blueprint ? `作品蓝图：\n${novel.blueprint}` : '',
        novel.idea ? `创意：${novel.idea}` : '',
        `当前章节：${chapter.title || '未命名章节'}`,
        chapter.outline ? `本章大纲：\n${chapter.outline}` : '',
        '本章正文：',
        limitText(chapter.content, 5000),
        '请从本章正文里识别最多 3 条新埋伏笔候选，按上述 JSON 数组格式输出。',
      ].filter(Boolean).join('\n'),
    },
  ];
}

export function buildForeshadowingPayoffCandidatesPrompt(novel: Novel, chapter: Chapter, plantedForeshadowings: Foreshadowing[]): TextMessage[] {
  const chapterLabels = new Map(novel.chapters.map((item, index) => [item.id, `第 ${index + 1} 章 · ${item.title || '未命名章节'}`]));
  const plantedList = plantedForeshadowings.map((item) => [
    `id: ${item.id}`,
    `标题: ${item.title}`,
    `埋设章节: ${chapterLabels.get(item.plantedChapterId) ?? '未指定章节'}`,
    item.note ? `备注: ${limitText(item.note, 240)}` : '',
  ].filter(Boolean).join('\n')).join('\n\n');
  return [
    {
      role: 'system',
      content: '你是小说伏笔回收识别助手。职责是判断当前章正文是否回收了已记录的未回收伏笔。你只能从用户给出的未回收伏笔 id 中选择，不要创造新 id，不要提出新埋伏笔。严格输出 JSON 数组，最多 3 条，每条格式为 {"foreshadowingId": string, "note": string}：foreshadowingId 必须来自未回收伏笔列表，note 简短说明当前章哪里像是在回收它。只输出 JSON，不要加解释、不要加代码围栏、不要加标题。若找不到明显回收线索，输出 []。',
    },
    {
      role: 'user',
      content: [
        `小说标题：${novel.title}`,
        novel.summary ? `小说简介：${novel.summary}` : '',
        novel.blueprint ? `作品蓝图：\n${novel.blueprint}` : '',
        novel.idea ? `创意：${novel.idea}` : '',
        `当前章节：${chapter.title || '未命名章节'}`,
        chapter.outline ? `本章大纲：\n${chapter.outline}` : '',
        '未回收伏笔列表：',
        plantedList,
        '本章正文：',
        limitText(chapter.content, 5000),
        '请从未回收伏笔列表中识别最多 3 条可能已在本章回收的候选，按上述 JSON 数组格式输出。',
      ].filter(Boolean).join('\n'),
    },
  ];
}

const FORESHADOW_CODE_FENCE_PATTERN = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i;

function stripForeshadowCodeFence(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(FORESHADOW_CODE_FENCE_PATTERN);
  return match ? match[1].trim() : trimmed;
}

// 宽松解析 AI 伏笔候选输出：剥围栏 → JSON.parse → 逐条校验。返回判别式联合类型，
// 调用侧按 kind 三分支处理，绝不靠空数组猜语义（'empty' 与 'invalid' 语义不同）。
export function parseForeshadowingCandidates(text: string): ParsedForeshadowingCandidates {
  const stripped = stripForeshadowCodeFence(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    return { kind: 'invalid' };
  }
  if (!Array.isArray(parsed)) return { kind: 'invalid' };
  const candidates: ForeshadowingCandidate[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const title = typeof record.title === 'string' ? record.title.trim() : '';
    if (!title) continue;
    const note = typeof record.note === 'string' ? record.note.trim() : '';
    candidates.push({ title, note });
  }
  if (!candidates.length) return { kind: 'empty' };
  return { kind: 'ok', candidates: candidates.slice(0, 3) };
}

export function parseForeshadowingPayoffCandidates(text: string, validIds: readonly string[]): ParsedForeshadowingPayoffCandidates {
  const stripped = stripForeshadowCodeFence(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    return { kind: 'invalid' };
  }
  if (!Array.isArray(parsed)) return { kind: 'invalid' };
  const validIdSet = new Set(validIds);
  const seen = new Set<string>();
  const candidates: ForeshadowingPayoffCandidate[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const foreshadowingId = typeof record.foreshadowingId === 'string' ? record.foreshadowingId.trim() : '';
    if (!validIdSet.has(foreshadowingId) || seen.has(foreshadowingId)) continue;
    seen.add(foreshadowingId);
    const note = typeof record.note === 'string' ? record.note.trim() : '';
    candidates.push({ foreshadowingId, note });
  }
  if (!candidates.length) return { kind: 'empty' };
  return { kind: 'ok', candidates: candidates.slice(0, 3) };
}

function buildPreviousChapterContext(novel: Novel, currentChapter: Chapter): string {
  const blocks: string[] = [];
  let total = 0;
  for (const chapter of novel.chapters.filter((item) => item.order < currentChapter.order && item.content.trim()).sort((a, b) => b.order - a.order)) {
    const block = [
      `第 ${chapter.order + 1} 章 · ${chapter.title || '未命名章节'}`,
      chapter.outline ? `大纲：${limitText(chapter.outline, 160)}` : '',
      `正文尾部：\n${tailText(chapter.content, 400)}`,
    ].filter(Boolean).join('\n');
    if (total + block.length > 4000 && blocks.length) continue;
    blocks.push(block);
    total += block.length;
    if (total >= 4000) break;
  }
  return blocks.reverse().join('\n\n') || '无已完成前文。';
}

function tailText(text: string, max: number): string {
  const chars = Array.from(text.trim());
  return chars.length > max ? chars.slice(-max).join('') : chars.join('');
}

function limitText(text: string, max: number): string {
  const chars = Array.from(text.trim());
  if (chars.length <= max) return chars.join('');
  const half = Math.floor(max / 2);
  return `${chars.slice(0, half).join('')}\n……\n${chars.slice(-half).join('')}`;
}
