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

export async function writeFileAtomic(path: string, content: string, mode?: number): Promise<void> {
  await viaTemporaryFile(path, content, (temporary) => replaceFile(temporary, path), mode);
}

export async function replacePrefixAtomic(path: string, prefix: Buffer, content: string): Promise<boolean> {
  let seen = prefix;
  const carryAppended = async (temporary: string): Promise<boolean> => {
    const live = (await readBytesOrNull(path)) ?? Buffer.alloc(0);
    if (!startsWithBytes(live, seen)) return false;
    if (live.length > seen.length) await writeSynced(temporary, live.subarray(seen.length), "a");
    seen = live;
    return true;
  };
  return viaTemporaryFile(path, content, (temporary) => replaceFile(temporary, path, () => carryAppended(temporary)));
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
  // eslint-disable-next-line no-restricted-properties -- the retry answers to the running OS, not to a caller
  if (process.platform !== "win32") return attempt();
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
  await viaTemporaryFile(path, content, (temporary) => link(temporary, path));
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

async function viaTemporaryFile<T>(path: string, content: string, publish: (temporary: string) => Promise<T>, mode?: number): Promise<T> {
  const temporary = temporaryPathFor(path);
  try {
    await writeSynced(temporary, content, "w", mode);
    if (mode !== undefined) await chmod(temporary, mode);
    const published = await publish(temporary);
    await syncDirectoryOf(path);
    return published;
  } finally {
    await rm(temporary, { force: true });
  }
}

async function writeSynced(path: string, data: string | Buffer, flags: "w" | "a", mode?: number): Promise<void> {
  await withFile(
    path,
    async (handle) => {
      await handle.writeFile(data, "utf8");
      await handle.sync();
    },
    { flags, mode },
  );
}

// Network and FUSE file systems (SMB, vboxsf) refuse to open or fsync a directory; the file itself is already in place.
const DIRECTORY_SYNC_UNSUPPORTED_CODES = ["EINVAL", "ENOTSUP", "EISDIR", "EACCES", "EPERM"];

async function syncDirectoryOf(path: string): Promise<void> {
  // eslint-disable-next-line no-restricted-properties -- Windows cannot open a directory to fsync it
  if (process.platform === "win32") return;
  try {
    await withFile(dirname(path), (directory) => directory.sync());
  } catch (error) {
    if (!hasAnyErrorCode(error, DIRECTORY_SYNC_UNSUPPORTED_CODES)) throw error;
  }
}
