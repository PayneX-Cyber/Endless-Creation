import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { exec, git, runtimeDir } from './core.mjs';

const secretPatterns = [
  /\b(?:OPENAI_)?API_KEY\s*=\s*\S+/i,
  /\bsk-[A-Za-z0-9_-]{20,}\b/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/
];

export async function createHandoff({ root, mode }) {
  if (!['session', 'staged'].includes(mode)) throw new Error(`Unknown handoff mode: ${mode}`);
  const args = mode === 'staged'
    ? ['diff', '--cached', '--binary', '--full-index']
    : ['diff', 'HEAD', '--binary', '--full-index'];
  const patch = (await exec('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 })).stdout;
  if (secretPatterns.some(pattern => pattern.test(patch))) throw new Error('Suspected secret in handoff input');

  const facts = await repositoryFacts(root);
  const id = `${Date.now()}-${process.pid}`;
  const bundle = path.join(await runtimeDir(root), 'handoffs', id);
  await mkdir(bundle, { recursive: true });
  const manifest = {
    version: 1,
    mode,
    sourceRoot: path.resolve(root),
    ...facts,
    patchSha256: createHash('sha256').update(patch).digest('hex'),
    createdAt: new Date().toISOString()
  };
  const lines = patch.split(/\r?\n/);
  const truncated = lines.length > 2000;
  const context = [
    `# Handoff (${mode})`,
    '',
    `HEAD: ${facts.head}`,
    `Index tree: ${facts.indexTree}`,
    '',
    '```diff',
    ...lines.slice(0, 2000),
    '```',
    ...(truncated ? ['', '[Diff truncated, see manifest for details]'] : [])
  ].join('\n');
  await writeFile(path.join(bundle, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(path.join(bundle, 'context.md'), `${context}\n`);
  if (mode === 'staged') await writeFile(path.join(bundle, 'changes.patch'), patch);
  return bundle;
}

export async function inspectHandoff(bundle, { root, receiving = false } = {}) {
  const manifest = JSON.parse(await readFile(path.join(bundle, 'manifest.json'), 'utf8'));
  const current = await repositoryFacts(root ?? manifest.sourceRoot);
  const stale = current.head !== manifest.head
    || current.indexTree !== (receiving ? manifest.headTree : manifest.indexTree)
    || current.openSpecPhase !== manifest.openSpecPhase;
  return { stale, manifest, current };
}

export async function applyHandoff(bundle, { root, apply = false }) {
  const inspected = await inspectHandoff(bundle, { root, receiving: true });
  if (inspected.stale) throw new Error('Handoff is stale');
  if (!apply) return { applied: false, stale: false };
  const patch = path.join(bundle, 'changes.patch');
  const content = await readFile(patch);
  const checksum = createHash('sha256').update(content).digest('hex');
  if (checksum !== inspected.manifest.patchSha256) throw new Error('Handoff patch checksum mismatch');
  await exec('git', ['apply', '--binary', patch], { cwd: root });
  return { applied: true, stale: false };
}

async function repositoryFacts(root) {
  return {
    head: await git(root, 'rev-parse', 'HEAD'),
    headTree: await git(root, 'rev-parse', 'HEAD^{tree}'),
    indexTree: await git(root, 'write-tree'),
    openSpecPhase: await readPhase(root)
  };
}

async function readPhase(root) {
  try {
    const changes = path.join(root, 'openspec', 'changes');
    for (const name of (await readdir(changes)).sort()) {
      try {
        const text = await readFile(path.join(changes, name, '.comet.yaml'), 'utf8');
        const phase = text.match(/^phase:\s*(.+)$/m)?.[1].trim();
        if (phase) return `${name}:${phase}`;
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    return null;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}
