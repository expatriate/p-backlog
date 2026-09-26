import { createHash, randomUUID } from "node:crypto";
import type { Dirent } from "node:fs";
import { chmod, link, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import type { z } from "zod";
import { hasErrorCode } from "../errors";

export function contentVersion(text: string): string {
  return createHash("sha1").update(text).digest("hex");
}

export async function readTextOrNull(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) return null;
    throw error;
  }
}

export type JsonLines<T> = { values: T[]; invalidLines: number };

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

export async function removeIfUnchanged(path: string, version: string): Promise<boolean> {
  const text = await readTextOrNull(path);
  if (text !== null && contentVersion(text) !== version) return false;
  await rm(path, { force: true });
  return true;
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

// Windows refuses to rename over a file while another handle (a watcher's read, antivirus) keeps it open.
async function replaceFile(temporary: string, path: string): Promise<void> {
  if (process.platform !== "win32") return rename(temporary, path);
  for (const delayMs of REPLACE_RETRY_DELAYS_MS) {
    try {
      return await rename(temporary, path);
    } catch (error) {
      if (!REPLACE_BLOCKED_CODES.some((code) => hasErrorCode(error, code))) throw error;
      await sleep(delayMs);
    }
  }
  await rename(temporary, path);
}

export async function createFileAtomic(path: string, content: string): Promise<void> {
  await viaTemporaryFile(path, content, (temporary) => link(temporary, path));
}

const TEMPORARY_FILE = /^\..+\.[0-9a-f-]{36}\.tmp$/;

export async function removeTemporariesBefore(dir: string, cutoff: Date): Promise<void> {
  for (const entry of await listDir(dir)) {
    if (!entry.isFile() || !TEMPORARY_FILE.test(entry.name)) continue;
    const path = join(dir, entry.name);
    const modified = await stat(path).then(({ mtimeMs }) => mtimeMs, () => null);
    if (modified !== null && modified < cutoff.getTime()) await rm(path, { force: true });
  }
}

export function temporaryPathFor(path: string): string {
  return join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
}

async function viaTemporaryFile(path: string, content: string, publish: (temporary: string) => Promise<void>, mode?: number): Promise<void> {
  const temporary = temporaryPathFor(path);
  try {
    await writeFile(temporary, content, { encoding: "utf8", mode });
    if (mode !== undefined) await chmod(temporary, mode);
    await publish(temporary);
  } finally {
    await rm(temporary, { force: true });
  }
}
