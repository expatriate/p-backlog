import { formatShare } from "../../core/stats/format";
import type { AccuracyRow, AccuracyWeek, BranchRow, CategoryRow, FoundRow, GraphReport, MatchAccuracyRow, MethodAccuracyRow, OutcomeCounts, ProjectGraphRow } from "../../core/stats/types";
import { useMessages } from "../i18n";
import { AccuracyWeeksChart } from "./AccuracyWeeksChart";
import type { StatsMessages } from "./messages.ru";
import rowStyles from "./PanelRows.module.css";
import { Panel } from "./Panel";
import { StatsTable, type StatsTableRow } from "./StatsTable";

type SplitRow = { by: string } & OutcomeCounts;

type AccuracyPanelProps = { rows: AccuracyRow[]; weeks: AccuracyWeek[]; methodRows: MethodAccuracyRow[]; matchRows: MatchAccuracyRow[] };

export function AccuracyPanel({ rows, weeks, methodRows, matchRows }: AccuracyPanelProps) {
  const { stats, core } = useMessages();
  const splitOf = (evidence: AccuracyRow["evidence"]): StatsTableRow[] => {
    if (evidence === "source-changed")
      return methodRows.map((split) => splitRow(stats, split, split.by === "unknown" ? stats.beforeMethodRecorded : stats.checkedBy(core.checkMethodLabel(split.by))));
    if (evidence === "duplicate")
      return matchRows.map((split) => splitRow(stats, split, split.by === "unknown" ? stats.beforeMatchRecorded : stats.matchedBy(core.duplicateMatchLabel(split.by))));
    return [];
  };
  return (
    <Panel title={stats.accuracyTitle}>
      {rows.length === 0 ? (
        <p className={rowStyles.muted}>{stats.noCandidates}</p>
      ) : (
        <>
          <p className={rowStyles.muted}>{stats.accuracyHint}</p>
          <AccuracyWeeksChart weeks={weeks} />
          <StatsTable
            label={stats.accuracyTable}
            head={stats.accuracyHead}
            rows={rows.flatMap((row): StatsTableRow[] => [
              {
                key: row.evidence,
                tone: row.evidence === "total" ? "total" : undefined,
                cells: [core.evidenceLabel(row.evidence), row.candidates, row.closed, row.verified, row.open, formatShare(row.precision)],
              },
              ...splitOf(row.evidence).map((split) => ({ ...split, key: `${row.evidence}-${split.key}` })),
            ])}
          />
        </>
      )}
    </Panel>
  );
}

function splitRow(stats: StatsMessages, split: SplitRow, label: string): StatsTableRow {
  return { key: split.by, tone: "child", cells: [stats.splitRow(label), split.candidates, split.closed, split.verified, split.open, formatShare(split.precision)] };
}

export function GraphPanel({ graph }: { graph: GraphReport }) {
  const { stats, core } = useMessages();
  const { projects, filter } = graph;
  if (filter.filtered === 0 && projects.every((project) => project.state === "none")) {
    return (
      <Panel title={stats.graphTitle}>
        <p className={rowStyles.muted}>{stats.graphMissing((text) => <code key={text}>{text}</code>)}</p>
      </Panel>
    );
  }
  return (
    <Panel title={stats.graphTitle}>
      <p className={rowStyles.muted}>{stats.graphHint}</p>
      <div>
        <h3 className={rowStyles.subTitle}>{stats.filteredTitle}</h3>
        {filter.filtered === 0 ? (
          <p className={rowStyles.muted}>{stats.nothingFiltered}</p>
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
        <h3 className={rowStyles.subTitle}>{stats.projects}</h3>
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
  if (state === "none" || state === "unreadable") return "—";
  return `${resolved} (${formatShare(pinned === 0 ? null : resolved / pinned)})`;
}

export function CategoriesPanel({ rows }: { rows: CategoryRow[] }) {
  const { stats, core } = useMessages();
  return (
    <Panel title={stats.categoriesTitle}>
      {rows.length === 0 ? (
        <p className={rowStyles.muted}>{stats.categoriesEmpty}</p>
      ) : (
        <StatsTable
          label={stats.categoriesTitle}
          head={stats.categoriesHead}
          rows={rows.map((row) => ({ key: row.category ?? "none", cells: [core.categoryLabel(row.category ?? undefined), row.open, row.weight, row.created, row.closed] }))}
        />
      )}
    </Panel>
  );
}

export function OriginPanel({ found, branches }: { found: FoundRow[]; branches: BranchRow[] }) {
  const { stats } = useMessages();
  return (
    <Panel title={stats.originTitle}>
      <div>
        <h3 className={rowStyles.subTitle}>{stats.foundTitle}</h3>
        <StatsTable
          label={stats.foundTitle}
          head={stats.foundHead}
          rows={found.map((row) => ({ key: row.found ?? "unknown", cells: [stats.foundLabels[row.found ?? "unknown"], row.created, row.open, row.fixed] }))}
        />
      </div>
      <div>
        <h3 className={rowStyles.subTitle}>{stats.branchesTitle}</h3>
        {branches.length === 0 ? (
          <p className={rowStyles.muted}>{stats.branchesEmpty}</p>
        ) : (
          <StatsTable
            label={stats.branchesTitle}
            head={stats.branchesHead}
            rows={branches.map((row) => ({ key: row.label, cells: [<code>{row.label}</code>, row.created, row.open] }))}
          />
        )}
      </div>
    </Panel>
  );
}
