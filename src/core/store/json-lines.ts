import type { z } from "zod";
import { NEWLINE, parseJson, readAt, readTextOrNull, withFile } from "./fs-utils";

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

export async function appendJsonLines(path: string, values: readonly unknown[]): Promise<void> {
  await withFile(
    path,
    async (handle) => {
      const { size } = await handle.stat();
      const endsMidLine = size > 0 && (await readAt(handle, size - 1, 1))[0] !== NEWLINE;
      await handle.appendFile((endsMidLine ? "\n" : "") + toJsonLines(values), "utf8");
      await handle.sync();
    },
    { flags: "a+" },
  );
}
