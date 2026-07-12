import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export function cacheKey(context) {
  return createHash('sha256').update(JSON.stringify(context)).digest('hex');
}

export async function readCache(stateDir, key) {
  try {
    return JSON.parse(await readFile(path.join(stateDir, 'cache', `${key}.json`), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT' || error instanceof SyntaxError) return null;
    throw error;
  }
}

export async function writeCache(stateDir, key, result) {
  if (result?.ok !== true) return;
  const dir = path.join(stateDir, 'cache');
  await mkdir(dir, { recursive: true });
  const target = path.join(dir, `${key}.json`);
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(result));
  await rename(temporary, target);
}
