import { useParams } from "react-router";
import { formatSigned } from "../../core/stats/format";
import type { StatsReport, StatsTotals } from "../../core/api/contract";
import { listPath } from "../app/paths";
import { useStats } from "../app/queries";
import { useMessages } from "../i18n";
import { cx } from "../ui/cx";
import { AgePanel } from "./AgePanel";
import { ClosingPanel } from "./ClosingPanel";
import { Figure } from "./Figure";
import { trendOf } from "./trend";
import { HotspotsPanel } from "./HotspotsPanel";
import { Panel } from "./Panel";
import { StatsTabState } from "./StatsTabState";
import { DailyIntakePanel } from "./DailyIntakeChart";
import { WeeklyFlowChart } from "./WeeklyFlowChart";
import styles from "./StatsPage.module.css";

export function OverviewTab() {
  const { projectId } = useParams();
  const stats = useStats(projectId);
  return <StatsTabState query={stats}>{(report) => <Overview report={report} listPath={listPath(projectId)} />}</StatsTabState>;
}

function Overview({ report, listPath }: { report: StatsReport; listPath: string }) {
  const { stats } = useMessages();
  return (
    <>
      <Totals totals={report.totals} />
      <div className={styles.blocks}>
        <Panel title={stats.debtByWeek}>
          <WeeklyFlowChart weeks={report.weeks} />
        </Panel>
        <DailyIntakePanel days={report.days} />
        <HotspotsPanel hotspots={report.hotspots} listPath={listPath} />
        <AgePanel age={report.age} />
        <ClosingPanel closing={report.closing} />
      </div>
    </>
  );
}

function Totals({ totals }: { totals: StatsTotals }) {
  const { stats } = useMessages();
  const net = totals.createdLastWeek - totals.closedLastWeek;
  const previous = totals.previous;
  return (
    <div className={cx(styles.totals, styles.totalsPair)}>
      <Figure
        label={stats.tasksToday}
        value={
          <>
            <span className={totals.createdToday > 0 ? styles.growth : undefined}>+{totals.createdToday}</span>{" "}
            <span className={totals.closedToday > 0 ? styles.decline : undefined}>−{totals.closedToday}</span>
          </>
        }
        note={stats.createdAndClosed}
      />
      <Figure
        label={stats.thisWeek}
        value={formatSigned(net)}
        tone={netTone(net)}
        note={stats.weekNote(totals.createdLastWeek, totals.closedLastWeek)}
        trend={trendOf(stats, net, previous?.net ?? null, String)}
      />
    </div>
  );
}

function netTone(net: number): "growth" | "decline" | undefined {
  if (net > 0) return "growth";
  if (net < 0) return "decline";
  return undefined;
}
