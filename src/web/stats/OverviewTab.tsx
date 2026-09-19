import { useParams } from "react-router";
import { formatDays, formatP90, formatSigned, NBSP } from "../../core/stats/format";
import type { StatsReport, StatsTotals } from "../../core/stats/types";
import { useStats } from "../app/queries";
import { AgePanel } from "./AgePanel";
import { ClosingPanel } from "./ClosingPanel";
import { Figure } from "./Figure";
import { HotspotsPanel } from "./HotspotsPanel";
import { Panel } from "./Panel";
import { StatsTabState } from "./StatsTabState";
import { WeeklyFlowChart } from "./WeeklyFlowChart";
import styles from "./StatsPage.module.css";

export function OverviewTab() {
  const { projectId } = useParams();
  const stats = useStats(projectId);
  return (
    <StatsTabState error={stats.error} data={stats.data} isFetching={stats.isFetching} onRetry={() => void stats.refetch()}>
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
          <WeeklyFlowChart weeks={report.weeks} />
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
      <Figure label="Возраст, медиана" value={formatDays(totals.ageMedianDays)} note={`старше 30${NBSP}дн.: ${totals.olderThan30Days}`} />
      <Figure
        label="До закрытия, медиана"
        value={formatDays(totals.leadTimeMedianDays)}
        note={totals.leadTimeP90Days === null ? "закрытий нет" : `90% — ${formatP90(totals.leadTimeP90Days)}`}
      />
    </div>
  );
}

function netTone(net: number): "growth" | "decline" | undefined {
  if (net > 0) return "growth";
  if (net < 0) return "decline";
  return undefined;
}
