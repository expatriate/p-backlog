import { categoryLabel } from "../../core/model/categories";
import { CHECK_METHOD_LABELS, DUPLICATE_MATCH_LABELS, EVIDENCE_LABELS, formatShare, GRAPH_STATE_LABELS } from "../../core/stats/format";
import type { AccuracyRow, AccuracyWeek, BranchRow, CategoryRow, FoundRow, GraphReport, MatchAccuracyRow, MethodAccuracyRow, OutcomeCounts, ProjectGraphRow } from "../../core/stats/types";
import { AccuracyWeeksChart } from "./AccuracyWeeksChart";
import { FOUND_LABELS } from "../labels";
import rowStyles from "./PanelRows.module.css";
import { Panel } from "./Panel";
import { StatsTable, type StatsTableRow } from "./StatsTable";
import { STATS_PERIOD } from "./periods";

type SplitRow = { by: string } & OutcomeCounts;

type AccuracyPanelProps = { rows: AccuracyRow[]; weeks: AccuracyWeek[]; methodRows: MethodAccuracyRow[]; matchRows: MatchAccuracyRow[] };

export function AccuracyPanel({ rows, weeks, methodRows, matchRows }: AccuracyPanelProps) {
  const splitOf = (evidence: AccuracyRow["evidence"]): StatsTableRow[] => {
    if (evidence === "source-changed") return methodRows.map((split) => splitRow(split, split.by === "unknown" ? "до записи способа" : `проверено ${CHECK_METHOD_LABELS[split.by]}`));
    if (evidence === "duplicate") return matchRows.map((split) => splitRow(split, split.by === "unknown" ? "до записи признака" : `совпали ${DUPLICATE_MATCH_LABELS[split.by]}`));
    return [];
  };
  return (
    <Panel title="Точность проверки">
      {rows.length === 0 ? (
        <p className={rowStyles.muted}>Проверка ещё не находила кандидатов</p>
      ) : (
        <>
          <p className={rowStyles.muted}>Доля кандидатов проверки, после которых задача закрылась; остальные подтверждены как актуальные</p>
          <AccuracyWeeksChart weeks={weeks} />
          <StatsTable
            label="Точность проверки за период"
            head={["Улика", "Кандидатов", "Закрыто", "Подтверждено", "Без решения", "Точность"]}
            rows={rows.flatMap((row): StatsTableRow[] => [
              {
                key: row.evidence,
                tone: row.evidence === "total" ? "total" : undefined,
                cells: [EVIDENCE_LABELS[row.evidence], row.candidates, row.closed, row.verified, row.open, formatShare(row.precision)],
              },
              ...splitOf(row.evidence).map((split) => ({ ...split, key: `${row.evidence}-${split.key}` })),
            ])}
          />
        </>
      )}
    </Panel>
  );
}

function splitRow(split: SplitRow, label: string): StatsTableRow {
  return { key: split.by, tone: "child", cells: [`└ из них ${label}`, split.candidates, split.closed, split.verified, split.open, formatShare(split.precision)] };
}

export function GraphPanel({ graph }: { graph: GraphReport }) {
  const { projects, filter } = graph;
  if (filter.filtered === 0 && projects.every((project) => project.state === "none")) {
    return (
      <Panel title="Граф кода">
        <p className={rowStyles.muted}>
          Графа кода нет: проверка сравнивает строки source и файл целиком. <code>code-review-graph build</code> в репозитории проекта включит проверку по символу
        </p>
      </Panel>
    );
  }
  return (
    <Panel title="Граф кода">
      <p className={rowStyles.muted}>Граф убирает кандидата «код изменился», если правка задела другой символ того же файла, — агенту не нужно перечитывать задачу</p>
      <h3 className={rowStyles.subTitle}>Отсеяно за {STATS_PERIOD}</h3>
      {filter.filtered === 0 ? (
        <p className={rowStyles.muted}>Граф не отсеял ни одного кандидата</p>
      ) : (
        <StatsTable
          label="Что стало с отсеянными кандидатами"
          head={["Исход", "Кандидатов"]}
          rows={[
            { key: "filtered", cells: ["Отсеяно графом", filter.filtered] },
            { key: "caught", cells: ["└ позже всё же стал кандидатом", filter.caught] },
            { key: "missed", cells: ["└ закрыта без сигнала проверки — возможный промах", filter.missed] },
            { key: "quiet", cells: ["└ без последствий", filter.quiet] },
          ]}
        />
      )}
      <h3 className={rowStyles.subTitle}>Проекты</h3>
      <StatsTable
        label="Граф кода по проектам"
        head={["Проект", "Граф", "Задач со строками source", "Символ найден"]}
        rows={projects.map((project) => ({ key: project.projectId, cells: [project.name, GRAPH_STATE_LABELS[project.state], project.pinned, resolvedCell(project)] }))}
      />
    </Panel>
  );
}

function resolvedCell({ state, pinned, resolved }: ProjectGraphRow): string {
  if (state === "none" || state === "unreadable") return "—";
  return `${resolved} (${formatShare(pinned === 0 ? null : resolved / pinned)})`;
}

export function CategoriesPanel({ rows }: { rows: CategoryRow[] }) {
  return (
    <Panel title="Категории">
      {rows.length === 0 ? (
        <p className={rowStyles.muted}>За {STATS_PERIOD} задач не было</p>
      ) : (
        <StatsTable
          label="Категории"
          head={["Категория", "Открыто", "Вес", "Создано", "Закрыто"]}
          rows={rows.map((row) => ({ key: row.category ?? "none", cells: [categoryLabel(row.category ?? undefined), row.open, row.weight, row.created, row.closed] }))}
        />
      )}
    </Panel>
  );
}

export function OriginPanel({ found, branches }: { found: FoundRow[]; branches: BranchRow[] }) {
  return (
    <Panel title="Происхождение">
      <h3 className={rowStyles.subTitle}>Как найдены</h3>
      <StatsTable
        label="Как найдены"
        head={["Как найдена", "Создано", "Открыто", "Исправлено"]}
        rows={found.map((row) => ({ key: row.found ?? "unknown", cells: [FOUND_LABELS[row.found ?? "unknown"], row.created, row.open, row.fixed] }))}
      />
      <h3 className={rowStyles.subTitle}>Ветки</h3>
      {branches.length === 0 ? (
        <p className={rowStyles.muted}>Ветки появятся у задач, заведённых через backlog new в репозитории</p>
      ) : (
        <StatsTable
          label="Ветки"
          head={["Ветка", "Создано", "Открыто"]}
          rows={branches.map((row) => ({ key: row.label, cells: [<code>{row.label}</code>, row.created, row.open] }))}
        />
      )}
    </Panel>
  );
}
