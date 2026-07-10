import type { SettingEntry, SettingType } from '../../types/novel';

export const SETTING_TYPE_ORDER: SettingType[] = ['character', 'location', 'organization', 'item', 'term', 'rule', 'other'];

export const SETTING_TYPE_LABEL: Record<SettingType, string> = {
  character: '角色',
  location: '地点',
  organization: '组织',
  item: '物品',
  term: '术语',
  rule: '规则',
  other: '其他',
};

export const SETTING_LABELS = {
  tabTitle: '设定',
  panelTitle: '设定资料',
  panelSub: '手动维护角色、地点、组织等结构化设定，随小说存档，写作时可在工作台侧栏查阅。',
  add: '新增设定',
  edit: '编辑',
  delete: '删除',
  save: '保存设定',
  cancel: '取消',
  emptyTitle: '还没有设定条目',
  emptyHint: '点「新增设定」，把角色、地点、术语等固定信息记下来。',
  titleField: '名称',
  typeField: '类型',
  bodyField: '内容',
  titlePlaceholder: '例如：林清欢 / 归墟城 / 引灵诀',
  bodyPlaceholder: '身份、外貌、设定要点、规则细节……',
  titleRequired: '请填写设定名称。',
  sidebarTitle: '设定速查',
  sidebarEmpty: '暂无设定，可在项目「设定」页添加。',
  deleteConfirm: (title: string) => `确定删除设定「${title}」吗？删除后不可恢复。`,
};

export interface SettingDraft {
  type: SettingType;
  title: string;
  body: string;
}

export const emptySettingDraft: SettingDraft = { type: 'character', title: '', body: '' };

export interface SettingGroup {
  type: SettingType;
  label: string;
  entries: SettingEntry[];
}

// 按固定类型顺序分组，只保留非空组。组内维持原数组顺序（新增追加在尾）。
export function groupSettingsByType(settings: SettingEntry[]): SettingGroup[] {
  return SETTING_TYPE_ORDER
    .map((type) => ({
      type,
      label: SETTING_TYPE_LABEL[type],
      entries: settings.filter((entry) => entry.type === type),
    }))
    .filter((group) => group.entries.length > 0);
}
