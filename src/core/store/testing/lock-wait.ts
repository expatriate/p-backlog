import { onTestFinished } from "vitest";
import { overrideLockWaitLimit } from "../file-lock";

export function shortenLockWait(ms = 50): void {
  onTestFinished(overrideLockWaitLimit(ms));
}
