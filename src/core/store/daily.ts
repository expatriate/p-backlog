import { DAY_MS, formatLocalIso } from "../model/dates";
import { FileBusyError, withWriteLock } from "./file-lock";
import { readTextOrNull } from "./fs-utils";
import { writeFileAtomic, type AfterPublish } from "./atomic-write";
import type { WriteContext } from "./write-context";

export async function runWhenDue<T>(stampPath: string, writes: WriteContext, action: () => Promise<T>): Promise<T | null> {
  if (!(await isDue(stampPath, writes.now))) return null;
  try {
    return await withWriteLock(
      stampPath,
      async (afterPublish) => {
        if (!(await isDue(stampPath, writes.now))) return null;
        return runAndStamp(stampPath, { now: writes.now, ...afterPublish }, action);
      },
      { onErrorAfterPublish: writes.onError },
    );
  } catch (error) {
    if (error instanceof FileBusyError && error.path === stampPath) return null;
    throw error;
  }
}

export async function runAndStamp<T>(stampPath: string, { now, ...afterPublish }: { now: Date } & AfterPublish, action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } finally {
    await writeFileAtomic(stampPath, `${formatLocalIso(now)}\n`, afterPublish);
  }
}

async function isDue(stampPath: string, now: Date): Promise<boolean> {
  const stamped = Date.parse((await readTextOrNull(stampPath))?.trim() ?? "");
  return Number.isNaN(stamped) || Math.abs(now.getTime() - stamped) >= DAY_MS;
}
