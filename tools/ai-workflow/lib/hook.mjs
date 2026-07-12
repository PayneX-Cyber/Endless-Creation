import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { exec, git } from './core.mjs';

export const HOOK = '#!/bin/sh\nexec node tools/ai-workflow/cli.mjs hook run pre-commit\n';

export async function installHook(root) {
  let configured = '';
  try {
    configured = (await exec('git', ['config', '--get', 'core.hooksPath'], { cwd: root })).stdout.trim();
  } catch (error) {
    if (error.code !== 1) throw error;
  }
  if (configured && configured.replaceAll('\\', '/') !== '.githooks') {
    throw new Error(`Refusing to replace existing core.hooksPath: ${configured}`);
  }
  const existing = path.resolve(root, await git(root, 'rev-parse', '--git-path', 'hooks/pre-commit'));
  try {
    if ((await readFile(existing, 'utf8')) !== HOOK) throw new Error(`Refusing to replace existing hook: ${existing}`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const target = path.join(root, '.githooks', 'pre-commit');
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, HOOK);
  await exec('git', ['config', 'core.hooksPath', '.githooks'], { cwd: root });
  return target;
}
