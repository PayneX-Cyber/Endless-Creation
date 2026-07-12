import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

import { applyHandoff, createHandoff, inspectHandoff } from '../lib/handoff.mjs';

function git(root, ...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

async function repository() {
  const root = await mkdtemp(path.join(tmpdir(), 'handoff-'));
  git(root, 'init');
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Test');
  await writeFile(path.join(root, 'story.txt'), 'base\n');
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'base');
  return root;
}

test('staged handoff writes canonical manifest, truncated context and binary patch', async () => {
  const root = await repository();
  await writeFile(path.join(root, 'story.txt'), `${Array.from({ length: 2100 }, (_, i) => `line ${i}`).join('\n')}\n`);
  await writeFile(path.join(root, 'image.bin'), Buffer.from([0, 255, 1, 254]));
  git(root, 'add', '.');

  const bundle = await createHandoff({ root, mode: 'staged' });
  const manifest = JSON.parse(await readFile(path.join(bundle, 'manifest.json'), 'utf8'));
  const context = await readFile(path.join(bundle, 'context.md'), 'utf8');
  const patch = await readFile(path.join(bundle, 'changes.patch'), 'utf8');

  assert.equal(manifest.mode, 'staged');
  assert.ok(manifest.head && manifest.indexTree);
  assert.match(context, /\[Diff truncated, see manifest for details\]/);
  assert.match(patch, /GIT binary patch/);
});

test('handoff refuses suspected secrets', async () => {
  const root = await repository();
  await writeFile(path.join(root, 'story.txt'), 'OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz123456\n');
  git(root, 'add', '.');
  await assert.rejects(createHandoff({ root, mode: 'staged' }), /secret/i);
});

test('inspect marks changed index as stale', async () => {
  const root = await repository();
  await writeFile(path.join(root, 'story.txt'), 'first\n');
  git(root, 'add', '.');
  const bundle = await createHandoff({ root, mode: 'session' });
  await writeFile(path.join(root, 'story.txt'), 'second\n');
  git(root, 'add', '.');
  assert.equal((await inspectHandoff(bundle)).stale, true);
});

test('apply is explicit and patch round trips', async () => {
  const source = await repository();
  await writeFile(path.join(source, 'story.txt'), 'changed\n');
  git(source, 'add', '.');
  const bundle = await createHandoff({ root: source, mode: 'staged' });
  const target = await repository();

  assert.equal((await applyHandoff(bundle, { root: target, apply: false })).applied, false);
  assert.equal(await readFile(path.join(target, 'story.txt'), 'utf8'), 'base\n');
  assert.equal((await applyHandoff(bundle, { root: target, apply: true })).applied, true);
  assert.equal((await readFile(path.join(target, 'story.txt'), 'utf8')).trim(), 'changed');
});

test('phase changes make a handoff stale and patch conflicts stop', async () => {
  const source = await repository();
  const change = path.join(source, 'openspec', 'changes', 'sample');
  await mkdir(change, { recursive: true });
  await writeFile(path.join(change, '.comet.yaml'), 'phase: build\n');
  await writeFile(path.join(source, 'story.txt'), 'source\n');
  git(source, 'add', '.');
  const bundle = await createHandoff({ root: source, mode: 'staged' });
  await writeFile(path.join(change, '.comet.yaml'), 'phase: verify\n');
  assert.equal((await inspectHandoff(bundle)).stale, true);

  await writeFile(path.join(change, '.comet.yaml'), 'phase: build\n');
  const target = await repository();
  await writeFile(path.join(target, 'story.txt'), 'conflict\n');
  await assert.rejects(applyHandoff(bundle, { root: target, apply: true }));
});
