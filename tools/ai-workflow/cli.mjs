#!/usr/bin/env node
import { selectProfile, validate } from './lib/validate.mjs';
import { appendFile } from 'node:fs/promises';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runtimeDir } from './lib/core.mjs';
import { git } from './lib/core.mjs';
import { cacheKey, readCache, writeCache } from './lib/cache.mjs';
import { applyHandoff, createHandoff, inspectHandoff } from './lib/handoff.mjs';
import { diffSources, syncSources, updateSources, verifySources } from './lib/sources.mjs';
import { installHook } from './lib/hook.mjs';
import { maintainScheduler } from './lib/scheduler.mjs';
import {
  migrationStatus,
  pruneMigrations,
  readMigrationDefinition,
  rollbackMigration,
  runDeclarativeMigration
} from './lib/migration.mjs';

const inFlight = new Map();

export async function run(argv = process.argv.slice(2), env = process.env, root = process.cwd()) {
  const startedAt = new Date();
  try {
    const exitCode = await dispatch(argv, env, root);
    await writeRunReport(root, argv, exitCode, startedAt);
    return exitCode;
  } catch (error) {
    const exitCode = errorExitCode(error);
    await writeRunReport(root, argv, exitCode, startedAt, error);
    return exitCode;
  }
}

async function dispatch(argv, env, root) {
  if (argv[0] === 'doctor') {
    JSON.parse(await readFile(path.join(root, '.ai-workflow', 'config.json'), 'utf8'));
    await git(root, 'rev-parse', 'HEAD');
    return 0;
  }
  if (argv[0] === 'scheduler') {
    if (argv[1] === 'status') {
      await runtimeDir(root);
      return 0;
    }
    if (['recover', 'prune'].includes(argv[1])) {
      await maintainScheduler({ stateDir: await runtimeDir(root) });
      return 0;
    }
    return 2;
  }
  if (argv[0] === 'migrate') {
    if (argv[1] === 'status') return (await migrationStatus(root)).recoveryRequired ? 4 : 0;
    if (argv[1] === 'prune') {
      await pruneMigrations(root);
      return 0;
    }
    if (argv[1] === 'plan' && argv[2]) {
      await readMigrationDefinition(root, argv[2]);
      return 0;
    }
    if (argv[1] === 'apply' && argv[2]) {
      const result = await runDeclarativeMigration(root, argv[2]);
      return result.recoveryRequired ? 4 : result.ok ? 0 : 1;
    }
    if (argv[1] === 'rollback' && argv[2]) {
      await rollbackMigration(root, argv[2]);
      return 0;
    }
    return 2;
  }
  if (argv[0] === 'hook') {
    if (argv[1] === 'install') {
      await installHook(root);
      return 0;
    }
    if (argv[1] === 'run' && argv[2] === 'pre-commit') {
      const config = JSON.parse(await workflowConfigText(root, true));
      const code = await validationExit(root, undefined, true, env);
      return config.stage === 'observe' && code === 1 ? 0 : code;
    }
    return 2;
  }
  if (argv[0] === 'handoff') {
    if (argv[1] === 'create') {
      await createHandoff({ root, mode: argv[2] ?? 'session' });
      return 0;
    }
    if (argv[1] === 'inspect') return (await inspectHandoff(argv[2])).stale ? 3 : 0;
    if (argv[1] === 'apply') {
      await applyHandoff(argv[2], { root, apply: argv.includes('--apply') });
      return 0;
    }
    return 2;
  }
  if (argv[0] === 'sources') {
    const mirrors = ['.agents/skills', '.codex/skills', '.claude/skills', '.agent/skills'];
    if (argv[1] === 'verify') return (await verifySources(root, { mirrors })).ok ? 0 : 1;
    if (argv[1] === 'diff') {
      await diffSources(root, { mirrors });
      return 0;
    }
    if (argv[1] === 'sync') {
      const result = await syncSources(root, {
        mirrors,
        prune: argv.includes('--prune'),
        dryRun: argv.includes('--dry-run')
      });
      return result.recoveryRequired ? 4 : result.ok ? 0 : 1;
    }
    if (argv[1] === 'update') {
      const to = argv[argv.indexOf('--to') + 1];
      if (!argv[2] || !to) return 2;
      const result = await updateSources(root, argv[2], { resolvedVersion: to }, { mirrors });
      return result.recoveryRequired ? 4 : result.ok ? 0 : 1;
    }
    return 2;
  }
  if (argv[0] !== 'validate') return 2;
  const profile = argv[1] ?? 'targeted';
  return validationExit(root, profile, argv.includes('--staged'), env, argv.includes('--no-cache'));
}

