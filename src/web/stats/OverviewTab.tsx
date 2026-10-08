import { useParams } from "react-router";
import type { Language } from "../../core/i18n/language";
import { formatSigned } from "../../core/stats/format";
import type { StatsReport, StatsTotals } from "../../core/api/contract";
import { listPath } from "../../core/api/web-paths";
import { useStatsReport } from "../app/queries";
import { useLanguage, useMessages } from "../i18n";
import { AgePanel } from "./AgePanel";
import { ClosingPanel } from "./ClosingPanel";
import { Figure, Figures, ToneText, type FigureTone, type FigureTrend } from "./Figure";
import { HotspotsPanel } from "./HotspotsPanel";
import { StatsTabState } from "./StatsTabState";
import { FlowPanel } from "./FlowPanel";
import { IntakePanel } from "./IntakePanel";
import type { StatsMessages } from "./messages.ru";
import { formatWhole } from "./value-format";
import layout from "./StatsLayout.module.css";

const TREND_ARROWS: Record<FigureTone, string> = { decline: "↓", growth: "↑" };

export function OverviewTab() {
  const { projectId } = useParams();
  const stats = useStatsReport("overview", projectId);
  return <StatsTabState query={stats}>{(report) => <Overview report={report} taskListPath={listPath(projectId)} />}</StatsTabState>;
}

function Overview({ report, taskListPath }: { report: StatsReport; taskListPath: string }) {
  return (
    <>
      <Totals totals={report.totals} />
      <div className={layout.blocks}>
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
  const language = useLanguage();
  const net = totals.createdLastWeek - totals.closedLastWeek;
  return (
    <Figures columns={2}>
      <Figure
        label={stats.tasksToday}
        value={
          <>
            <ToneText tone={totals.createdToday > 0 ? "growth" : undefined}>+{totals.createdToday}</ToneText> <ToneText tone={totals.closedToday > 0 ? "decline" : undefined}>−{totals.closedToday}</ToneText>
          </>
        }
        note={stats.createdAndClosed}
      />
      <Figure
        label={stats.thisWeek}
        value={formatSigned(net)}
        tone={netTone(net)}
        note={stats.weekNote(totals.createdLastWeek, totals.closedLastWeek)}
        trend={trendOf(stats, language, net, totals.previous?.net)}
      />
    </Figures>
  );
}

function netTone(net: number): FigureTone | undefined {
  if (net > 0) return "growth";
  if (net < 0) return "decline";
  return undefined;
}

function trendOf(stats: StatsMessages, language: Language, net: number, previous: number | undefined): FigureTrend | undefined {
  if (previous === undefined) return undefined;
  const change = net - previous;
  const tone = netTone(change);
  if (tone === undefined) return undefined;
  const size = formatWhole(language, Math.abs(change));
  return { text: stats.weekTrend(TREND_ARROWS[tone], size), speech: stats.weekTrendSpeech[tone](size), tone };
}
