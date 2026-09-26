import { createHash } from "node:crypto";
import { open, stat, type FileHandle } from "node:fs/promises";
import type { z } from "zod";
import { hasErrorCode } from "../errors";
import { parseJsonLines, type JsonLines } from "./fs-utils";

type TailRead<T> = JsonLines<T> & { length: number; generation: number };

export type JsonlTail<T> = { read: () => Promise<TailRead<T>> };

const HEAD_FINGERPRINT_BYTES = 4096;
const NEWLINE = 0x0a;
const EMPTY_FINGERPRINT = createHash("sha1").digest("hex");

type TailState<T> = { offset: number; headFingerprint: string; values: T[]; invalidLines: number };

export function createJsonlTail<T>(path: string, schema: z.ZodType<T>): JsonlTail<T> {
  let state: TailState<T> = emptyState();
  let generation = 0;
  let queue: Promise<unknown> = Promise.resolve();

  function read(): Promise<TailRead<T>> {
    const result = queue.then(doRead);
    queue = result.catch(() => undefined);
    return result;
  }

  async function doRead(): Promise<TailRead<T>> {
    const size = await sizeOrNull(path);
    if (size === null || size < state.offset || !(await headMatches())) restart();
    if (size !== null && size > state.offset) await appendFrom(size);
    return { values: [...state.values], invalidLines: state.invalidLines, length: state.offset, generation };
  }

  function restart(): void {
    if (state.offset === 0) return;
    generation += 1;
    state = emptyState();
  }

  async function headMatches(): Promise<boolean> {
    if (state.offset === 0) return true;
    return (await headFingerprintAt(state.offset)) === state.headFingerprint;
  }

  async function appendFrom(size: number): Promise<void> {
    const chunk = await readAt(state.offset, size - state.offset);
    const lastNewline = chunk.lastIndexOf(NEWLINE);
    if (lastNewline === -1) return;
    const parsed = parseJsonLines(chunk.subarray(0, lastNewline + 1).toString("utf8"), schema);
    const offset = state.offset + lastNewline + 1;
    state = { offset, headFingerprint: await headFingerprintAt(offset), values: [...state.values, ...parsed.values], invalidLines: state.invalidLines + parsed.invalidLines };
  }

  async function headFingerprintAt(offset: number): Promise<string> {
    const length = Math.min(offset, HEAD_FINGERPRINT_BYTES);
    if (length === 0) return EMPTY_FINGERPRINT;
    return createHash("sha1").update(await readAt(0, length)).digest("hex");
  }

  function readAt(position: number, length: number): Promise<Buffer> {
    return withFile(path, async (handle) => {
      const buffer = Buffer.alloc(length);
      const { bytesRead } = await handle.read(buffer, 0, length, position);
      return buffer.subarray(0, bytesRead);
    });
  }

  return { read };
}

function emptyState<T>(): TailState<T> {
  return { offset: 0, headFingerprint: EMPTY_FINGERPRINT, values: [], invalidLines: 0 };
}

async function sizeOrNull(path: string): Promise<number | null> {
  try {
    return (await stat(path)).size;
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) return null;
    throw error;
  }
}

async function withFile<T>(path: string, use: (handle: FileHandle) => Promise<T>): Promise<T> {
  const handle = await open(path, "r");
  try {
    return await use(handle);
  } finally {
    await handle.close();
  }
}
