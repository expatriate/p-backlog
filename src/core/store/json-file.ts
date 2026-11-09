import type { z } from "zod";
import { writeFileAtomic, type AtomicWriteOptions } from "./atomic-write";
import { readTextOrNull } from "./fs-utils";

export const JSON_INDENT = 2;

export function parseJson<T>(text: string, schema: z.ZodType<T>): T | null {
  try {
    const parsed = schema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

export function jsonFileText(value: unknown): string {
  return `${JSON.stringify(value, null, JSON_INDENT)}\n`;
}

export async function readJsonFile<T>(path: string, schema: z.ZodType<T>): Promise<T | null> {
  const text = await readTextOrNull(path);
  return text === null ? null : parseJson(text, schema);
}

export async function writeJsonFile(path: string, value: unknown, options: AtomicWriteOptions): Promise<void> {
  await writeFileAtomic(path, jsonFileText(value), options);
}
