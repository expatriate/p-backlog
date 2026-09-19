import { Link } from "react-router";
import type { FlowForecast, FlowNow } from "../../core/stats/types";
import { STATUS_LABELS } from "../labels";
import { forecastText, formatStay } from "./format";
import { Panel } from "./Panel";
import styles from "./FlowPanels.module.css";

export function ForecastPanel({ forecast }: { forecast: FlowForecast }) {
  return (
    <Panel title="Прогноз">
      <p className={styles.lead}>{forecastText(forecast)}</p>
      <p className={styles.muted}>
        за 4 недели: закрыто {forecast.closed}, создано {forecast.created}
      </p>
    </Panel>
  );
}

export function NowPanel({ now }: { now: FlowNow }) {
  return (
    <Panel title="В работе сейчас">
      <p className={styles.lead}>
        в работе: {now.inProgress} · заблокировано: {now.blocked}
      </p>
      {now.longest.length === 0 ? (
        <p className={styles.muted}>Сейчас ничего не в работе</p>
      ) : (
        <ul className={styles.rows}>
          {now.longest.map((item) => (
            <li key={item.id} className={styles.row}>
              <span className={styles.rowLabel}>
                <Link to={`/p/${item.projectId}/t/${item.id}`}>{item.id}</Link> {item.title}
              </span>
              <span className={styles.rowValue}>
                {STATUS_LABELS[item.status]} · {formatStay(item.days, item.atLeast)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
