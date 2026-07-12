import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { exec, git, loadConfig, runtimeDir } from './core.mjs';

export async function validate({ root, profile, configPath, staged = false }) {
  const startedAt = Date.now();
  const stateDir = await runtimeDir(root);
  const shadow = staged ? await mkdtemp(path.join(stateDir, 'shadow-')) : root;
  try {
    if (staged) {
      const prefix = `${path.resolve(shadow)}${path.sep}`;
      await git(root, 'checkout-index', '--all', '--force', `--prefix=${prefix}`);
    }
    const config = await loadConfig(shadow, configPath);
    if (!profile) profile = await selectProfile(root, config, staged);
    const selected = config.profiles?.[profile];
    if (!selected) throw new Error(`Unknown profile: ${profile}`);
    const bin = path.join(root, 'node_modules', '.bin');
    const env = {
      ...process.env,
      NODE_PATH: path.join(root, 'node_modules'),
      PATH: `${bin}${path.delimiter}${process.env.PATH ?? ''}`
    };
    for (const command of selected.commands ?? []) {
      await exec(command, { cwd: shadow, shell: true, env });
    }
    return await report(root, { ok: true, profile, durationMs: Date.now() - startedAt });
  } catch (error) {
    if (error.message?.startsWith('Unknown profile:')) throw error;
    return await report(root, { ok: false, profile, message: error.message, durationMs: Date.now() - startedAt });
  } finally {
    if (staged) await rm(shadow, { recursive: true, force: true });
  }
}

async function selectProfile(root, config, staged) {
  const files = staged ? (await git(root, 'diff', '--cached', '--name-only')).split(/\r?\n/).filter(Boolean) : [];
  const ranks = Object.keys(config.profiles ?? {});
  let selected = ranks[0];
  for (const file of files) {
    for (const [pattern, candidate] of Object.entries(config.paths ?? {})) {
      const matches = pattern.endsWith('/**') ? file.startsWith(pattern.slice(0, -3)) : file === pattern;
      if (matches && ranks.indexOf(candidate) > ranks.indexOf(selected)) selected = candidate;
    }
  }
  return selected;
}

async function report(root, result) {
  const dir = path.join(await runtimeDir(root), 'reports');
  await mkdir(dir, { recursive: true });
  const reportPath = path.join(dir, `${Date.now()}-${process.pid}.json`);
  await writeFile(reportPath, `${JSON.stringify({ ...result, createdAt: new Date().toISOString() }, null, 2)}\n`);
  return { ...result, reportPath };
}
