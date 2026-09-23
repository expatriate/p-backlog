import { rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { hasErrorCode } from "./fs-utils";

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
  await acquire(lock, path);
  try {
    return await action();
  } finally {
    await rm(lock, { force: true });
  }
}

async function acquire(lock: string, path: string): Promise<void> {
  const giveUpAt = Date.now() + WAIT_LIMIT_MS;
  for (;;) {
    if (await tryCreate(lock)) return;
    if (await isAbandoned(lock)) {
      await rm(lock, { force: true });
      continue;
    }
    if (Date.now() > giveUpAt) throw new FileBusyError(path, lock, WAIT_LIMIT_MS / 1000);
    await sleep(RETRY_MS);
  }
}

async function tryCreate(lock: string): Promise<boolean> {
  try {
    await writeFile(lock, String(process.pid), { flag: "wx" });
    return true;
  } catch (error) {
    if (hasErrorCode(error, "EEXIST")) return false;
    throw error;
  }
}

async function isAbandoned(lock: string): Promise<boolean> {
  try {
    return Date.now() - (await stat(lock)).mtimeMs > ABANDONED_AFTER_MS;
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) return false;
    throw error;
  }
}
