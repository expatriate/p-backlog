import type { ReactNode } from "react";
import { formatNumber } from "../../core/i18n/format";
import { useLanguage, useMessages } from "../i18n";
import styles from "./StatsTable.module.css";

export type StatsTableRow = { key: string; cells: ReactNode[]; tone?: "child" | "total" | undefined };

export function StatsTable({ label, head, rows }: { label: string; head: string[]; rows: StatsTableRow[] }) {
  const { stats } = useMessages();
  const language = useLanguage();
  const cellText = (cell: ReactNode) => (typeof cell === "number" ? formatNumber(language, cell) : cell);
  return (
    <div className={styles.scroll} tabIndex={0} role="region" aria-label={stats.tableLabel(label)}>
      <table className={styles.table}>
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
            <tr key={row.key} className={row.tone && styles[row.tone]}>
              {row.cells.map((cell, index) =>
                index === 0 ? (
                  <th key={head[index]} scope="row">
                    {cellText(cell)}
                  </th>
                ) : (
                  <td key={head[index]}>{cellText(cell)}</td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
