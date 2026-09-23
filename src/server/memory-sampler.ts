import { MEMORY_HISTORY_MS, MEMORY_SAMPLE_INTERVAL_MS, megabytesOf } from "../core/api/memory";
import { formatLocalIso } from "../core/model/dates";
import type { MemorySample } from "../core/stats/types";

export type MemorySamplerOptions = { intervalMs?: number; capacity?: number; now?: () => Date };

export type MemorySampler = {
  start: () => void;
  stop: () => void;
  sample: () => void;
  samples: () => MemorySample[];
};

const DEFAULT_CAPACITY = MEMORY_HISTORY_MS / MEMORY_SAMPLE_INTERVAL_MS;

export function createMemorySampler({ intervalMs = MEMORY_SAMPLE_INTERVAL_MS, capacity = DEFAULT_CAPACITY, now = () => new Date() }: MemorySamplerOptions = {}): MemorySampler {
  let points: MemorySample[] = [];
  let timer: ReturnType<typeof setInterval> | null = null;

  const sample = (): void => {
    const usage = process.memoryUsage();
    const point: MemorySample = { at: formatLocalIso(now()), rssMb: megabytesOf(usage.rss), heapUsedMb: megabytesOf(usage.heapUsed) };
    points = [...points, point].slice(-capacity);
  };

  return {
    start: () => {
      sample();
      timer = setInterval(sample, intervalMs);
    },
    stop: () => {
      if (timer !== null) clearInterval(timer);
      timer = null;
    },
    sample,
    samples: () => points,
  };
}
