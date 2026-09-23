export const MEMORY_SAMPLE_INTERVAL_MS = 5000;
export const MEMORY_HISTORY_MS = 60 * 60 * 1000;
export const MEMORY_HISTORY_PERIOD = "за час";

export function megabytesOf(bytes: number): number {
  return Math.round((bytes / 1024 / 1024) * 10) / 10;
}
