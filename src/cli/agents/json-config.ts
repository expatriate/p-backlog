import { mkdir, readFile, readlink, realpath, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { z } from "zod";
import { errorCodeOrText, hasErrorCode } from "../../core/errors";
import { writeFileAtomic } from "../../core/store/fs-utils";

const MAX_LINK_HOPS = 40;

export type JsonConfigFailure = { failed: "unreadable"; code: string } | { failed: "invalid" };

type JsonConfigRead<T> = { config: T } | JsonConfigFailure;

export async function readJsonConfig<T>(path: string, schema: z.ZodType<T>): Promise<JsonConfigRead<T>> {
  const text = await readConfigText(path);
  if (typeof text !== "string") return text;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { failed: "invalid" };
  }
  return schema.safeParse(value).success ? { config: value as T } : { failed: "invalid" };
}

export async function writeJsonConfig(path: string, config: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const target = await writeTargetOf(path);
  const mode = await stat(target).then(({ mode }) => mode & 0o777, () => undefined);
  await writeFileAtomic(target, `${JSON.stringify(config, null, 2)}\n`, mode);
}

async function readConfigText(path: string): Promise<string | JsonConfigFailure> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) return "{}";
    return { failed: "unreadable", code: errorCodeOrText(error) };
  }
}

async function writeTargetOf(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) return danglingLinkTarget(path);
    throw error;
  }
}

async function danglingLinkTarget(path: string): Promise<string> {
  let current = path;
  for (let hop = 0; hop < MAX_LINK_HOPS; hop++) {
    const link = await readlink(current).catch(() => null);
    if (link === null) return current;
    current = resolve(dirname(current), link);
  }
  return current;
}
