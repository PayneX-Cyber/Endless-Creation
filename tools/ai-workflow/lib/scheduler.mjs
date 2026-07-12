import { appendFile, mkdir, open, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let sequence = 0;
let enqueueTail = Promise.resolve();

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function enqueue({ stateDir }) {
  const createdAt = Date.now();
  const id = sequence++;
  const create = enqueueTail.then(async () => {
    const queueDir = path.join(stateDir, 'queue');
    await mkdir(queueDir, { recursive: true });
    const name = `${createdAt.toString().padStart(16, '0')}-${String(id).padStart(8, '0')}-${process.pid}.json`;
    const ticket = path.join(queueDir, name);
    await writeFile(ticket, JSON.stringify({ pid: process.pid, createdAt }), { flag: 'wx' });
    return ticket;
  });
  enqueueTail = create.catch(() => {});
  return create;
}

export async function withWriterLock({ stateDir, staleMs = 30_000 }, operation) {
  await mkdir(stateDir, { recursive: true });
  const ticket = await enqueue({ stateDir });
  const queueDir = path.dirname(ticket);
  const lockPath = path.join(stateDir, 'writer.lock');
  let heartbeat;
  try {
    while (true) {
      await removeStaleTickets(queueDir, ticket, stateDir, staleMs);
      const tickets = (await readdir(queueDir)).sort();
      if (path.basename(ticket) !== tickets[0]) {
        await sleep(10);
        continue;
      }
      try {
        const handle = await open(lockPath, 'wx');
        await handle.writeFile(JSON.stringify({ pid: process.pid, heartbeatAt: Date.now() }));
        await handle.close();
        break;
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        await recoverStale(lockPath, stateDir, staleMs);
        await sleep(10);
      }
    }
    const beat = async () => writeFile(lockPath, JSON.stringify({ pid: process.pid, heartbeatAt: Date.now() }));
    heartbeat = setInterval(() => void beat(), Math.max(10, Math.floor(staleMs / 3)));
    return await operation();
  } finally {
    clearInterval(heartbeat);
    await rm(ticket, { force: true });
    await rm(lockPath, { force: true });
  }
}

async function removeStaleTickets(queueDir, ownTicket, stateDir, staleMs) {
  for (const name of await readdir(queueDir)) {
    const candidate = path.join(queueDir, name);
    if (candidate === ownTicket) continue;
    try {
      const value = JSON.parse(await readFile(candidate, 'utf8'));
      if (alive(value.pid) || Date.now() - value.createdAt <= staleMs) continue;
      await rm(candidate, { force: true });
      await appendFile(path.join(stateDir, 'audit.jsonl'), `${JSON.stringify({ event: 'stale-ticket-removed', pid: value.pid, createdAt: new Date().toISOString() })}\n`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}

async function recoverStale(lockPath, stateDir, staleMs) {
  let owner;
  try {
    owner = JSON.parse(await readFile(lockPath, 'utf8'));
  } catch {
    return;
  }
  if (alive(owner.pid) || Date.now() - owner.heartbeatAt <= staleMs) return;
  await rm(lockPath, { force: true });
  await appendFile(path.join(stateDir, 'audit.jsonl'), `${JSON.stringify({ event: 'stale-lock-recovered', pid: owner.pid, createdAt: new Date().toISOString() })}\n`);
}
