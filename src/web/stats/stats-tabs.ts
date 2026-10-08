import type { ComponentType } from "react";
import type { StatsTabKind } from "../../core/api/web-paths";

export type StatsTab = { key: StatsTabKind; load: () => Promise<{ Component: ComponentType }> };

export const STATS_TABS = [
  { key: "overview", load: async () => ({ Component: (await import("./OverviewTab")).OverviewTab }) },
  { key: "code", load: async () => ({ Component: (await import("./CodeTab")).CodeTab }) },
  { key: "quality", load: async () => ({ Component: (await import("./QualityTab")).QualityTab }) },
  { key: "effect", load: async () => ({ Component: (await import("./EffectTab")).EffectTab }) },
  { key: "cost", load: async () => ({ Component: (await import("./CostTab")).CostTab }) },
] as const satisfies readonly StatsTab[];
