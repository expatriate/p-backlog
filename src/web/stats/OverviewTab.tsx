import { useParams } from "react-router";
import type { StatsReport, StatsTotals } from "../../core/stats/types";
import { useStats } from "../app/queries";
import { cx } from "../ui/cx";
import { AgePanel } from "./AgePanel";
import { ClosingPanel } from "./ClosingPanel";
import { formatDays, formatSigned } from "./format";
import { HotspotsPanel } from "./HotspotsPanel";
import { Panel } from "./Panel";
import { StatsTabState } from "./StatsTabState";
import { WeeklyChart } from "./WeeklyChart";
import styles from "./StatsPage.module.css";

export function OverviewTab() {
  const { projectId } = useParams();
  const stats = useStats(projectId);
  return (
    <StatsTabState error={stats.error} data={stats.data} onRetry={() => void stats.refetch()}>
      {stats.data && <Overview report={stats.data} listPath={projectId === undefined ? "/" : `/p/${projectId}`} />}
    </StatsTabState>
  );
}

function Overview({ report, listPath }: { report: StatsReport; listPath: string }) {
  return (
    <>
      <Totals totals={report.totals} />
      <div className={styles.blocks}>
        <Panel title="Долг по неделям">
          <WeeklyChart weeks={report.weeks} />
        </Panel>
        <HotspotsPanel hotspots={report.hotspots} listPath={listPath} />
        <AgePanel age={report.age} />
        <ClosingPanel closing={report.closing} />
      </div>
    </>
  );
}

function Totals({ totals }: { totals: StatsTotals }) {
  const net = totals.createdLastWeek - totals.closedLastWeek;
  return (
    <div className={styles.totals}>
      <Figure label="Открыто" value={String(totals.open)} note={`вес ${totals.openWeight}`} />
      <Figure label="За неделю" value={formatSigned(net)} tone={netTone(net)} note={`создано ${totals.createdLastWeek}, закрыто ${totals.closedLastWeek}`} />
      <Figure label="Возраст, медиана" value={formatDays(totals.ageMedianDays)} note={`старше 30 дн.: ${totals.olderThan30Days}`} />
      <Figure
        label="До закрытия, медиана"
        value={formatDays(totals.leadTimeMedianDays)}
        note={totals.leadTimeP90Days === null ? "закрытий нет" : `90% — за ${formatDays(totals.leadTimeP90Days)}`}
      />
    </div>
  );
}

function Figure({ label, value, note, tone }: { label: string; value: string; note: string; tone?: "growth" | "decline" }) {
  return (
    <div className={styles.figure} role="group" aria-label={label}>
      <span className={styles.figureLabel}>{label}</span>
      <span className={cx(styles.figureValue, tone === "growth" && styles.growth, tone === "decline" && styles.decline)}>{value}</span>
      <span className={styles.figureNote}>{note}</span>
    </div>
  );
}

function netTone(net: number): "growth" | "decline" | undefined {
  if (net > 0) return "growth";
  if (net < 0) return "decline";
  return undefined;
}
