import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import test from 'node:test';

import { run } from '../cli.mjs';
import { installHook } from '../lib/hook.mjs';

function git(root, ...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

async function repository(stage = 'observe') {
  const root = await mkdtemp(path.join(tmpdir(), 'hook-'));
  git(root, 'init');
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Test');
  await mkdir(path.join(root, '.ai-workflow'));
  await writeFile(path.join(root, '.ai-workflow', 'config.json'), JSON.stringify({
    stage,
    profiles: {
      targeted: { commands: [] },
      fast: { commands: ['node -e "process.exit(1)"'] }
    },
    paths: { 'file.txt': 'fast' }
  }));
  await writeFile(path.join(root, 'file.txt'), 'base');
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'base');
  await writeFile(path.join(root, 'file.txt'), 'changed');
  git(root, 'add', 'file.txt');
  return root;
}

test('observe records validation failure without blocking while guard blocks', async () => {
  const observe = await repository('observe');
  assert.equal(await run(['hook', 'run', 'pre-commit'], {}, observe), 0);
  const reports = path.join(observe, '.git', 'ai-workflow', 'reports');
  assert.match(await readFile(path.join(reports, (await readdir(reports))[0]), 'utf8'), /"ok": false/);

  const guard = await repository('guard');
  assert.equal(await run(['hook', 'run', 'pre-commit'], {}, guard), 1);
});

test('hook enforcement stage comes from the index', async () => {
  const root = await repository('guard');
  const configPath = path.join(root, '.ai-workflow', 'config.json');
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  await writeFile(configPath, JSON.stringify({ ...config, stage: 'observe' }));

  assert.equal(await run(['hook', 'run', 'pre-commit'], {}, root), 1);
});

test('hook bypass is audited and equivalent validations hit one cache record', async () => {
  const root = await repository('guard');
  assert.equal(await run(['hook', 'run', 'pre-commit'], { AI_WORKFLOW_BYPASS: 'incident' }, root), 0);
  const audit = JSON.parse((await readFile(path.join(root, '.git', 'ai-workflow', 'audit.jsonl'), 'utf8')).trim());
  assert.equal(audit.reason, 'incident');
  assert.ok(audit.branch && audit.head && audit.stagedTree);

  await writeFile(path.join(root, '.ai-workflow', 'config.json'), JSON.stringify({
    stage: 'guard', profiles: { targeted: { commands: [] } }
  }));
  git(root, 'add', '.ai-workflow/config.json');
  assert.equal(await run(['hook', 'run', 'pre-commit'], {}, root), 0);
  assert.equal(await run(['hook', 'run', 'pre-commit'], {}, root), 0);
  assert.equal((await readdir(path.join(root, '.git', 'ai-workflow', 'cache'))).length, 1);
  assert.match(await readFile(path.join(root, '.git', 'ai-workflow', 'metrics.jsonl'), 'utf8'), /cache-hit/);
});

