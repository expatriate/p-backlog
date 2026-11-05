import { createHash } from "node:crypto";
import { readFileSync, realpathSync, type Dirent, type Stats } from "node:fs";
import { access, lstat, open, readdir, readFile, readlink, rm, stat, type FileHandle } from "node:fs/promises";
import type { z } from "zod";
import { hasAnyErrorCode, hasErrorCode, type PathErrorHandler } from "../errors";

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

type FileOpening = { flags?: string; mode?: number | undefined };

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

export function parseJson<T>(text: string, schema: z.ZodType<T>): T | null {
  try {
    const parsed = schema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
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
