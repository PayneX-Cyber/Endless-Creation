export function createWebScriptFallback<T>(
  createScript: () => T,
  readScripts: () => T[],
  writeScripts: (scripts: T[]) => void,
): { ok: boolean; message: string; script?: T } {
  try {
    const script = createScript();
    writeScripts([script, ...readScripts()]);
    return { ok: true, message: 'web fallback', script };
  } catch {
    return { ok: false, message: '新建剧本失败。' };
  }
}
