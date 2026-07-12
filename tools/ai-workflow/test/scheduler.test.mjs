import assert from 'node:assert/strict';
import { access, mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { cacheKey, readCache, writeCache } from '../lib/cache.mjs';
import { withWriterLock } from '../lib/scheduler.mjs';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

test('writer lock is FIFO and never overlaps operations', async () => {
  const stateDir = await mkdtemp(path.join(tmpdir(), 'scheduler-'));
  const order = [];
  let active = 0;
  const run = id => withWriterLock({ stateDir, staleMs: 100 }, async () => {
    assert.equal(active++, 0);
    order.push(id);
    await sleep(20);
    active--;
  });

  await Promise.all([run(1), run(2), run(3)]);

  assert.deepEqual(order, [1, 2, 3]);
});

test('dead stale owner is recovered and audited', async () => {
  const stateDir = await mkdtemp(path.join(tmpdir(), 'scheduler-'));
  await mkdir(path.join(stateDir, 'queue'));
  await writeFile(path.join(stateDir, 'writer.lock'), JSON.stringify({ pid: 999999, heartbeatAt: 0 }));

  await withWriterLock({ stateDir, staleMs: 1 }, async () => {});

  assert.match(await readFile(path.join(stateDir, 'audit.jsonl'), 'utf8'), /stale-lock-recovered/);
});

test('dead stale tickets are removed', async () => {
  const stateDir = await mkdtemp(path.join(tmpdir(), 'scheduler-'));
  const queue = path.join(stateDir, 'queue');
  await mkdir(queue);
  await writeFile(path.join(queue, '0000000000000000-00000000-999999.json'), JSON.stringify({ pid: 999999, createdAt: 0 }));

  await withWriterLock({ stateDir, staleMs: 1 }, async () => {});

  assert.match(await readFile(path.join(stateDir, 'audit.jsonl'), 'utf8'), /stale-ticket-removed/);
});

test('a waiter failure never removes another writer lock', async () => {
  const stateDir = await mkdtemp(path.join(tmpdir(), 'scheduler-'));
  let enter;
  let release;
  const entered = new Promise(resolve => { enter = resolve; });
  const blocked = new Promise(resolve => { release = resolve; });
  const writer = withWriterLock({ stateDir }, async () => {
    enter();
    await blocked;
  });
  await entered;
  await writeFile(path.join(stateDir, 'queue', 'malformed.json'), 'not-json');

  let lockSurvived = false;
  try {
    await assert.rejects(withWriterLock({ stateDir }, async () => {}), SyntaxError);
    await access(path.join(stateDir, 'writer.lock'));
    lockSurvived = true;
  } finally {
    release();
    await writer;
  }

  assert.equal(lockSurvived, true);
});

test('cache key changes with tree config environment or profile', async () => {
  const base = { tree: 'a', configHash: 'b', environment: 'c', profile: 'fast' };
  const key = cacheKey(base);
  assert.equal(key, cacheKey(base));
  for (const field of Object.keys(base)) {
    assert.notEqual(key, cacheKey({ ...base, [field]: `${base[field]}x` }));
  }
});

test('successful cache records round trip', async () => {
  const stateDir = await mkdtemp(path.join(tmpdir(), 'cache-'));
  assert.equal(await readCache(stateDir, 'missing'), null);
  await writeCache(stateDir, 'key', { ok: true });
  assert.deepEqual(await readCache(stateDir, 'key'), { ok: true });
});
