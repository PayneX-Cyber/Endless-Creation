import type { CharacterGraph, GraphCharacter, GraphRelationship, Novel } from '../../types/novel';
export type { CharacterGraph, GraphCharacter, GraphRelationship } from '../../types/novel';

export type TextMessage = { role: 'system' | 'user'; content: string };

// 判别式联合：调用侧按 kind 三分支处理，绝不靠空对象猜语义。
export type ParsedCharacterGraph =
  | { kind: 'ok'; graph: CharacterGraph }
  | { kind: 'empty' }
  | { kind: 'invalid' };

const CODE_FENCE_PATTERN = /^```(?:json)?\s*([\s\S]*?)\s*```$/;

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(CODE_FENCE_PATTERN);
  return match ? match[1].trim() : trimmed;
}

function limitText(text: string, max: number): string {
  const chars = Array.from(text.trim());
  if (chars.length <= max) return chars.join('');
  const half = Math.floor(max / 2);
  return `${chars.slice(0, half).join('')}\n...\n${chars.slice(-half).join('')}`;
}

// 汇总用于推演的语料：蓝图 + 简介 + 创意 + 已完成章节正文（截断，控制 token）。
function collectStoryContext(novel: Novel): string {
  const doneChapters = [...novel.chapters]
    .sort((a, b) => a.order - b.order)
    .filter((chapter) => chapter.content.trim());
  const chapterBlocks = doneChapters.map((chapter, index) => {
    const title = chapter.title.trim() || `第 ${index + 1} 章`;
    return `【${title}】\n${chapter.content.trim()}`;
  });
  const joined = chapterBlocks.join('\n\n');
  return limitText(joined, 6000);
}

function collectCharacterEvidence(novel: Novel): string {
  return [
    novel.title,
    novel.summary,
    novel.blueprint,
    novel.idea,
    ...novel.chapters.map((chapter) => `${chapter.title}\n${chapter.outline ?? ''}\n${chapter.content}`),
  ].join('\n');
}

function countOccurrences(source: string, value: string): number {
  if (!value) return 0;
  let count = 0;
  let index = source.indexOf(value);
  while (index >= 0) {
    count += 1;
    index = source.indexOf(value, index + value.length);
  }
  return count;
}

function isGenericCharacterLabel(name: string): boolean {
  const genericLabels = [
    '帝君',
    '太子',
    '掌教',
    '少年',
    '少女',
    '汉子',
    '士兵',
    '侍卫',
    '长老',
    '掌门',
    '使者',
    '弟子',
    '门人',
    '族人',
    '众人',
    '人群',
    '修士',
    '道人',
    '剑客',
    '城主',
    '将军',
    '护卫',
  ];
  const genericHints = ['庭', '宫', '宗', '派', '门', '城', '府', '军', '族', '道'];
  if (genericLabels.some((label) => name === label || name.endsWith(label))) return true;
  return genericLabels.some((label) => name.includes(label)) && genericHints.some((hint) => name.includes(hint));
}

function isLikelyCharacterName(name: string): boolean {
  const chars = Array.from(name);
  if (chars.length < 2 || chars.length > 6) return false;
  if (/^[第其这那某一二三四五六七八九十百千万]+/.test(name)) return false;
  if (/[，。！？、；：“”‘’《》（）()\s]/.test(name)) return false;
  return !isGenericCharacterLabel(name);
}

export function buildCharacterGraphPrompt(novel: Novel): TextMessage[] {
  const story = collectStoryContext(novel);
  return [
    {
      role: 'system',
      content: '你是小说人物关系分析助手。任务是从提供的作品蓝图与正文里，梳理出主要人物以及他们之间的关系。只依据文本已有信息，不虚构未出现的人物或关系；只把原文明确反复出现的专名当作人物，不能把身份、头衔、组织成员、群体称呼当作人物。严格输出 JSON 对象，格式为 {"characters": [{"name": string, "role": string, "description": string}], "relationships": [{"from": string, "to": string, "label": string}]}。characters 最多 10 人，只保留有戏份的主要人物；name 必须是具体人物专名，role 是身份定位（如主角、反派、导师，可为空串），description 是一句话简述（可为空串）。relationships 的 from/to 必须是 characters 里出现过的 name，label 描述二者关系（如师徒、宿敌、恋人，可为空串）。只输出 JSON，不要加解释、不要加代码围栏、不要加标题。若无法梳理出人物，输出 {"characters": [], "relationships": []}。',
    },
    {
      role: 'user',
      content: [
        `小说标题：${novel.title}`,
        novel.summary ? `小说简介：${novel.summary}` : '',
        novel.blueprint ? `作品蓝图：\n${novel.blueprint}` : '',
        novel.idea ? `创意：${novel.idea}` : '',
        story ? `已完成正文：\n${story}` : '',
        '请梳理出主要人物与人物关系，按上述 JSON 对象格式输出。不要输出太子、掌教、少年、长老、掌门、城主、弟子、修士等头衔或泛称；如果没有足够确定的具体人物专名，输出空数组。',
      ].filter(Boolean).join('\n'),
    },
  ];
}

// 宽松解析：剥围栏 → JSON.parse → 逐项校验 → 关系端点必须能在人物集合里找到。
export function parseCharacterGraph(text: string, novel: Novel): ParsedCharacterGraph {
  const stripped = stripCodeFence(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    return { kind: 'invalid' };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { kind: 'invalid' };
  const record = parsed as Record<string, unknown>;
  if (!Array.isArray(record.characters)) return { kind: 'invalid' };

  const evidence = collectCharacterEvidence(novel);
  const characters: GraphCharacter[] = [];
  const nameSet = new Set<string>();
  for (const item of record.characters) {
    if (!item || typeof item !== 'object') continue;
    const entry = item as Record<string, unknown>;
    const name = typeof entry.name === 'string' ? entry.name.trim() : '';
    if (!name || nameSet.has(name)) continue;
    if (!isLikelyCharacterName(name)) continue;
    if (countOccurrences(evidence, name) < 2) continue;
    nameSet.add(name);
    const role = typeof entry.role === 'string' ? entry.role.trim() : '';
    const description = typeof entry.description === 'string' ? entry.description.trim() : '';
    characters.push({ name, role, description });
  }
  if (!characters.length) return { kind: 'empty' };
  const boundedCharacters = characters.slice(0, 10);
  const boundedNames = new Set(boundedCharacters.map((character) => character.name));

  const relationships: GraphRelationship[] = [];
  const seen = new Set<string>();
  const rawRelationships = Array.isArray(record.relationships) ? record.relationships : [];
  for (const item of rawRelationships) {
    if (!item || typeof item !== 'object') continue;
    const entry = item as Record<string, unknown>;
    const from = typeof entry.from === 'string' ? entry.from.trim() : '';
    const to = typeof entry.to === 'string' ? entry.to.trim() : '';
    // 端点必须落在人物集合内，且不自环；重复关系去重（无向）。
    if (!boundedNames.has(from) || !boundedNames.has(to) || from === to) continue;
    const key = [from, to].sort().join('::');
    if (seen.has(key)) continue;
    seen.add(key);
    const label = typeof entry.label === 'string' ? entry.label.trim() : '';
    relationships.push({ from, to, label });
  }

  return { kind: 'ok', graph: { characters: boundedCharacters, relationships } };
}
