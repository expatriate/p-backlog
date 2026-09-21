import { categoryLabel } from "../../core/model/categories";
import { EVIDENCE_LABELS, formatShare } from "../../core/stats/format";
import type { AccuracyRow, AccuracyWeek, BranchRow, CategoryRow, FoundRow, SymbolAccuracyRow } from "../../core/stats/types";
import { AccuracyWeeksChart } from "./AccuracyWeeksChart";
import { FOUND_LABELS } from "../labels";
import rowStyles from "./PanelRows.module.css";
import { Panel } from "./Panel";
import { StatsTable } from "./StatsTable";
import { STATS_PERIOD } from "./periods";

const SYMBOL_LABELS = { symbol: "└ из них проверено по символу", file: "└ из них проверено по файлу" } as const;

export function AccuracyPanel({ rows, weeks, symbolRows }: { rows: AccuracyRow[]; weeks: AccuracyWeek[]; symbolRows: SymbolAccuracyRow[] }) {
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
            rows={rows.flatMap((row) => [
              { key: row.evidence, cells: [EVIDENCE_LABELS[row.evidence], row.candidates, row.closed, row.verified, row.open, formatShare(row.precision)] },
              ...(row.evidence === "source-changed"
                ? symbolRows.map((split) => ({
                    key: `by-${split.by}`,
                    cells: [SYMBOL_LABELS[split.by], split.candidates, split.closed, split.verified, split.open, formatShare(split.precision)],
                  }))
                : []),
            ])}
          />
        </>
      )}
    </Panel>
  );
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
