import type { ReactNode } from "react";
import { z } from "zod";
import type { GrainPeriods } from "../../core/api/contract";
import { useStoredValue } from "../ui/use-stored-value";
import { GRAIN_WINDOWS, GRAINS, type ChartId, type Grain, type GrainSeries } from "./charts/chart-style";
import { GrainToggle } from "./GrainToggle";
import { usePeriodCaption } from "./period-caption";

type GrainPanel<T> = { grain: Grain; periods: T[]; period: string; toggle: ReactNode };

const STORAGE_PREFIX = "p-backlog.stats.grain.";

const STORED_GRAIN = z.enum(GRAINS);

export function useGrainPanel<T>(chart: ChartId, defaultGrain: Grain, series: GrainSeries<T>, windows: GrainPeriods): GrainPanel<T> {
  const caption = usePeriodCaption();
  const [storedGrain, updateGrain] = useStoredValue(`${STORAGE_PREFIX}${chart}`, STORED_GRAIN);
  const grain = storedGrain ?? defaultGrain;
  const periodWindow = GRAIN_WINDOWS[grain];
  return {
    grain,
    periods: series[periodWindow],
    period: caption.of(periodWindow, windows[periodWindow]),
    toggle: <GrainToggle chart={chart} grain={grain} onChange={(next) => updateGrain(() => next)} />,
  };
}
