import type { ReactNode } from "react";
import { categoryLabel } from "../../core/model/categories";
import type { AccuracyRow, BranchRow, CategoryRow, FoundRow } from "../../core/stats/types";
import { EVIDENCE_LABELS, FOUND_LABELS } from "../labels";
import flowStyles from "./FlowPanels.module.css";
import { formatShare } from "./format";
import { Panel } from "./Panel";
import styles from "./QualityPanels.module.css";

export function AccuracyPanel({ rows }: { rows: AccuracyRow[] }) {
  return (
    <Panel title="Точность проверки">
      {rows.length === 0 ? (
        <p className={flowStyles.muted}>Проверка ещё не находила кандидатов</p>
      ) : (
        <Table
          label="Точность проверки"
          head={["Улика", "Кандидатов", "Закрыто", "Подтверждено", "Без решения", "Точность"]}
          rows={rows.map((row) => ({
            key: row.evidence,
            cells: [EVIDENCE_LABELS[row.evidence], row.candidates, row.closed, row.verified, row.open, formatShare(row.precision)],
          }))}
        />
      )}
    </Panel>
  );
}

export function CategoriesPanel({ rows }: { rows: CategoryRow[] }) {
  return (
    <Panel title="Категории">
      {rows.length === 0 ? (
        <p className={flowStyles.muted}>За 12 недель задач не было</p>
      ) : (
        <Table
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
      <h3 className={styles.subTitle}>Как найдены</h3>
      <Table
        label="Как найдены"
        head={["Как найдена", "Создано", "Открыто", "Исправлено"]}
        rows={found.map((row) => ({ key: row.found ?? "unknown", cells: [FOUND_LABELS[row.found ?? "unknown"], row.created, row.open, row.fixed] }))}
      />
      <h3 className={styles.subTitle}>Ветки</h3>
      {branches.length === 0 ? (
        <p className={flowStyles.muted}>Ветки появятся у задач, заведённых через backlog new в репозитории</p>
      ) : (
        <Table
          label="Ветки"
          head={["Ветка", "Создано", "Открыто"]}
          rows={branches.map((row) => ({ key: row.label, cells: [<code>{row.label}</code>, row.created, row.open] }))}
        />
      )}
    </Panel>
  );
}

function Table({ label, head, rows }: { label: string; head: string[]; rows: { key: string; cells: ReactNode[] }[] }) {
  return (
    <div className={styles.scroll} tabIndex={0} role="region" aria-label={`Таблица «${label}»`}>
      <table className={styles.table} aria-label={label}>
        <thead>
          <tr>
            {head.map((title) => (
              <th key={title} scope="col">
                {title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              {row.cells.map((cell, index) =>
                index === 0 ? (
                  <th key={head[index]} scope="row">
                    {cell}
                  </th>
                ) : (
                  <td key={head[index]}>{cell}</td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
