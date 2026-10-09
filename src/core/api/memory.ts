import { HOUR_MS } from "../model/dates";
import { BYTES_PER_MEBIBYTE, roundToTenth } from "../numbers";

export const MEMORY_SAMPLE_INTERVAL_MS = 5000;
export const MEMORY_HISTORY_MS = HOUR_MS;

export function megabytesOf(bytes: number): number {
  return roundToTenth(bytes / BYTES_PER_MEBIBYTE);
}