async function validationExit(root, profile, staged, env, noCache = false) {
  if ('AI_WORKFLOW_BYPASS' in env) {
    const reason = env.AI_WORKFLOW_BYPASS.trim();
    if (!reason) return 2;
    const [branch, head, stagedTree] = await Promise.all([
      git(root, 'branch', '--show-current'),
      git(root, 'rev-parse', 'HEAD'),
      git(root, 'write-tree')
    ]);
    await appendFile(path.join(await runtimeDir(root), 'audit.jsonl'), `${JSON.stringify({
      event: 'bypass', reason, branch, head, stagedTree, createdAt: new Date().toISOString()
    })}\n`);
    return 0;
  }
  const result = await cachedValidation(root, profile, staged, noCache || profile === 'ci');
  return result.ok ? 0 : 1;
}

async function cachedValidation(root, profile, staged, noCache) {
  const config = await workflowConfigText(root, staged);
  const effectiveProfile = profile ?? await selectProfile(root, JSON.parse(config), staged);
  const key = cacheKey({
    tree: staged ? await git(root, 'write-tree') : await workspaceFingerprint(root),
    configHash: createHash('sha256').update(config).digest('hex'),
    environment: `${process.version}:${await git(root, '--version')}:ai-workflow-v1`,
    profile: effectiveProfile
  });
  const stateDir = await runtimeDir(root);
  if (noCache || effectiveProfile === 'ci') return validate({ root, profile: effectiveProfile, staged });
  const hit = await readCache(stateDir, key);
  if (hit) {
    await appendFile(path.join(stateDir, 'metrics.jsonl'), `${JSON.stringify({ event: 'cache-hit', profile, createdAt: new Date().toISOString() })}\n`);
    return { ...hit, cacheHit: true };
  }
  await appendFile(path.join(stateDir, 'metrics.jsonl'), `${JSON.stringify({ event: 'cache-miss', profile, createdAt: new Date().toISOString() })}\n`);
  if (!inFlight.has(key)) {
    inFlight.set(key, validate({ root, profile: effectiveProfile, staged }).then(async result => {
      await writeCache(stateDir, key, result);
      return result;
    }).finally(() => inFlight.delete(key)));
  }
  return inFlight.get(key);
}

async function workspaceFingerprint(root) {
  const hash = createHash('sha256');
  hash.update(await git(root, 'rev-parse', 'HEAD'));
  hash.update(await git(root, 'diff', '--binary', 'HEAD'));
  const untracked = (await git(root, 'ls-files', '--others', '--exclude-standard', '-z'))
    .split('\0')
    .filter(Boolean)
    .sort();
  for (const relative of untracked) {
    hash.update(relative);
    hash.update(await readFile(path.join(root, relative)));
  }
  return hash.digest('hex');
}

async function workflowConfigText(root, staged) {
  return staged
    ? git(root, 'show', ':.ai-workflow/config.json')
    : readFile(path.join(root, '.ai-workflow', 'config.json'), 'utf8');
}

async function writeRunReport(root, argv, exitCode, startedAt, error) {
  const dir = path.join(await runtimeDir(root), 'runs');
  await mkdir(dir, { recursive: true });
  const report = {
    schemaVersion: 'ai-workflow.run.v1',
    runId: randomUUID(),
    command: argv.join(' '),
    profile: argv[0] === 'validate' ? argv[1] ?? 'targeted' : null,
    scope: argv.includes('--staged') ? 'staged' : 'workspace',
    startedAt: startedAt.toISOString(),
    durationMs: Date.now() - startedAt.getTime(),
    exitCode,
    result: exitCode === 0 ? 'pass' : 'fail',
    ...(error ? { message: error.message } : {})
  };
  await writeFile(path.join(dir, `${report.runId}.json`), `${JSON.stringify(report, null, 2)}\n`);
}

function errorExitCode(error) {
  if (/recovery-required/i.test(error.message)) return 4;
  if (/secret|integrity/i.test(error.message)) return 5;
  if (/unknown|invalid|ENOENT/i.test(error.message)) return 2;
  return 1;
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exitCode = await run();
}
