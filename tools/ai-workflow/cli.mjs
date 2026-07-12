#!/usr/bin/env node
import { validate } from './lib/validate.mjs';
import { appendFile } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { runtimeDir } from './lib/core.mjs';
import { git } from './lib/core.mjs';
import { cacheKey, readCache, writeCache } from './lib/cache.mjs';

const inFlight = new Map();

export async function run(argv = process.argv.slice(2), env = process.env, root = process.cwd()) {
  if (argv[0] !== 'validate') return 2;
  const profile = argv[1] ?? 'targeted';
  if ('AI_WORKFLOW_BYPASS' in env) {
    const reason = env.AI_WORKFLOW_BYPASS.trim();
    if (!reason) return 2;
    await appendFile(path.join(await runtimeDir(root), 'audit.jsonl'), `${JSON.stringify({ event: 'bypass', reason, createdAt: new Date().toISOString() })}\n`);
    return 0;
  }
  const result = await cachedValidation(root, profile, argv.includes('--staged'));
  return result.ok ? 0 : 1;
}

async function cachedValidation(root, profile, staged) {
  const config = await readFile(path.join(root, '.ai-workflow', 'config.json'), 'utf8');
  const key = cacheKey({
    tree: staged ? await git(root, 'write-tree') : await git(root, 'rev-parse', 'HEAD'),
    configHash: createHash('sha256').update(config).digest('hex'),
    environment: `${process.version}:${await git(root, '--version')}:ai-workflow-v1`,
    profile
  });
  const stateDir = await runtimeDir(root);
  const hit = await readCache(stateDir, key);
  if (hit) return { ...hit, cacheHit: true };
  if (!inFlight.has(key)) {
    inFlight.set(key, validate({ root, profile, staged }).then(async result => {
      await writeCache(stateDir, key, result);
      return result;
    }).finally(() => inFlight.delete(key)));
  }
  return inFlight.get(key);
}

if (import.meta.url === `file://${process.argv[1].replaceAll('\\', '/')}`) {
  process.exitCode = await run();
}
