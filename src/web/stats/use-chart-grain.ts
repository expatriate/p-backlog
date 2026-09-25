import { useState } from "react";
import type { Grain } from "./charts/chart-style";

type ChartId = "flow" | "intake" | "accuracy" | "effect" | "spend";

const STORAGE_PREFIX = "p-backlog.stats.grain.";

export function useChartGrain(chart: ChartId, defaultGrain: Grain): [Grain, (grain: Grain) => void] {
  const key = `${STORAGE_PREFIX}${chart}`;
  const [grain, setGrain] = useState(() => readGrain(key) ?? defaultGrain);
  const choose = (next: Grain) => {
    setGrain(next);
    writeGrain(key, next);
  };
  return [grain, choose];
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
