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

export async function withFileLock<T>(path: string, action: () => Promise<T>): Promise<T> {
  const lock = join(dirname(path), `.${basename(path)}.lock`);
  const token = `${process.pid} ${randomUUID()}`;
  await acquire(lock, path, token);
  try {
    return await action();
  } finally {
    await releaseOwn(lock, token);
  }
}

export async function withFileLocks<T>(paths: readonly string[], action: () => Promise<T>): Promise<T> {
  const [first, ...rest] = [...paths].sort();
  return first === undefined ? action() : withFileLock(first, () => withFileLocks(rest, action));
}

async function acquire(lock: string, path: string, token: string): Promise<void> {
  const giveUpAt = Date.now() + WAIT_LIMIT_MS;
  for (;;) {
    if (await tryCreate(lock, token)) return;
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

async function releaseOwn(lock: string, token: string): Promise<void> {
  if ((await readTextOrNull(lock)) === token) await rm(lock, { force: true });
}
