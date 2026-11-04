import { randomUUID } from "node:crypto";
import { rm, utimes, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { errorCode, hasErrorCode } from "../errors";
import { SECOND_MS } from "../model/dates";
import { readTextOrNull, statOrNull } from "./fs-utils";

const RETRY_MS = 10;
const ABANDONED_AFTER_MS = 30_000;
const REFRESH_EVERY_MS = ABANDONED_AFTER_MS / 3;
const DEFAULT_WAIT_LIMIT_MS = 5_000;

export type LockOptions = { waitLimitMs?: number | undefined };

export type LockBusy = { path: string; lock: string; seconds: number };

export class FileBusyError extends Error implements LockBusy {
  constructor(
    readonly path: string,
    readonly lock: string,
    readonly seconds: number,
  ) {
    super(`${path} is locked: ${lock}`);
    this.name = "FileBusyError";
  }
}

type HeldLock = { path: string; lock: string; token: string; stopRefreshing: () => Promise<void> };

export async function withFileLock<T>(path: string, action: () => Promise<T>, options: LockOptions = {}): Promise<T> {
  const held = await acquire(path, options);
  try {
    return await action();
  } finally {
    await release(held);
  }
}

export async function withAvailableLocks<T>(paths: readonly string[], action: (locked: ReadonlySet<string>) => Promise<T>, { waitLimitMs = DEFAULT_WAIT_LIMIT_MS }: LockOptions = {}): Promise<T> {
  const held: HeldLock[] = [];
  const giveUpAt = Date.now() + waitLimitMs;
  try {
    for (const path of [...paths].sort()) {
      try {
        held.push(await acquire(path, { waitLimitMs: giveUpAt - Date.now() }));
      } catch (error) {
        if (!(error instanceof FileBusyError)) throw error;
      }
    }
    return await action(new Set(held.map(({ path }) => path)));
  } finally {
    for (const lock of held) await release(lock);
  }
}

async function acquire(path: string, { waitLimitMs = DEFAULT_WAIT_LIMIT_MS }: LockOptions): Promise<HeldLock> {
  const lock = join(dirname(path), `.${basename(path)}.lock`);
  const token = `${process.pid} ${randomUUID()}`;
  const giveUpAt = Date.now() + waitLimitMs;
  for (;;) {
    if (await tryCreate(lock, token)) return { path, lock, token, stopRefreshing: keepRefreshed(lock, token) };
    const abandoned = await abandonedToken(lock);
    if (abandoned !== null && (await breakAbandoned(lock, abandoned))) continue;
    if (Date.now() > giveUpAt) throw new FileBusyError(path, lock, waitLimitMs / SECOND_MS);
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
  if (token === null) return null;
  const info = await statOrNull(lock);
  return info !== null && Date.now() - info.mtimeMs > ABANDONED_AFTER_MS ? token : null;
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

function keepRefreshed(lock: string, token: string): () => Promise<void> {
  let bug: unknown = null;
  let refreshing = Promise.resolve();
  const timer = setInterval(() => {
    refreshing = refreshing
      .then(() => refreshIfHeld(lock, token))
      .catch((error: unknown) => {
        clearInterval(timer);
        if (errorCode(error) === undefined) bug = error;
      });
  }, REFRESH_EVERY_MS);
  timer.unref();
  return async () => {
    clearInterval(timer);
    await refreshing;
    if (bug !== null) throw bug;
  };
}

async function refreshIfHeld(lock: string, token: string): Promise<void> {
  if ((await readTextOrNull(lock)) !== token) return;
  const now = new Date();
  try {
    await utimes(lock, now, now);
  } catch (error) {
    if (!hasErrorCode(error, "ENOENT")) throw error;
  }
}

async function release({ lock, token, stopRefreshing }: HeldLock): Promise<void> {
  await stopRefreshing();
  if ((await readTextOrNull(lock)) === token) await rm(lock, { force: true });
}
