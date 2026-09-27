import { open } from "node:fs/promises";
import { posix } from "node:path";
import { hasErrorCode } from "./errors";
import { readAt } from "./store/fs-utils";

export const SERVICE_LOG_LIMIT_BYTES = 1024 * 1024;
export const SERVICE_LOG_KEPT_BYTES = 256 * 1024;

export function launchdLogPath(home: string): string {
  return posix.join(home, "Library/Logs/p-backlog.log");
}

export function serviceLogToTrim(platform: NodeJS.Platform, home: string): string | null {
  // Windows service log is written via a positional handle, not append mode — truncating it would leave a zero-filled gap (PB-186).
  return platform === "darwin" ? launchdLogPath(home) : null;
}

export async function trimLogFile(path: string, limitBytes: number, keptBytes: number): Promise<boolean> {
  const handle = await open(path, "r+").catch((error: unknown) => {
    if (hasErrorCode(error, "ENOENT")) return null;
    throw error;
  });
  if (handle === null) return false;
  try {
    const { size } = await handle.stat();
    if (size <= limitBytes) return false;
    const tail = await readAt(handle, size - keptBytes, keptBytes);
    const newlineAt = tail.indexOf(0x0a);
    const kept = newlineAt === -1 ? Buffer.alloc(0) : tail.subarray(newlineAt + 1);
    await handle.write(kept, 0, kept.length, 0);
    await handle.truncate(kept.length);
    return true;
  } finally {
    await handle.close();
  }
}
