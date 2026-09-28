import { useState, type ReactNode } from "react";
import type { GrainPeriods } from "../../core/api/contract";
import type { ChartId, Grain } from "./charts/chart-style";
import { GrainToggle } from "./GrainToggle";
import { usePeriodCaption } from "./period-caption";

type GrainPanel<T> = { grain: Grain; periods: T[]; period: string; toggle: ReactNode };

const STORAGE_PREFIX = "p-backlog.stats.grain.";

export function useGrainPanel<T>(chart: ChartId, defaultGrain: Grain, series: Record<Grain, T[]>, windows: GrainPeriods): GrainPanel<T> {
  const caption = usePeriodCaption();
  const key = `${STORAGE_PREFIX}${chart}`;
  const [grain, setStoredGrain] = useState(() => readGrain(key) ?? defaultGrain);
  const setGrain = (next: Grain) => {
    setStoredGrain(next);
    writeGrain(key, next);
  };
  return { grain, periods: series[grain], period: caption.ofGrain(grain, windows), toggle: <GrainToggle chart={chart} grain={grain} onChange={setGrain} /> };
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
