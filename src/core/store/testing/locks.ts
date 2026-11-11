import { lockPathOf, withWriteLock, type LockOptions } from "../file-lock";
import { readTextOrNull } from "../fs-utils";
import { failingOnce } from "./fs-failures";
import { failOnPathError } from "./path-errors";

export function withLockFailingOnPathError<T>(path: string, action: () => Promise<T>, options: LockOptions = {}): Promise<T> {
  return withWriteLock(path, action, { ...options, onErrorAfterPublish: failOnPathError });
}

export function failingLockRelease<T>(path: string, action: () => Promise<T>): Promise<T> {
  return failingOnce(readTextOrNull, (target) => target === lockPathOf(path), action);
}
