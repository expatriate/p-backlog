import { randomUUID } from "node:crypto";
import { chmod, link, rename, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { hasAnyErrorCode } from "../errors";
import { sum } from "../numbers";
import { listDir, readBytesOrNull, statOrNull, withFile } from "./fs-utils";

const REPLACE_RETRY_DELAYS_MS = [10, 20, 40, 80, 160, 320, 640, 1000, 1000, 1000, 1000];

export const REPLACE_RETRIES_TOTAL_MS = sum(REPLACE_RETRY_DELAYS_MS);
const REPLACE_BLOCKED_CODES = ["EPERM", "EACCES", "EBUSY"];

type AtomicWriteOptions = { mode?: number | undefined; onDirectorySyncError?: ((error: unknown) => void) | undefined };

export async function writeFileAtomic(path: string, content: string, options: AtomicWriteOptions = {}): Promise<void> {
  await viaTemporaryFile(path, content, (temporary) => replaceFile(temporary, path), { ...options, durable: true });
}

export async function writeRecomputableFileAtomic(path: string, content: string): Promise<void> {
  await viaTemporaryFile(path, content, (temporary) => replaceFile(temporary, path), { durable: false });
}

export async function replacePrefixAtomic(path: string, prefix: Buffer, content: string): Promise<boolean> {
  let seen = prefix;
  const carryAppended = async (temporary: string): Promise<boolean> => {
    const live = (await readBytesOrNull(path)) ?? Buffer.alloc(0);
    if (!startsWithBytes(live, seen)) return false;
    if (live.length > seen.length) await writeTemporary(temporary, live.subarray(seen.length), { flags: "a", durable: true });
    seen = live;
    return true;
  };
  return viaTemporaryFile(path, content, (temporary) => replaceFile(temporary, path, () => carryAppended(temporary)), { durable: true });
}

function startsWithBytes(bytes: Buffer, prefix: Buffer): boolean {
  return bytes.length >= prefix.length && bytes.subarray(0, prefix.length).equals(prefix);
}

// Windows refuses to rename over a file while another handle (a watcher's read, antivirus) keeps it open.
async function replaceFile(temporary: string, path: string, prepareRename: () => Promise<boolean> = async () => true): Promise<boolean> {
  const attempt = async (): Promise<boolean> => {
    if (!(await prepareRename())) return false;
    await rename(temporary, path);
    return true;
  };
  if (!onWindows()) return attempt();
  for (const delayMs of REPLACE_RETRY_DELAYS_MS) {
    try {
      return await attempt();
    } catch (error) {
      if (!hasAnyErrorCode(error, REPLACE_BLOCKED_CODES)) throw error;
      await sleep(delayMs);
    }
  }
  return attempt();
}

export async function createFileAtomic(path: string, content: string): Promise<void> {
  await viaTemporaryFile(path, content, (temporary) => link(temporary, path), { durable: true });
}

const TEMPORARY_FILE = /^\..+\.[0-9a-f-]{36}\.tmp$/;

export async function removeTemporariesBefore(dir: string, cutoff: Date): Promise<void> {
  for (const entry of await listDir(dir)) {
    if (!entry.isFile() || !TEMPORARY_FILE.test(entry.name)) continue;
    const path = join(dir, entry.name);
    const info = await statOrNull(path);
    if (info !== null && info.mtimeMs < cutoff.getTime()) await rm(path, { force: true });
  }
}

export function temporaryPathFor(path: string): string {
  return join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
}

type TemporaryWrite = { durable: boolean; mode?: number | undefined };

type PublishOptions = TemporaryWrite & Pick<AtomicWriteOptions, "onDirectorySyncError">;

async function viaTemporaryFile<T>(path: string, content: string, publish: (temporary: string) => Promise<T>, { mode, durable, onDirectorySyncError }: PublishOptions): Promise<T> {
  const temporary = temporaryPathFor(path);
  try {
    await writeTemporary(temporary, content, { flags: "w", mode, durable });
    if (mode !== undefined) await chmod(temporary, mode);
    const published = await publish(temporary);
    if (durable) await syncParentDirectory(path).catch(onDirectorySyncError ?? rethrow);
    return published;
  } finally {
    await rm(temporary, { force: true });
  }
}

async function writeTemporary(path: string, data: string | Buffer, { flags, mode, durable }: TemporaryWrite & { flags: "w" | "a" }): Promise<void> {
  await withFile(
    path,
    async (handle) => {
      await handle.writeFile(data, "utf8");
      if (durable) await handle.sync();
    },
    { flags, mode },
  );
}

// Network and FUSE file systems (SMB, vboxsf) refuse to open or fsync a directory; the file itself is already in place.
const DIRECTORY_SYNC_UNSUPPORTED_CODES = ["EINVAL", "ENOTSUP", "EISDIR", "EACCES", "EPERM"];

export async function syncParentDirectory(path: string): Promise<void> {
  if (onWindows()) return;
  try {
    await withFile(dirname(path), (directory) => directory.sync());
  } catch (error) {
    if (!hasAnyErrorCode(error, DIRECTORY_SYNC_UNSUPPORTED_CODES)) throw error;
  }
}

function rethrow(error: unknown): never {
  throw error;
}

function onWindows(): boolean {
  // eslint-disable-next-line no-restricted-properties -- renames retry and directories skip fsync by the running OS, not by a caller
  return process.platform === "win32";
}
