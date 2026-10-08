import { createHash, randomUUID } from "node:crypto";
import type { Dirent } from "node:fs";
import { access, appendFile, chmod, link, open, readdir, readFile, rename, rm, stat, writeFile, type FileHandle } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import type { z } from "zod";
import { hasErrorCode } from "../errors";

export function contentVersion(text: string): string {
  return createHash("sha1").update(text).digest("hex");
}

export const EMPTY_FINGERPRINT = createHash("sha1").digest("hex");

export async function readTextOrNull(path: string): Promise<string | null> {
  return (await readBytesOrNull(path))?.toString("utf8") ?? null;
}

export async function readBytesOrNull(path: string): Promise<Buffer | null> {
  try {
    return await readFile(path);
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) return null;
    throw error;
  }
}

export type JsonLines<T> = { values: readonly T[]; invalidLines: number };

export function parseJsonLines<T>(text: string, schema: z.ZodType<T>): JsonLines<T> {
  const parsed = text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => parseJson(line, schema));
  const values = parsed.filter((value): value is T => value !== null);
  return { values, invalidLines: parsed.length - values.length };
}

export async function readJsonLines<T>(path: string, schema: z.ZodType<T>): Promise<JsonLines<T>> {
  const text = (await readTextOrNull(path)) ?? "";
  return parseJsonLines(text, schema);
}

export function toJsonLines(values: readonly unknown[]): string {
  return values.map((value) => `${JSON.stringify(value)}\n`).join("");
}

export const NEWLINE = 0x0a;

export async function appendJsonLines(path: string, values: readonly unknown[]): Promise<void> {
  await withFile(
    path,
    async (handle) => {
      const { size } = await handle.stat();
      const endsMidLine = size > 0 && (await readAt(handle, size - 1, 1))[0] !== NEWLINE;
      await handle.appendFile((endsMidLine ? "\n" : "") + toJsonLines(values), "utf8");
    },
    "a+",
  );
}

export async function withFile<T>(path: string, use: (handle: FileHandle) => Promise<T>, flags = "r"): Promise<T> {
  return closingAfter(await open(path, flags), use);
}

export async function fileExists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    (error: unknown) => {
      if (hasErrorCode(error, "ENOENT")) return false;
      throw error;
    },
  );
}

export async function withExistingFile<T>(path: string, use: (handle: FileHandle) => Promise<T>, flags = "r"): Promise<T | null> {
  const handle = await open(path, flags).catch((error: unknown) => {
    if (hasErrorCode(error, "ENOENT")) return null;
    throw error;
  });
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
  } catch {
    return null;
  }
}

export async function readJsonFile<T>(path: string, schema: z.ZodType<T>): Promise<T | null> {
  const text = await readTextOrNull(path);
  return text === null ? null : parseJson(text, schema);
}

export async function writeJsonFile(path: string, value: unknown): Promise<void> {
  await writeFileAtomic(path, `${JSON.stringify(value, null, 2)}\n`);
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
    if (hasErrorCode(error, "ENOENT")) return [];
    throw error;
  }
}

const REPLACE_RETRY_DELAYS_MS = [10, 20, 40, 80, 160, 320, 640, 1000, 1000, 1000, 1000];
const REPLACE_BLOCKED_CODES = ["EPERM", "EACCES", "EBUSY"];

export async function writeFileAtomic(path: string, content: string, mode?: number): Promise<void> {
  await viaTemporaryFile(path, content, (temporary) => replaceFile(temporary, path), mode);
}

export async function replacePrefixAtomic(path: string, prefix: Buffer, content: string): Promise<boolean> {
  let seen = prefix;
  const carryAppended = async (temporary: string): Promise<boolean> => {
    const live = (await readBytesOrNull(path)) ?? Buffer.alloc(0);
    if (!startsWithBytes(live, seen)) return false;
    await appendFile(temporary, live.subarray(seen.length));
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
  if (process.platform !== "win32") return attempt();
  for (const delayMs of REPLACE_RETRY_DELAYS_MS) {
    try {
      return await attempt();
    } catch (error) {
      if (!REPLACE_BLOCKED_CODES.some((code) => hasErrorCode(error, code))) throw error;
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
    const modified = await stat(path).then(
      ({ mtimeMs }) => mtimeMs,
      () => null,
    );
    if (modified !== null && modified < cutoff.getTime()) await rm(path, { force: true });
  }
}

export function temporaryPathFor(path: string): string {
  return join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
}

async function viaTemporaryFile<T>(path: string, content: string, publish: (temporary: string) => Promise<T>, mode?: number): Promise<T> {
  const temporary = temporaryPathFor(path);
  try {
    await writeFile(temporary, content, { encoding: "utf8", mode });
    if (mode !== undefined) await chmod(temporary, mode);
    return await publish(temporary);
  } finally {
    await rm(temporary, { force: true });
  }
}
