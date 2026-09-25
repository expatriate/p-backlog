import { useMessages } from "../i18n";
import { ToggleChip } from "../ui/Chip";
import type { ChartId, Grain } from "./charts/chart-style";
import rowStyles from "./PanelRows.module.css";

export function GrainToggle({ chart, grain, onChange }: { chart: ChartId; grain: Grain; onChange: (grain: Grain) => void }) {
  const { stats } = useMessages();
  return (
    <span role="group" aria-label={stats.chartScale(stats.chartNames[chart])} className={rowStyles.grain}>
      <ToggleChip pressed={grain === "week"} onToggle={() => onChange("week")}>
        {stats.grainWeek}
      </ToggleChip>
      <ToggleChip pressed={grain === "day"} onToggle={() => onChange("day")}>
        {stats.grainDay}
      </ToggleChip>
    </span>
  );
}
