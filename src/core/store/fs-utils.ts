import { createHash } from "node:crypto";
import { constants, readFileSync, realpathSync, type Dirent, type Stats } from "node:fs";
import { access, lstat, open, readdir, readFile, readlink, rm, stat, type FileHandle } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { hasAnyErrorCode, hasErrorCode, type PathErrorHandler } from "../errors";
import { sum } from "../numbers";

export function contentVersion(text: string): string {
  return createHash("sha1").update(text).digest("hex");
}

export const EMPTY_FINGERPRINT = createHash("sha1").digest("hex");

export async function readTextOrNull(path: string): Promise<string | null> {
  return (await readBytesOrNull(path))?.toString("utf8") ?? null;
}

export async function readTextIfFile(path: string): Promise<string | null> {
  try {
    return await readTextOrNull(path);
  } catch (error) {
    if (hasErrorCode(error, "EISDIR")) return null;
    throw error;
  }
}

export async function attemptReportingFailure<T>(path: string, attempt: (path: string) => Promise<T>, onError: PathErrorHandler): Promise<T | null> {
  try {
    return await attempt(path);
  } catch (error) {
    onError(path, error);
    return null;
  }
}

export function attemptReportingFailureSync<T>(path: string, attempt: (path: string) => T, onError: PathErrorHandler): T | null {
  try {
    return attempt(path);
  } catch (error) {
    onError(path, error);
    return null;
  }
}

const NO_FILE_CODES = ["ENOENT", "ENOTDIR"];
const NO_LINK_CODES = [...NO_FILE_CODES, "EINVAL"];

function isNoFile(error: unknown): boolean {
  return hasAnyErrorCode(error, NO_FILE_CODES);
}

async function nullWhenMissing<T>(work: Promise<T>, missingCodes = NO_FILE_CODES): Promise<T | null> {
  try {
    return await work;
  } catch (error) {
    if (hasAnyErrorCode(error, missingCodes)) return null;
    throw error;
  }
}

export function readBytesOrNull(path: string): Promise<Buffer | null> {
  return nullWhenMissing(readFile(path));
}

export function statOrNull(path: string): Promise<Stats | null> {
  return nullWhenMissing(stat(path));
}

export function lstatOrNull(path: string): Promise<Stats | null> {
  return nullWhenMissing(lstat(path));
}

export function linkTargetOrNull(path: string): Promise<string | null> {
  return nullWhenMissing(readlink(path), NO_LINK_CODES);
}

function nullWhenMissingSync<T>(read: () => T): T | null {
  try {
    return read();
  } catch (error) {
    if (isNoFile(error)) return null;
    throw error;
  }
}

export function realpathOrNull(path: string): string | null {
  return nullWhenMissingSync(() => realpathSync.native(path));
}

export function readBytesOrNullSync(path: string): Buffer | null {
  return nullWhenMissingSync(() => readFileSync(path));
}

export const NEWLINE = 0x0a;

type FileOpening = { flags?: "r" | "r+" | "w" | "a" | "a+"; mode?: number | undefined };

export async function withFile<T>(path: string, use: (handle: FileHandle) => Promise<T>, { flags = "r", mode }: FileOpening = {}): Promise<T> {
  return closingAfter(await open(path, flags, mode), use);
}

export async function fileExists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    (error: unknown) => {
      if (isNoFile(error)) return false;
      throw error;
    },
  );
}

export async function withExistingFile<T>(path: string, use: (handle: FileHandle) => Promise<T>, { flags = "r" }: Pick<FileOpening, "flags"> = {}): Promise<T | null> {
  const handle = await nullWhenMissing(open(path, flags));
  return handle === null ? null : closingAfter(handle, use);
}

async function closingAfter<T>(handle: FileHandle, use: (handle: FileHandle) => Promise<T>): Promise<T> {
  try {
    return await use(handle);
  } finally {
    await handle.close();
  }
}

export async function readAt(handle: FileHandle, position: number, length: number): Promise<Buffer> {
  const buffer = Buffer.alloc(length);
  const { bytesRead } = await handle.read(buffer, 0, length, position);
  return buffer.subarray(0, bytesRead);
}

export function readFileAt(path: string, position: number, length: number): Promise<Buffer> {
  return withFile(path, (handle) => readAt(handle, position, length));
}

type RemovalOutcome = "removed" | "already-gone" | "changed";

export async function removeIfUnchanged(path: string, version: string): Promise<RemovalOutcome> {
  const text = await readTextOrNull(path);
  if (text === null) return "already-gone";
  if (contentVersion(text) !== version) return "changed";
  await rm(path, { force: true });
  return "removed";
}

export async function listDir(path: string, { recursive = false }: { recursive?: boolean } = {}): Promise<Dirent[]> {
  try {
    return await readdir(path, { withFileTypes: true, recursive });
  } catch (error) {
    // readdir also reports a file at `path` itself as ENOTDIR, and that must stay an error.
    if (hasErrorCode(error, "ENOENT")) return [];
    throw error;
  }
}

type EntryKind = "file" | "directory" | "link-unreachable" | "other";

export type ListedEntry = { name: string; kind: EntryKind };

export async function listDirFollowingLinks(path: string): Promise<ListedEntry[]> {
  return Promise.all((await listDir(path)).map(async (entry) => ({ name: entry.name, kind: await kindFollowingLink(entry) })));
}

const UNREACHABLE_LINK_CODES = [...NO_FILE_CODES, "ELOOP", "EACCES", "EPERM"];

async function kindFollowingLink(entry: Dirent): Promise<EntryKind> {
  if (!entry.isSymbolicLink()) return kindOf(entry);
  const path = join(entry.parentPath, entry.name);
  try {
    const target = await stat(path);
    await access(path, target.isDirectory() ? constants.R_OK | constants.X_OK : constants.R_OK);
    return kindOf(target);
  } catch (error) {
    if (hasAnyErrorCode(error, UNREACHABLE_LINK_CODES)) return "link-unreachable";
    throw error;
  }
}

function kindOf(entry: Dirent | Stats): EntryKind {
  if (entry.isFile()) return "file";
  return entry.isDirectory() ? "directory" : "other";
}

const BLOCKED_RETRY_DELAYS_MS = [10, 20, 40, 80, 160, 320, 640, 1000, 1000, 1000, 1000];

export const BLOCKED_RETRIES_TOTAL_MS = sum(BLOCKED_RETRY_DELAYS_MS);
const BLOCKED_CODES = ["EPERM", "EACCES", "EBUSY"];

// Windows refuses to rename over or unlink a file while another handle (a watcher's read, antivirus) keeps it open.
export async function retryWhileBlockedOnWindows<T>(attempt: () => Promise<T>): Promise<T> {
  if (!onWindows()) return attempt();
  for (const delayMs of BLOCKED_RETRY_DELAYS_MS) {
    try {
      return await attempt();
    } catch (error) {
      if (!blockedOnWindows(error)) throw error;
      await sleep(delayMs);
    }
  }
  return attempt();
}

export function blockedOnWindows(error: unknown): boolean {
  return onWindows() && hasAnyErrorCode(error, BLOCKED_CODES);
}

export function onWindows(): boolean {
  // eslint-disable-next-line no-restricted-properties -- blocked renames and unlinks retry and directories skip fsync by the running OS, not by a caller
  return process.platform === "win32";
}
