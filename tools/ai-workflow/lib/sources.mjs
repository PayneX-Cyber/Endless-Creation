import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { runMigration } from './migration.mjs';

export async function hashDirectory(root) {
  const hash = createHash('sha256');
  for (const relative of await files(root)) {
    hash.update(relative.replaceAll('\\', '/'));
    hash.update('\0');
    hash.update(await readFile(path.join(root, relative)));
    hash.update('\0');
  }
  return hash.digest('hex');
}

export async function diffSources(root, { mirrors }) {
  const lock = await lockFile(root);
  const managed = new Set(Object.keys(lock.skills ?? {}));
  const missing = [];
  const drifted = [];
  const unmanaged = [];
  for (const mirror of mirrors) {
    const mirrorRoot = path.join(root, mirror);
    const existing = await names(mirrorRoot);
    for (const name of managed) {
      const target = path.join(mirrorRoot, name);
      try {
        const expected = lock.skills[name].computedHash;
        if (await hashDirectory(target) !== expected) drifted.push(path.join(mirror, name).replaceAll('\\', '/'));
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        missing.push(path.join(mirror, name).replaceAll('\\', '/'));
      }
    }
    for (const name of existing) {
      if (!managed.has(name)) unmanaged.push(path.join(mirror, name).replaceAll('\\', '/'));
    }
  }
  return { missing: missing.sort(), drifted: drifted.sort(), unmanaged: unmanaged.sort() };
}

export async function verifySources(root, options) {
  const diff = await diffSources(root, options);
  return { ok: diff.missing.length === 0 && diff.drifted.length === 0 && diff.unmanaged.length === 0, ...diff };
}

export async function syncSources(root, { mirrors, prune = false, dryRun = false }) {
  const lock = await lockFile(root);
  const before = await diffSources(root, { mirrors });
  const unsupported = Object.entries(lock.skills ?? {})
    .filter(([, entry]) => entry.sourceType && entry.sourceType !== 'local')
    .map(([name]) => name);
  if (dryRun) return { ok: true, dryRun: true, diff: before, unsupported };
  if (unsupported.length) throw new Error(`Unsupported non-local sources: ${unsupported.join(', ')}`);
  await verifyIntegrity(root, lock);
  return sourceTransaction(root, lock, { mirrors, prune, before });
}

async function sourceTransaction(root, lock, { mirrors, prune = false, before, writeLock = false }) {
  const managedPaths = mirrors.flatMap(mirror => Object.keys(lock.skills ?? {}).map(name => path.join(mirror, name)));
  const prunePaths = prune ? before.unmanaged : [];
  return runMigration({
    root,
    id: `sources-sync-${Date.now()}`,
    paths: [...(writeLock ? ['skills-lock.json'] : []), ...managedPaths, ...prunePaths],
    preflight: async () => true,
    apply: async () => {
      if (writeLock) {
        await writeFile(path.join(root, 'skills-lock.json'), `${JSON.stringify(lock, null, 2)}\n`);
      }
      for (const mirror of mirrors) {
        for (const [name, entry] of Object.entries(lock.skills ?? {})) {
          const target = path.join(root, mirror, name);
          await rm(target, { recursive: true, force: true });
          await mkdir(path.dirname(target), { recursive: true });
          await cp(path.join(root, sourcePath(entry)), target, { recursive: true });
        }
      }
      for (const relative of prunePaths) await rm(path.join(root, relative), { recursive: true, force: true });
    },
    verify: async () => {
      await verifyIntegrity(root, lock);
      const after = await diffSources(root, { mirrors });
      if (after.missing.length || after.drifted.length || (prune && after.unmanaged.length)) {
        throw new Error('Source mirror verification failed');
      }
    }
  });
}

export async function updateSources(root, name, updates, options) {
  const lock = await lockFile(root);
  if (!lock.skills?.[name]) throw new Error(`Unknown source: ${name}`);
  const next = structuredClone(lock);
  next.skills[name] = { ...next.skills[name], ...updates };
  const unsupported = Object.entries(next.skills ?? {})
    .filter(([, entry]) => entry.sourceType && entry.sourceType !== 'local')
    .map(([sourceName]) => sourceName);
  if (unsupported.length) throw new Error(`Unsupported non-local sources: ${unsupported.join(', ')}`);
  await verifyIntegrity(root, next);
  const before = await diffSources(root, options);
  return sourceTransaction(root, next, { ...options, before, writeLock: true });
}

async function verifyIntegrity(root, lock) {
  for (const [name, entry] of Object.entries(lock.skills ?? {})) {
    const actual = await hashDirectory(path.join(root, sourcePath(entry)));
    if (actual !== entry.computedHash) throw new Error(`Source integrity mismatch: ${name}`);
  }
  return true;
}

function sourcePath(entry) {
  const value = entry.source ?? entry.skillPath;
  if (!value || path.isAbsolute(value) || value.split(/[\\/]/).includes('..')) throw new Error('Invalid local source path');
  return value;
}

async function lockFile(root) {
  return JSON.parse(await readFile(path.join(root, 'skills-lock.json'), 'utf8'));
}

async function names(root) {
  try {
    return (await readdir(root, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function files(root, prefix = '') {
  const result = [];
  for (const entry of (await readdir(path.join(root, prefix), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) result.push(...await files(root, relative));
    else if (entry.isFile()) result.push(relative);
  }
  return result;
}
