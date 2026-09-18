import { onTestFinished, vi } from "vitest";

export function freezeDate(iso: string): void {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(iso));
  onTestFinished(() => void vi.useRealTimers());
}
