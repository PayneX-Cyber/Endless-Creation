#!/usr/bin/env node
import { validate } from './lib/validate.mjs';
import { appendFile } from 'node:fs/promises';
import path from 'node:path';
import { runtimeDir } from './lib/core.mjs';

export async function run(argv = process.argv.slice(2), env = process.env, root = process.cwd()) {
  if (argv[0] !== 'validate') return 2;
  const profile = argv[1] ?? 'targeted';
  if ('AI_WORKFLOW_BYPASS' in env) {
    const reason = env.AI_WORKFLOW_BYPASS.trim();
    if (!reason) return 2;
    await appendFile(path.join(await runtimeDir(root), 'audit.jsonl'), `${JSON.stringify({ event: 'bypass', reason, createdAt: new Date().toISOString() })}\n`);
    return 0;
  }
  const result = await validate({ root, profile, staged: argv.includes('--staged') });
  return result.ok ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1].replaceAll('\\', '/')}`) {
  process.exitCode = await run();
}
