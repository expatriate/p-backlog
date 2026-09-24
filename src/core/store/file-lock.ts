import { randomUUID } from "node:crypto";
import { rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { hasErrorCode, readTextOrNull } from "./fs-utils";

const RETRY_MS = 10;
const WAIT_LIMIT_MS = 5_000;
const ABANDONED_AFTER_MS = 30_000;

export class FileBusyError extends Error {
  constructor(
    readonly path: string,
    readonly lock: string,
    readonly seconds: number,
  ) {
    super(`${path} is locked: ${lock}`);
    this.name = "FileBusyError";
  }
}

type HeldLock = { path: string; lock: string; token: string };

export async function withFileLock<T>(path: string, action: () => Promise<T>): Promise<T> {
  const held = await acquire(path);
  try {
    return await action();
  } finally {
    await release(held);
  }
}

export async function withAvailableLocks<T>(paths: readonly string[], action: (locked: ReadonlySet<string>) => Promise<T>): Promise<T> {
  const held: HeldLock[] = [];
  try {
    for (const path of [...paths].sort()) {
      try {
        held.push(await acquire(path));
      } catch (error) {
        if (!(error instanceof FileBusyError)) throw error;
      }
    }
    return await action(new Set(held.map(({ path }) => path)));
  } finally {
    for (const lock of held) await release(lock);
  }
}

async function acquire(path: string): Promise<HeldLock> {
  const lock = join(dirname(path), `.${basename(path)}.lock`);
  const token = `${process.pid} ${randomUUID()}`;
  const giveUpAt = Date.now() + WAIT_LIMIT_MS;
  for (;;) {
    if (await tryCreate(lock, token)) return { path, lock, token };
    const abandoned = await abandonedToken(lock);
    if (abandoned !== null && (await breakAbandoned(lock, abandoned))) continue;
    if (Date.now() > giveUpAt) throw new FileBusyError(path, lock, WAIT_LIMIT_MS / 1000);
    await sleep(RETRY_MS);
  }
}

async function tryCreate(lock: string, token: string): Promise<boolean> {
  try {
    await writeFile(lock, token, { flag: "wx" });
    return true;
  } catch (error) {
    if (hasErrorCode(error, "EEXIST")) return false;
    throw error;
  }
}

async function abandonedToken(lock: string): Promise<string | null> {
  const token = await readTextOrNull(lock);
  try {
    return token !== null && Date.now() - (await stat(lock)).mtimeMs > ABANDONED_AFTER_MS ? token : null;
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) return null;
    throw error;
  }
}

async function breakAbandoned(lock: string, abandoned: string): Promise<boolean> {
  const breaker = `${lock}.break`;
  if (!(await tryCreate(breaker, abandoned))) {
    if ((await abandonedToken(breaker)) !== null) await rm(breaker, { force: true });
    return false;
  }
  try {
    if ((await abandonedToken(lock)) === abandoned) await rm(lock, { force: true });
    return true;
  } finally {
    await rm(breaker, { force: true });
  }
}

async function release({ lock, token }: HeldLock): Promise<void> {
  if ((await readTextOrNull(lock)) === token) await rm(lock, { force: true });
}
