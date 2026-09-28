import { useMessages } from "../i18n";
import { ToggleChip } from "../ui/Chip";
import { GRAINS, type ChartId, type Grain } from "./charts/chart-style";
import rowStyles from "./PanelRows.module.css";

export function GrainToggle({ chart, grain, onChange }: { chart: ChartId; grain: Grain; onChange: (grain: Grain) => void }) {
  const { stats } = useMessages();
  return (
    <span role="group" aria-label={stats.chartScale(stats.chartNames[chart])} className={rowStyles.grain}>
      {GRAINS.map((option) => (
        <ToggleChip key={option} pressed={grain === option} onToggle={() => onChange(option)}>
          {stats.grainNames[option]}
        </ToggleChip>
      ))}
    </span>
  );
}
