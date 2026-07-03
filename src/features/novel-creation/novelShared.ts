export type SaveStatus = 'saved' | 'dirty' | 'saving' | 'failed';

export function countWords(text: string): number {
  return Array.from(text.replace(/\s+/g, '')).length;
}

export function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '未更新' : date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function saveStatusLabel(status: SaveStatus): string {
  if (status === 'dirty') return '未保存';
  if (status === 'saving') return '保存中';
  if (status === 'failed') return '保存失败';
  return '已保存';
}
