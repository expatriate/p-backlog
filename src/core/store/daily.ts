import { DAY_MS, formatLocalIso } from "../model/dates";
import { FileBusyError, withFileLock } from "./file-lock";
import { readTextOrNull } from "./fs-utils";
import { writeFileAtomic } from "./atomic-write";
import type { WriteContext } from "./write-context";

export async function runWhenDue<T>(stampPath: string, writes: WriteContext, action: () => Promise<T>): Promise<T | null> {
  if (!(await isDue(stampPath, writes.now))) return null;
  try {
    return await withFileLock(stampPath, async () => {
      if (!(await isDue(stampPath, writes.now))) return null;
      return runAndStamp(stampPath, writes, action);
    });
  } catch (error) {
    if (error instanceof FileBusyError && error.path === stampPath) return null;
    throw error;
  }
}

export async function runAndStamp<T>(stampPath: string, { now, onError }: WriteContext, action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } finally {
    await writeFileAtomic(stampPath, `${formatLocalIso(now)}\n`, { onErrorAfterPublish: onError });
  }
}

async function isDue(stampPath: string, now: Date): Promise<boolean> {
  const stamped = Date.parse((await readTextOrNull(stampPath))?.trim() ?? "");
  return Number.isNaN(stamped) || Math.abs(now.getTime() - stamped) >= DAY_MS;
}
