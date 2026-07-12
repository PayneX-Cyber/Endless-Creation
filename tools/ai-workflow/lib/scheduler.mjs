import { appendFile, mkdir, open, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
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
  const create = enqueueTail.then(async () => {
    const queueDir = path.join(stateDir, 'queue');
    await mkdir(queueDir, { recursive: true });
    const id = await nextSequence(stateDir);
    const name = `${String(id).padStart(16, '0')}-${process.pid}.json`;
    const ticket = path.join(queueDir, name);
    await writeFile(ticket, JSON.stringify({ pid: process.pid, createdAt }), { flag: 'wx' });
    return ticket;
  });
  enqueueTail = create.catch(() => {});
  return create;
}

async function nextSequence(stateDir) {
  const lockPath = path.join(stateDir, 'queue-sequence.lock');
  const valuePath = path.join(stateDir, 'queue-sequence');
  while (true) {
    try {
      const handle = await open(lockPath, 'wx');
      try {
        let current = 0;
        try {
          current = Number(await readFile(valuePath, 'utf8')) || 0;
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
        await writeFile(valuePath, String(current + 1));
        return current;
      } finally {
        await handle.close();
        await rm(lockPath, { force: true });
      }
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      await sleep(5);
    }
  }
}

export async function withWriterLock({ stateDir, staleMs = 30_000 }, operation) {
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

export async function maintainScheduler({ stateDir, staleMs = 30_000 }) {
  const queueDir = path.join(stateDir, 'queue');
  await mkdir(queueDir, { recursive: true });
  await removeStaleTickets(queueDir, null, stateDir, staleMs);
  await recoverStale(path.join(stateDir, 'writer.lock'), stateDir, staleMs);
  return { ok: true };
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
