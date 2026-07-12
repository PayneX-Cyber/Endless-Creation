import { cp, mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

import { withWriterLock } from './scheduler.mjs';

export async function runMigration({ root, id, paths, preflight, apply, verify }) {
  for (const relative of paths) {
    if (!relative || path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..')) {
      throw new Error(`Invalid managed path: ${relative}`);
    }
  }
  const stateDir = await migrationStateDir(root);
  const blocked = path.join(stateDir, 'recovery-required');
  if (await hasEntries(blocked)) throw new Error('Migration blocked: recovery-required');
  const runId = `${Date.now()}-${process.pid}-${id}`;
  const runDir = path.join(stateDir, 'migrations', runId);
  const snapshotDir = path.join(runDir, 'snapshot');
  const journalPath = path.join(runDir, 'journal.jsonl');
  await mkdir(snapshotDir, { recursive: true });
  await wal(journalPath, { phase: 'preflight', id });
  if (await preflight() !== true) throw new Error('Migration preflight failed');
  await wal(journalPath, { phase: 'snapshot', id });
  const manifest = await snapshot(root, snapshotDir, paths);
  await validateSnapshot(snapshotDir, manifest);

  return withWriterLock({ stateDir }, async () => {
    try {
      await wal(journalPath, { phase: 'apply', id });
      await apply({ runId, runDir, snapshotDir, journalPath });
      await wal(journalPath, { phase: 'verify', id });
      await verify();
      await wal(journalPath, { phase: 'promote', id });
      const versionDir = path.join(root, '.ai-workflow');
      await mkdir(versionDir, { recursive: true });
      const temporary = path.join(versionDir, `version.${process.pid}.tmp`);
      await writeFile(temporary, `${JSON.stringify({ version: id, runId }, null, 2)}\n`);
      await rename(temporary, path.join(versionDir, 'version.json'));
      await wal(journalPath, { phase: 'complete', id });
      return { ok: true, runId, journalPath, snapshotDir };
    } catch (error) {
      await wal(journalPath, { phase: 'rollback', id, error: error.message });
      try {
        await restore(root, snapshotDir, manifest);
        await wal(journalPath, { phase: 'rolled-back', id });
        return { ok: false, error: error.message, runId, journalPath, snapshotDir };
      } catch (rollbackError) {
        await mkdir(blocked, { recursive: true });
        await writeFile(path.join(blocked, `${id}.json`), `${JSON.stringify({
          id, runId, error: error.message, rollbackError: rollbackError.message, journalPath, snapshotDir
        }, null, 2)}\n`);
        await wal(journalPath, { phase: 'recovery-required', id, error: rollbackError.message });
        return { ok: false, recoveryRequired: true, runId, journalPath, snapshotDir };
      }
    }
  });
}

export async function recoverMigration(root, id) {
  const stateDir = await migrationStateDir(root);
  const marker = path.join(stateDir, 'recovery-required', `${id}.json`);
  const value = JSON.parse(await readFile(marker, 'utf8'));
  const manifest = JSON.parse(await readFile(path.join(value.snapshotDir, 'manifest.json'), 'utf8'));
  await restore(root, value.snapshotDir, manifest);
  await rm(marker, { force: true });
  return { ok: true };
}

async function wal(journalPath, value) {
  await mkdir(path.dirname(journalPath), { recursive: true });
  const handle = await open(journalPath, 'a');
  try {
    await handle.write(`${JSON.stringify({ ...value, at: new Date().toISOString() })}\n`);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function snapshot(root, snapshotDir, paths) {
  const entries = [];
  for (const relative of paths) {
    const source = path.join(root, relative);
    const target = path.join(snapshotDir, 'files', relative);
    try {
      const info = await stat(source);
      await mkdir(path.dirname(target), { recursive: true });
      await cp(source, target, { recursive: info.isDirectory(), force: true });
      entries.push({ path: relative, exists: true, checksum: await hashPath(target) });
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      entries.push({ path: relative, exists: false });
    }
  }
  const manifest = { entries };
  await writeFile(path.join(snapshotDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

async function restore(root, snapshotDir, manifest) {
  await stat(path.join(snapshotDir, 'manifest.json'));
  await validateSnapshot(snapshotDir, manifest);
  for (const entry of manifest.entries) {
    const target = path.join(root, entry.path);
    await rm(target, { recursive: true, force: true });
    if (entry.exists) {
      const source = path.join(snapshotDir, 'files', entry.path);
      await mkdir(path.dirname(target), { recursive: true });
      await cp(source, target, { recursive: (await stat(source)).isDirectory(), force: true });
    }
  }
}

async function validateSnapshot(snapshotDir, manifest) {
  for (const entry of manifest.entries) {
    if (!entry.exists) continue;
    const actual = await hashPath(path.join(snapshotDir, 'files', entry.path));
    if (actual !== entry.checksum) throw new Error(`Snapshot checksum mismatch: ${entry.path}`);
  }
}

async function hashPath(target) {
  const hash = createHash('sha256');
  const info = await stat(target);
  if (info.isFile()) return hash.update(await readFile(target)).digest('hex');
  for (const name of (await readdir(target)).sort()) {
    hash.update(name);
    hash.update(await hashPath(path.join(target, name)));
  }
  return hash.digest('hex');
}

async function migrationStateDir(root) {
  const dotGit = path.join(root, '.git');
  const info = await stat(dotGit);
  if (info.isDirectory()) return path.join(dotGit, 'ai-workflow');
  const value = await readFile(dotGit, 'utf8');
  return path.join(path.resolve(root, value.replace(/^gitdir:\s*/i, '').trim()), 'ai-workflow');
}

async function hasEntries(dir) {
  try {
    return (await readdir(dir)).length > 0;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}
