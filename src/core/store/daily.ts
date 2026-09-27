import { formatLocalIso } from "../model/dates";
import { DAY_MS } from "../model/lifecycle";
import { FileBusyError, withFileLock } from "./file-lock";
import { readTextOrNull, writeFileAtomic } from "./fs-utils";

export async function runWhenDue<T>(stampPath: string, now: Date, action: () => Promise<T>): Promise<T | null> {
  if (!(await isDue(stampPath, now))) return null;
  try {
    return await withFileLock(stampPath, async () => {
      if (!(await isDue(stampPath, now))) return null;
      try {
        return await action();
      } finally {
        await writeFileAtomic(stampPath, `${formatLocalIso(now)}\n`);
      }
    });
  } catch (error) {
    if (error instanceof FileBusyError && error.path === stampPath) return null;
    throw error;
  }
}

async function isDue(stampPath: string, now: Date): Promise<boolean> {
  const stamped = Date.parse((await readTextOrNull(stampPath))?.trim() ?? "");
  return Number.isNaN(stamped) || Math.abs(now.getTime() - stamped) >= DAY_MS;
}
