import { useParams } from "react-router";
import { formatSigned } from "../../core/stats/format";
import type { StatsReport, StatsTotals } from "../../core/api/contract";
import { listPath } from "../app/paths";
import { useStats } from "../app/queries";
import { useMessages } from "../i18n";
import { cx } from "../ui/cx";
import { AgePanel } from "./AgePanel";
import { ClosingPanel } from "./ClosingPanel";
import { Figure, type FigureTone } from "./Figure";
import { trendOf } from "./trend";
import { HotspotsPanel } from "./HotspotsPanel";
import { StatsTabState } from "./StatsTabState";
import { FlowPanel } from "./FlowChart";
import { IntakePanel } from "./IntakeChart";
import styles from "./StatsPage.module.css";

export function OverviewTab() {
  const { projectId } = useParams();
  const stats = useStats(projectId);
  return <StatsTabState query={stats}>{(report) => <Overview report={report} taskListPath={listPath(projectId)} />}</StatsTabState>;
}

function Overview({ report, taskListPath }: { report: StatsReport; taskListPath: string }) {
  return (
    <>
      <Totals totals={report.totals} />
      <div className={styles.blocks}>
        <FlowPanel weeks={report.weeks} days={report.days} windows={report.periods} />
        <IntakePanel weeks={report.weeks} days={report.days} windows={report.periods} />
        <HotspotsPanel hotspots={report.hotspots} listPath={taskListPath} />
        <AgePanel age={report.age} />
        <ClosingPanel closing={report.closing} period={report.periods.weeks} />
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
        trend={trendOf(stats, net, previous?.net ?? null)}
      />
    </div>
  );
}

function netTone(net: number): FigureTone | undefined {
  if (net > 0) return "growth";
  if (net < 0) return "decline";
  return undefined;
}
