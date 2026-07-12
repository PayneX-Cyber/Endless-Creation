import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { diffSources, hashDirectory, syncSources, verifySources } from '../lib/sources.mjs';

async function fixture(hash = true) {
  const root = await mkdtemp(path.join(tmpdir(), 'sources-'));
  await mkdir(path.join(root, '.git'));
  await mkdir(path.join(root, 'source', 'demo'), { recursive: true });
  await mkdir(path.join(root, '.agents', 'skills', 'unmanaged'), { recursive: true });
  await writeFile(path.join(root, 'source', 'demo', 'SKILL.md'), 'demo');
  await writeFile(path.join(root, '.agents', 'skills', 'unmanaged', 'SKILL.md'), 'keep');
  const computedHash = hash ? await hashDirectory(path.join(root, 'source', 'demo')) : 'wrong';
  await writeFile(path.join(root, 'skills-lock.json'), `${JSON.stringify({
    version: 1,
    unknownInstallerField: { keep: true },
    skills: { demo: { source: 'source/demo', computedHash } }
  }, null, 2)}\n`);
  return root;
}

test('verify and diff report drift and unmanaged without deleting', async () => {
  const root = await fixture();
  const options = { mirrors: ['.agents/skills'] };
  assert.equal((await verifySources(root, options)).ok, false);
  const diff = await diffSources(root, options);
  assert.deepEqual(diff.missing, ['.agents/skills/demo']);
  assert.deepEqual(diff.unmanaged, ['.agents/skills/unmanaged']);
  await access(path.join(root, '.agents', 'skills', 'unmanaged', 'SKILL.md'));
});

test('sync preserves unmanaged by default and prune deletes only after snapshot', async () => {
  const root = await fixture();
  const options = { mirrors: ['.agents/skills'] };
  assert.equal((await syncSources(root, options)).ok, true);
  await access(path.join(root, '.agents', 'skills', 'unmanaged', 'SKILL.md'));
  await access(path.join(root, '.agents', 'skills', 'demo', 'SKILL.md'));
  assert.equal((await syncSources(root, { ...options, prune: true })).ok, true);
  await assert.rejects(access(path.join(root, '.agents', 'skills', 'unmanaged')));
  assert.match(await readFile(path.join(root, 'skills-lock.json'), 'utf8'), /unknownInstallerField/);
});

test('sync rejects source integrity mismatch', async () => {
  const root = await fixture(false);
  await assert.rejects(syncSources(root, { mirrors: ['.agents/skills'] }), /integrity/i);
});
