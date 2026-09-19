import type { ReactNode } from "react";
import { Link } from "react-router";
import type { Hotspots } from "../../core/stats/types";
import flowStyles from "./FlowPanels.module.css";
import { Panel } from "./Panel";
import styles from "./StatsPanels.module.css";

export function HotspotsPanel({ hotspots, listPath }: { hotspots: Hotspots; listPath: string }) {
  return (
    <Panel title="Где болит">
      <div className={styles.columns}>
        <CountList title="Папки" empty="У открытых задач нет source" items={hotspots.folders.map(({ label, count }) => ({ key: label, label: <code>{label}</code>, count }))} />
        <CountList
          title="Теги"
          empty="У открытых задач нет тегов"
          items={hotspots.tags.map(({ tag, count }) => ({
            key: tag,
            label: <Link to={{ pathname: listPath, search: `tag=${encodeURIComponent(tag)}` }}>#{tag}</Link>,
            count,
          }))}
        />
      </div>
    </Panel>
  );
}

function CountList({ title, empty, items }: { title: string; empty: string; items: { key: string; label: ReactNode; count: number }[] }) {
  const top = Math.max(1, ...items.map((item) => item.count));
  return (
    <div className={styles.countList}>
      <h3 className={styles.subTitle}>{title}</h3>
      {items.length === 0 ? (
        <p className={styles.muted}>{empty}</p>
      ) : (
        <ul className={styles.rows}>
          {items.map((item) => (
            <li key={item.key} className={styles.countRow}>
              <span className={styles.rowLabel}>{item.label}</span>
              <span className={styles.rowCount}>{item.count}</span>
              <span className={flowStyles.track} aria-hidden="true">
                <span className={flowStyles.fill} style={{ transform: `scaleX(${item.count / top})` }} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
