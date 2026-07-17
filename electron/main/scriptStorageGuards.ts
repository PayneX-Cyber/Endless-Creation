export function normalizeScriptId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '.' || trimmed === '..') return null;
  return /^[a-zA-Z0-9._-]+$/.test(trimmed) ? trimmed : null;
}