test('installer refuses unknown existing hooks and hooksPath', async () => {
  const root = await repository();
  await writeFile(path.join(root, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\necho existing\n');
  await assert.rejects(installHook(root), /existing hook/i);

  const other = await repository();
  git(other, 'config', 'core.hooksPath', 'custom-hooks');
  await assert.rejects(installHook(other), /hooksPath/i);
});

test('installer writes the thin managed hook and configures hooksPath', async () => {
  const root = await repository();
  await installHook(root);
  assert.equal(git(root, 'config', '--get', 'core.hooksPath'), '.githooks');
  assert.equal(await readFile(path.join(root, '.githooks', 'pre-commit'), 'utf8'),
    '#!/bin/sh\nexec node tools/ai-workflow/cli.mjs hook run pre-commit\n');
});

test('CLI executes when launched as a relative script path', async () => {
  const root = await repository();
  const cli = path.resolve('tools/ai-workflow/cli.mjs');
  const result = spawnSync(process.execPath, [cli, 'validate', 'fast', '--staged'], { cwd: root });
  assert.equal(result.status, 1);
  assert.ok((await readdir(path.join(root, '.git', 'ai-workflow', 'reports'))).length > 0);
});

test('workspace cache changes with tracked and untracked content', async () => {
  const root = await repository('guard');
  await writeFile(path.join(root, '.ai-workflow', 'config.json'), JSON.stringify({
    stage: 'guard',
    profiles: {
      targeted: {
        commands: ['node -e "const fs=require(\'fs\');process.exit(fs.readFileSync(\'value.txt\',\'utf8\')===\'good\'?0:1)"']
      }
    }
  }));
  await writeFile(path.join(root, 'value.txt'), 'good');
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'cache baseline');

  assert.equal(await run(['validate', 'targeted'], {}, root), 0);
  await writeFile(path.join(root, 'value.txt'), 'bad');
  assert.equal(await run(['validate', 'targeted'], {}, root), 1);
  await writeFile(path.join(root, 'value.txt'), 'good');
  await writeFile(path.join(root, 'untracked.txt'), 'one');
  assert.equal(await run(['validate', 'targeted'], {}, root), 0);
  await writeFile(path.join(root, 'untracked.txt'), 'two');
  assert.equal(await run(['validate', 'targeted'], {}, root), 0);
  assert.equal((await readdir(path.join(root, '.git', 'ai-workflow', 'cache'))).length, 3);
});

test('ci validation never reads or writes cache', async () => {
  const root = await repository('guard');
  await writeFile(path.join(root, '.ai-workflow', 'config.json'), JSON.stringify({
    stage: 'guard',
    profiles: { ci: { commands: [] } }
  }));
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'ci baseline');

  assert.equal(await run(['validate', 'ci'], {}, root), 0);
  assert.equal(await run(['validate', 'ci'], {}, root), 0);
  await assert.rejects(readdir(path.join(root, '.git', 'ai-workflow', 'cache')));
});

test('an automatically selected ci profile never writes cache', async () => {
  const root = await repository('observe');
  await writeFile(path.join(root, '.ai-workflow', 'config.json'), JSON.stringify({
    stage: 'observe',
    profiles: { targeted: { commands: [] }, ci: { commands: [] } },
    paths: { 'file.txt': 'ci' }
  }));
  git(root, 'add', '.ai-workflow/config.json');

  assert.equal(await run(['hook', 'run', 'pre-commit'], {}, root), 0);
  assert.equal(await run(['hook', 'run', 'pre-commit'], {}, root), 0);
  await assert.rejects(readdir(path.join(root, '.git', 'ai-workflow', 'cache')));
});

test('maintenance commands route and write uniform reports', async () => {
  const root = await repository('observe');
  const commands = [
    ['doctor'],
    ['scheduler', 'status'],
    ['scheduler', 'recover'],
    ['scheduler', 'prune'],
    ['migrate', 'status'],
    ['migrate', 'prune']
  ];

  for (const command of commands) assert.equal(await run(command, {}, root), 0);

  const reportDir = path.join(root, '.git', 'ai-workflow', 'runs');
  const reports = await readdir(reportDir);
  assert.equal(reports.length, commands.length);
  const report = JSON.parse(await readFile(path.join(reportDir, reports[0]), 'utf8'));
  assert.equal(report.schemaVersion, 'ai-workflow.run.v1');
  assert.equal(typeof report.exitCode, 'number');
  assert.ok(report.command && report.runId && report.startedAt);
});

test('declarative migration can plan apply and roll back', async () => {
  const root = await repository('observe');
  const migrations = path.join(root, '.ai-workflow', 'migrations');
  await mkdir(migrations, { recursive: true });
  await writeFile(path.join(root, 'managed.txt'), 'before');
  await writeFile(path.join(migrations, '001.json'), JSON.stringify({
    id: '001',
    paths: ['managed.txt'],
    operations: [{ type: 'write', path: 'managed.txt', content: 'after' }]
  }));

  assert.equal(await run(['migrate', 'plan', '001'], {}, root), 0);
  assert.equal(await run(['migrate', 'apply', '001'], {}, root), 0);
  assert.equal(await readFile(path.join(root, 'managed.txt'), 'utf8'), 'after');
  const stateDir = path.join(root, '.git', 'ai-workflow', 'migrations');
  const runId = (await readdir(stateDir))[0];
  assert.equal(await run(['migrate', 'rollback', runId], {}, root), 0);
  assert.equal(await readFile(path.join(root, 'managed.txt'), 'utf8'), 'before');
  await assert.rejects(readFile(path.join(root, '.ai-workflow', 'version.json'), 'utf8'));
});
