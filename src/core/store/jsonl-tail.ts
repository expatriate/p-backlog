import { createHash } from "node:crypto";
import type { FileHandle } from "node:fs/promises";
import type { z } from "zod";
import { parseJsonLines, readAt, withExistingFile, type JsonLines } from "./fs-utils";

type TailRead<T> = JsonLines<T> & { length: number; generation: number };

export type JsonlTail<T> = { read: () => Promise<TailRead<T>> };

const HEAD_FINGERPRINT_BYTES = 4096;
const NEWLINE = 0x0a;
const EMPTY_FINGERPRINT = createHash("sha1").digest("hex");

type TailState<T> = { offset: number; headFingerprint: string; values: T[]; invalidLines: number };

type Pending<T> = JsonLines<T> & { bytes: number };

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
    const pending = await withExistingFile(path, consumeNew);
    if (pending === null) restart();
    const { values, invalidLines, bytes } = pending ?? nothingPending();
    return { values: [...state.values, ...values], invalidLines: state.invalidLines + invalidLines, length: state.offset + bytes, generation };
  }

  async function consumeNew(handle: FileHandle): Promise<Pending<T>> {
    const { size } = await handle.stat();
    if (size < state.offset || !(await headMatches(handle))) restart();
    return size > state.offset ? consumeUpTo(handle, size) : nothingPending();
  }

  function restart(): void {
    if (state.offset === 0) return;
    generation += 1;
    state = emptyState();
  }

  async function headMatches(handle: FileHandle): Promise<boolean> {
    if (state.offset === 0) return true;
    return (await headFingerprintAt(handle, state.offset)) === state.headFingerprint;
  }

  async function consumeUpTo(handle: FileHandle, size: number): Promise<Pending<T>> {
    const chunk = await readAt(handle, state.offset, size - state.offset);
    const completeLength = chunk.lastIndexOf(NEWLINE) + 1;
    if (completeLength > 0) {
      const parsed = parseJsonLines(chunk.subarray(0, completeLength).toString("utf8"), schema);
      const offset = state.offset + completeLength;
      state = { offset, headFingerprint: await headFingerprintAt(handle, offset), values: [...state.values, ...parsed.values], invalidLines: state.invalidLines + parsed.invalidLines };
    }
    const pending = chunk.subarray(completeLength);
    return { ...parseJsonLines(pending.toString("utf8"), schema), bytes: pending.length };
  }

  return { read };
}

function emptyState<T>(): TailState<T> {
  return { offset: 0, headFingerprint: EMPTY_FINGERPRINT, values: [], invalidLines: 0 };
}

function nothingPending<T>(): Pending<T> {
  return { values: [], invalidLines: 0, bytes: 0 };
}

async function headFingerprintAt(handle: FileHandle, offset: number): Promise<string> {
  const length = Math.min(offset, HEAD_FINGERPRINT_BYTES);
  if (length === 0) return EMPTY_FINGERPRINT;
  return createHash("sha1").update(await readAt(handle, 0, length)).digest("hex");
}
