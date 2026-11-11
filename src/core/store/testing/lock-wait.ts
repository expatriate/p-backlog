import type * as FileLock from "../file-lock";

export const SHORT_LOCK_WAIT: FileLock.LockOptions = { waitLimitMs: 50 };

export function fileLockWithShortWait(actual: typeof FileLock): typeof FileLock {
  return {
    ...actual,
    withWriteLock: (path, action, options) => actual.withWriteLock(path, action, { ...SHORT_LOCK_WAIT, ...options }),
    withAvailableLocks: (paths, action, options) => actual.withAvailableLocks(paths, action, { ...SHORT_LOCK_WAIT, ...options }),
  };
}
