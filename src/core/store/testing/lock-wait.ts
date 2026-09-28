import { onTestFinished } from "vitest";
import { lockWaitLimit } from "../file-lock";

export function shortenLockWait(ms = 50): void {
  const original = lockWaitLimit.ms;
  lockWaitLimit.ms = ms;
  onTestFinished(() => {
    lockWaitLimit.ms = original;
  });
}
