import type { ComponentType } from "react";
import type { StatsMessages } from "./messages.ru";

type StatsTab = { key: keyof StatsMessages["tabs"]; segment: string; load: () => Promise<{ Component: ComponentType }> };

export const STATS_TABS = [
  { key: "overview", segment: "", load: async () => ({ Component: (await import("./OverviewTab")).OverviewTab }) },
  { key: "code", segment: "code", load: async () => ({ Component: (await import("./CodeTab")).CodeTab }) },
  { key: "quality", segment: "quality", load: async () => ({ Component: (await import("./QualityTab")).QualityTab }) },
  { key: "effect", segment: "effect", load: async () => ({ Component: (await import("./EffectTab")).EffectTab }) },
  { key: "cost", segment: "cost", load: async () => ({ Component: (await import("./CostTab")).CostTab }) },
] as const satisfies readonly StatsTab[];
