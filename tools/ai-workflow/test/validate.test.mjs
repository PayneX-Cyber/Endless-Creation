import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

import { validate } from '../lib/validate.mjs';
import { run } from '../cli.mjs';

function git(root, ...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

async function repository() {
  const root = await mkdtemp(path.join(tmpdir(), 'ai-workflow-'));
  git(root, 'init');
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Test');
  await writeFile(path.join(root, 'check.mjs'), "import { readFileSync } from 'node:fs'; process.exit(readFileSync('value.txt','utf8').trim()==='good'?0:1)");
  await writeFile(path.join(root, 'value.txt'), 'base');
  await writeFile(path.join(root, 'config.json'), JSON.stringify({ profiles: { targeted: { commands: ['node check.mjs'] } } }));
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'base');
  return root;
}

test('staged validation ignores unstaged content', async () => {
  const root = await repository();
  await writeFile(path.join(root, 'value.txt'), 'good');
  git(root, 'add', 'value.txt');
  await writeFile(path.join(root, 'value.txt'), 'bad');

  const result = await validate({ root, profile: 'targeted', configPath: 'config.json', staged: true });

  assert.equal(result.ok, true);
  assert.equal(await readFile(path.join(root, 'value.txt'), 'utf8'), 'bad');
});

test('staged validation reads its config from the index', async () => {
  const root = await repository();
  await writeFile(path.join(root, 'value.txt'), 'good');
  git(root, 'add', 'value.txt');
  await writeFile(path.join(root, 'config.json'), JSON.stringify({
    profiles: { targeted: { commands: ['node -e "process.exit(1)"'] } }
  }));

  const result = await validate({ root, profile: 'targeted', configPath: 'config.json', staged: true });

  assert.equal(result.ok, true);
});

test('staged shadow resolves dependencies from the repository', async () => {
  const root = await repository();
  await mkdir(path.join(root, 'node_modules', 'demo'), { recursive: true });
  await writeFile(path.join(root, 'node_modules', 'demo', 'package.json'), '{"main":"index.js"}');
  await writeFile(path.join(root, 'node_modules', 'demo', 'index.js'), 'module.exports = true');
  await writeFile(path.join(root, 'config.json'), JSON.stringify({
    profiles: { targeted: { commands: ['node -e "require(\'demo\')"'] } }
  }));
  git(root, 'add', 'config.json');

  const result = await validate({ root, profile: 'targeted', configPath: 'config.json', staged: true });

  assert.equal(result.ok, true);
});

test('unknown profile is a configuration error', async () => {
  const root = await repository();
  await assert.rejects(
    validate({ root, profile: 'missing', configPath: 'config.json', staged: true }),
    /Unknown profile/
  );
});

test('bypass requires a reason and appends an audit record', async () => {
  const root = await repository();
  assert.equal(await run(['validate', 'targeted'], { AI_WORKFLOW_BYPASS: '   ' }, root), 2);
  assert.equal(await run(['validate', 'targeted'], { AI_WORKFLOW_BYPASS: 'urgent fix' }, root), 0);
  const gitDir = git(root, 'rev-parse', '--git-dir');
  const records = (await readFile(path.resolve(root, gitDir, 'ai-workflow', 'audit.jsonl'), 'utf8')).trim().split('\n');
  assert.equal(JSON.parse(records.at(-1)).reason, 'urgent fix');
});

test('path rules select the strongest profile and write a report', async () => {
  const root = await repository();
  await mkdir(path.join(root, '.ai-workflow'));
  await writeFile(path.join(root, '.ai-workflow', 'config.json'), JSON.stringify({
    profiles: { targeted: { commands: [] }, fast: { commands: [] } },
    paths: { 'src/**': 'fast' }
  }));
  await mkdir(path.join(root, 'src'));
  await writeFile(path.join(root, 'src', 'app.js'), 'ok');
  git(root, 'add', '.');

  const result = await validate({ root, staged: true });

  assert.equal(result.profile, 'fast');
  const report = JSON.parse(await readFile(result.reportPath, 'utf8'));
  assert.equal(report.profile, 'fast');
  assert.equal(typeof report.durationMs, 'number');
});
