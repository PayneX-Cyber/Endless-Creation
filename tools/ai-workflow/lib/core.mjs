import { execFile } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

export const exec = promisify(execFile);

export async function loadConfig(root, configPath = '.ai-workflow/config.json') {
  return JSON.parse(await readFile(path.resolve(root, configPath), 'utf8'));
}

export async function git(root, ...args) {
  return (await exec('git', args, { cwd: root })).stdout.trim();
}

export async function runtimeDir(root) {
  const dir = path.resolve(root, await git(root, 'rev-parse', '--git-dir'), 'ai-workflow');
  await mkdir(dir, { recursive: true });
  return dir;
}
