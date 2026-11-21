import { formatShare } from "../../core/stats/format";
import type { AccuracyRow, BranchRow, CategoryRow, FoundRow, GraphReport, MatchAccuracyRow, MethodAccuracyRow, OutcomeCounts, ProjectGraphRow, QualityReport, ReportPeriod } from "../../core/api/contract";
import { useMessages } from "../i18n";
import { AccuracyChart } from "./AccuracyChart";
import type { StatsMessages } from "./messages.ru";
import rowStyles from "./PanelRows.module.css";
import { Panel, PanelNote } from "./Panel";
import { usePeriodCaption } from "./period-caption";
import { StatsTable, type StatsTableRow } from "./StatsTable";
import { useGrainPanel } from "./use-grain-panel";
import { NO_VALUE } from "../labels";

type AccuracySplitRow = MethodAccuracyRow | MatchAccuracyRow;

type AccuracyReport = Pick<QualityReport, "accuracy" | "accuracyWeeks" | "accuracyDays" | "periods" | "methodAccuracy" | "matchAccuracy" | "modelAccuracy">;

export function AccuracyPanel({ report }: { report: AccuracyReport }) {
  const { accuracy: rows, accuracyWeeks: weeks, accuracyDays: days, periods: windows, methodAccuracy, matchAccuracy, modelAccuracy } = report;
  const { stats, core } = useMessages();
  const caption = usePeriodCaption();
  const { grain, periods, period, toggle } = useGrainPanel("accuracy", "week", { weeks, days }, windows);
  const tablePeriod = caption.of("weeks", windows.weeks);
  const splits = [...methodAccuracy, ...matchAccuracy];
  const splitLabel = (split: AccuracySplitRow): string => {
    switch (split.evidence) {
      case "source-changed":
        return split.by === "unknown" ? stats.beforeMethodRecorded : stats.checkedBy(core.checkMethodLabel(split.by));
      case "duplicate":
        return split.by === "unknown" ? stats.beforeMatchRecorded : stats.matchedBy(core.duplicateMatchLabel(split.by));
    }
  };
  const splitOf = (evidence: AccuracyRow["evidence"]): StatsTableRow[] => splits.filter((split) => split.evidence === evidence).map((split) => splitRow(stats, split, splitLabel(split)));
  return (
    <Panel title={stats.accuracyTitle} period={period} aside={rows.length === 0 ? undefined : toggle}>
      {rows.length === 0 ? (
        <PanelNote>{stats.noCandidates}</PanelNote>
      ) : (
        <>
          <PanelNote>{stats.accuracyHint}</PanelNote>
          <AccuracyChart periods={periods} grain={grain} />
          <PanelNote>{tablePeriod}</PanelNote>
          <StatsTable
            label={stats.accuracyTable(tablePeriod)}
            head={stats.accuracyHead}
            rows={rows.flatMap((row): StatsTableRow[] => [
              {
                key: row.evidence,
                tone: row.evidence === "total" ? "total" : undefined,
                cells: [core.evidenceLabel(row.evidence), ...outcomeCells(row)],
              },
              ...splitOf(row.evidence).map((split) => ({ ...split, key: `${row.evidence}-${split.key}` })),
            ])}
          />
          {modelAccuracy.length > 0 && (
            <div>
              <h3 className={rowStyles.subTitle}>{stats.modelAccuracyTitle}</h3>
              <StatsTable
                label={stats.modelAccuracyTable(tablePeriod)}
                head={[stats.modelAccuracyColumn, ...stats.accuracyHead.slice(1)]}
                rows={modelAccuracy.map((row) => ({ key: row.model, cells: [row.model, ...outcomeCells(row)] }))}
              />
            </div>
          )}
        </>
      )}
    </Panel>
  );
}

function splitRow(stats: StatsMessages, split: AccuracySplitRow, label: string): StatsTableRow {
  return { key: split.by, tone: "child", cells: [stats.splitRow(label), ...outcomeCells(split)] };
}

