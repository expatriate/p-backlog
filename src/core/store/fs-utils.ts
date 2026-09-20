import { createHash, randomUUID } from "node:crypto";
import type { Dirent } from "node:fs";
import { readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { z } from "zod";

export function contentVersion(text: string): string {
  return createHash("sha1").update(text).digest("hex");
}

export function hasErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
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

export async function readJsonLines<T>(path: string, schema: z.ZodType<T>): Promise<JsonLines<T>> {
  const text = (await readTextOrNull(path)) ?? "";
  const parsed = text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => parseJson(line, schema));
  const values = parsed.filter((value): value is T => value !== null);
  return { values, invalidLines: parsed.length - values.length };
}

export function parseJson<T>(text: string, schema: z.ZodType<T>): T | null {
  try {
    const parsed = schema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function removeIfUnchanged(path: string, version: string): Promise<boolean> {
  const text = await readTextOrNull(path);
  if (text !== null && contentVersion(text) !== version) return false;
  await rm(path, { force: true });
  return true;
}

export async function listDir(path: string): Promise<Dirent[]> {
  try {
    return await readdir(path, { withFileTypes: true });
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) return [];
    throw error;
  }
}

export async function writeFileAtomic(path: string, content: string): Promise<void> {
  const temporary = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, content, "utf8");
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}
