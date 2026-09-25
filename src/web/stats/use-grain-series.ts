import { useState } from "react";
import type { ChartId, Grain } from "./charts/chart-style";

type GrainSeries<T> = { grain: Grain; periods: T[]; setGrain: (grain: Grain) => void };

const STORAGE_PREFIX = "p-backlog.stats.grain.";

export function useGrainSeries<T>(chart: ChartId, defaultGrain: Grain, series: Record<Grain, T[]>): GrainSeries<T> {
  const key = `${STORAGE_PREFIX}${chart}`;
  const [grain, setStoredGrain] = useState(() => readGrain(key) ?? defaultGrain);
  const setGrain = (next: Grain) => {
    setStoredGrain(next);
    writeGrain(key, next);
  };
  return { grain, periods: series[grain], setGrain };
}

function readGrain(key: string): Grain | undefined {
  try {
    const stored = window.localStorage.getItem(key);
    return stored === "week" || stored === "day" ? stored : undefined;
  } catch {
    return undefined;
  }
}

function writeGrain(key: string, grain: Grain): void {
  try {
    window.localStorage.setItem(key, grain);
  } catch {
    return;
  }
}