function outcomeCells({ candidates, closed, verified, open, precision }: OutcomeCounts): Array<number | string> {
  return [candidates, closed, verified, open, formatShare(precision)];
}

export function GraphPanel({ graph, period }: { graph: GraphReport; period: ReportPeriod }) {
  const { stats, core } = useMessages();
  const caption = usePeriodCaption();
  const { projects, filter } = graph;
  if (filter.filtered === 0 && projects.every((project) => project.state === "none")) {
    return (
      <Panel title={stats.graphTitle}>
        <PanelNote>
          {stats.graphMissing((text) => (
            <code key={text}>{text}</code>
          ))}
        </PanelNote>
      </Panel>
    );
  }
  return (
    <Panel title={stats.graphTitle}>
      <PanelNote>{stats.graphHint}</PanelNote>
      <div>
        <h3 className={rowStyles.subTitle}>{caption.labelled(stats.filteredTitle, period)}</h3>
        {filter.filtered === 0 ? (
          <PanelNote>{stats.nothingFiltered}</PanelNote>
        ) : (
          <StatsTable
            label={stats.filteredTable}
            head={stats.filteredHead}
            rows={[
              { key: "filtered", cells: [stats.filteredByGraph, filter.filtered] },
              { key: "caught", cells: [stats.filteredCaught, filter.caught] },
              { key: "missed", cells: [stats.filteredMissed, filter.missed] },
              { key: "quiet", cells: [stats.filteredQuiet, filter.quiet] },
            ]}
          />
        )}
      </div>
      <div>
        <h3 className={rowStyles.subTitle}>{stats.periodCaption(stats.projects, stats.periodNow)}</h3>
        <StatsTable
          label={stats.graphByProject}
          head={stats.graphHead}
          rows={projects.map((project) => ({ key: project.projectId, cells: [project.name, core.graphStateLabel(project.state), project.pinned, resolvedCell(project)] }))}
        />
      </div>
    </Panel>
  );
}

function resolvedCell({ state, pinned, resolved }: ProjectGraphRow): string {
  if (state === "none" || state === "unreadable") return NO_VALUE;
  return `${resolved} (${formatShare(pinned === 0 ? null : resolved / pinned)})`;
}

export function CategoriesPanel({ rows, period }: { rows: CategoryRow[]; period: ReportPeriod }) {
  const { stats, core } = useMessages();
  const caption = usePeriodCaption();
  return (
    <Panel title={stats.categoriesTitle} period={caption.of("weeks", period)}>
      {rows.length === 0 ? (
        <PanelNote>{stats.categoriesEmpty}</PanelNote>
      ) : (
        <StatsTable
          label={stats.categoriesTitle}
          head={stats.categoriesHead}
          rows={rows.map((row) => ({ key: row.category, cells: [core.categoryRowLabel(row.category), row.open, row.weight, row.created, row.closed] }))}
        />
      )}
    </Panel>
  );
}

export function OriginPanel({ found, branches, period }: { found: FoundRow[]; branches: BranchRow[]; period: ReportPeriod }) {
  const { stats, core } = useMessages();
  const caption = usePeriodCaption();
  return (
    <Panel title={stats.originTitle} period={caption.of("weeks", period)}>
      <div>
        <h3 className={rowStyles.subTitle}>{stats.foundTitle}</h3>
        <StatsTable label={stats.foundTitle} head={stats.foundHead} rows={found.map((row) => ({ key: row.found, cells: [core.foundRowLabel(row.found), row.created, row.open, row.fixed] }))} />
      </div>
      <div>
        <h3 className={rowStyles.subTitle}>{stats.branchesTitle}</h3>
        {branches.length === 0 ? (
          <PanelNote>{stats.branchesEmpty}</PanelNote>
        ) : (
          <StatsTable label={stats.branchesTitle} head={stats.branchesHead} rows={branches.map((row) => ({ key: row.label, cells: [<code>{row.label}</code>, row.created, row.open] }))} />
        )}
      </div>
    </Panel>
  );
}
