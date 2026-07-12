import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runMigration } from '../lib/migration.mjs';

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'migration-'));
  await mkdir(path.join(root, '.git'));
  await writeFile(path.join(root, 'managed.txt'), 'before');
  return root;
}

test('WAL intent is durable before apply and migration promotes', async () => {
  const root = await fixture();
  const result = await runMigration({
    root, id: '001', paths: ['managed.txt'],
    preflight: async () => true,
    apply: async ({ journalPath }) => {
      assert.match(await readFile(journalPath, 'utf8'), /"phase":"apply"/);
      await writeFile(path.join(root, 'managed.txt'), 'after');
    },
    verify: async () => assert.equal(await readFile(path.join(root, 'managed.txt'), 'utf8'), 'after')
  });
  assert.equal(result.ok, true);
  assert.match(await readFile(path.join(root, '.ai-workflow', 'version.json'), 'utf8'), /001/);
});

test('verify failure restores snapshot without git reset or checkout', async () => {
  const root = await fixture();
  const result = await runMigration({
    root, id: '002', paths: ['managed.txt'],
    preflight: async () => true,
    apply: async () => writeFile(path.join(root, 'managed.txt'), 'broken'),
    verify: async () => { throw new Error('verify failed'); }
  });
  assert.equal(result.ok, false);
  assert.equal(await readFile(path.join(root, 'managed.txt'), 'utf8'), 'before');
  assert.doesNotMatch(await readFile(result.journalPath, 'utf8'), /git (?:reset|checkout)/);
});

test('apply failure also restores snapshot', async () => {
  const root = await fixture();
  const result = await runMigration({
    root, id: '002b', paths: ['managed.txt'],
    preflight: async () => true,
    apply: async () => {
      await writeFile(path.join(root, 'managed.txt'), 'partial');
      throw new Error('apply failed');
    },
    verify: async () => assert.fail('verify must not run')
  });
  assert.equal(result.ok, false);
  assert.equal(await readFile(path.join(root, 'managed.txt'), 'utf8'), 'before');
});

test('rollback failure persists recovery-required and blocks later migrations', async () => {
  const root = await fixture();
  const first = await runMigration({
    root, id: '003', paths: ['managed.txt'],
    preflight: async () => true,
    apply: async ({ snapshotDir }) => {
      await writeFile(path.join(root, 'managed.txt'), 'broken');
      await rm(snapshotDir, { recursive: true, force: true });
    },
    verify: async () => { throw new Error('verify failed'); }
  });
  assert.equal(first.recoveryRequired, true);
  await access(path.join(root, '.git', 'ai-workflow', 'recovery-required', '003.json'));
  await assert.rejects(runMigration({
    root, id: '004', paths: [], preflight: async () => true, apply: async () => {}, verify: async () => {}
  }), /recovery-required/);
});

test('managed paths cannot escape the repository', async () => {
  const root = await fixture();
  await assert.rejects(runMigration({
    root, id: '005', paths: ['../outside'], preflight: async () => true,
    apply: async () => {}, verify: async () => {}
  }), /managed path/i);
});
