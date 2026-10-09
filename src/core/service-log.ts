import type { FileHandle } from "node:fs/promises";
import { posix } from "node:path";
import { BYTES_PER_MEBIBYTE } from "./numbers";
import { NEWLINE, readAt, withExistingFile } from "./store/fs-utils";

export const SERVICE_LOG_LIMIT_BYTES = BYTES_PER_MEBIBYTE;
export const SERVICE_LOG_KEPT_BYTES = 256 * 1024;

export function launchdLogPath(home: string): string {
  return posix.join(home, "Library/Logs/p-backlog.log");
}

export function serviceLogToTrim(platform: NodeJS.Platform, home: string): string | null {
  // On Windows cmd's >> redirection holds the log open while the server runs; the startup script rotates it before launch instead.
  return platform === "darwin" ? launchdLogPath(home) : null;
}

export async function trimLogFile(path: string, limitBytes: number, keptBytes: number): Promise<boolean> {
  return (await withExistingFile(path, (handle) => trimOpenLog(handle, limitBytes, keptBytes), "r+")) ?? false;
}

async function trimOpenLog(handle: FileHandle, limitBytes: number, keptBytes: number): Promise<boolean> {
  const { size } = await handle.stat();
  if (size <= limitBytes) return false;
  const tail = await readAt(handle, size - keptBytes, keptBytes);
  const newlineAt = tail.indexOf(NEWLINE);
  const kept = newlineAt === -1 ? Buffer.alloc(0) : tail.subarray(newlineAt + 1);
  await handle.write(kept, 0, kept.length, 0);
  await handle.truncate(kept.length);
  return true;
}
