import { useParams } from "react-router";
import { formatSigned } from "../../core/stats/format";
import type { StatsReport, StatsTotals } from "../../core/stats/types";
import { listPath } from "../app/paths";
import { useStats } from "../app/queries";
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
  return (
    <>
      <Totals totals={report.totals} />
      <div className={styles.blocks}>
        <Panel title="Долг по неделям">
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
  const net = totals.createdLastWeek - totals.closedLastWeek;
  const previous = totals.previous;
  return (
    <div className={cx(styles.totals, styles.totalsPair)}>
      <Figure
        label="Задачи сегодня"
        value={
          <>
            <span className={totals.createdToday > 0 ? styles.growth : undefined}>+{totals.createdToday}</span>{" "}
            <span className={totals.closedToday > 0 ? styles.decline : undefined}>−{totals.closedToday}</span>
          </>
        }
        note="создано и закрыто"
      />
      <Figure
        label="За неделю"
        value={formatSigned(net)}
        tone={netTone(net)}
        note={`создано ${totals.createdLastWeek}, закрыто ${totals.closedLastWeek}`}
        trend={trendOf(net, previous?.net ?? null, String)}
      />
    </div>
  );
}

function netTone(net: number): "growth" | "decline" | undefined {
  if (net > 0) return "growth";
  if (net < 0) return "decline";
  return undefined;
}
