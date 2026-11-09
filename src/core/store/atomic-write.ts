import { randomUUID } from "node:crypto";
import { chmod, link, rename, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { hasAnyErrorCode } from "../errors";
import { listDir, onWindows, readBytesOrNull, retryWhileBlockedOnWindows, statOrNull, withFile } from "./fs-utils";

type AfterPublish = { onErrorAfterPublish?: ((error: unknown) => void) | undefined };

type FileMode = { mode?: number | undefined };

type AtomicWriteOptions = AfterPublish & FileMode;

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

async function replaceFile(temporary: string, path: string, prepareRename: () => Promise<boolean> = () => Promise.resolve(true)): Promise<boolean> {
  return retryWhileBlockedOnWindows(async () => {
    if (!(await prepareRename())) return false;
    await rename(temporary, path);
    return true;
  });
}

export async function createFileAtomic(path: string, content: string, options: AfterPublish = {}): Promise<void> {
  await viaTemporaryFile(path, content, (temporary) => link(temporary, path), { ...options, durable: true });
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

type TemporaryWrite = FileMode & { durable: boolean };

type PublishOptions = TemporaryWrite & AfterPublish;

async function viaTemporaryFile<T>(path: string, content: string, publish: (temporary: string) => Promise<T>, { mode, durable, onErrorAfterPublish = rethrow }: PublishOptions): Promise<T> {
  const temporary = temporaryPathFor(path);
  let publishReturned = false;
  try {
    await writeTemporary(temporary, content, { flags: "w", mode, durable });
    if (mode !== undefined) await chmod(temporary, mode);
    const result = await publish(temporary);
    publishReturned = true;
    if (durable) await syncParentDirectory(path).catch(onErrorAfterPublish);
    return result;
  } finally {
    await rm(temporary, { force: true }).catch(publishReturned ? onErrorAfterPublish : keepPublishFailure);
  }
}

function keepPublishFailure(): void {}

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
