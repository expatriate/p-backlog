import { Link } from "react-router";
import { forecastText, formatDays, formatShare } from "../../core/stats/format";
import type { EpicFlow, FlowCycle, FlowForecast, FlowNow, FlowWip } from "../../core/stats/types";
import type { EpicTones } from "../ui/epic-tone";
import { STATUS_LABELS } from "../labels";
import { epicEta, formatStay } from "./format";
import { Panel } from "./Panel";
import { WeeklyBars } from "./WeeklyBars";
import styles from "./FlowPanels.module.css";

export function ForecastPanel({ forecast }: { forecast: FlowForecast }) {
  return (
    <Panel title="Прогноз">
      <p className={styles.lead}>{forecastText(forecast)}</p>
      <p className={styles.muted}>
        за {forecast.windowWeeks} недели: закрыто {forecast.closed}, создано {forecast.created}
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

export function CyclePanel({ cycle }: { cycle: FlowCycle }) {
  return (
    <Panel title="Время в работе">
      {cycle.sample === 0 ? (
        <>
          <p className={styles.lead}>—</p>
          <p className={styles.muted}>Появится, когда задачи начнут брать в работу</p>
        </>
      ) : (
        <>
          <p className={styles.lead}>
            медиана {formatDays(cycle.medianDays)} · 90% — за {formatDays(cycle.p90Days)}
          </p>
          <p className={styles.muted}>
            в блокировке — {formatShare(cycle.blockedShare)} этого времени · закрытий с работой: {cycle.sample}
          </p>
        </>
      )}
    </Panel>
  );
}

export function WipPanel({ wip }: { wip: FlowWip }) {
  const known = wip.weeks.flatMap((week) => (week.max === null ? [] : [week.max]));
  const peak = known.length === 0 ? "—" : String(known.reduce((max, value) => Math.max(max, value)));
  return (
    <Panel title="В работе одновременно">
      <WeeklyBars
        weeks={wip.weeks.map((week) => ({ start: week.start, value: week.max }))}
        summary={`${wip.weeks.length} недель: сейчас в работе ${wip.current}, максимум ${peak}`}
      />
    </Panel>
  );
}

export function EpicsPanel({ epics, tones }: { epics: EpicFlow[]; tones: EpicTones }) {
  return (
    <Panel title="Эпики">
      {epics.length === 0 ? (
        <p className={styles.muted}>Открытых эпиков нет</p>
      ) : (
        <ul className={styles.rows}>
          {epics.map((epic) => {
            const trackProps =
              epic.total === 0
                ? { "aria-hidden": "true" as const }
                : {
                    role: "progressbar" as const,
                    "aria-label": `${epic.id}: закрыто ${epic.closed} из ${epic.total}`,
                    "aria-valuenow": epic.closed,
                    "aria-valuemin": 0,
                    "aria-valuemax": epic.total,
                  };
            const progress = epic.total === 0 ? 0 : epic.closed / epic.total;
            return (
              <li key={epic.id} className={styles.epicRow} data-epic-tone={tones.get(epic.id)}>
                <span className={styles.rowLabel}>
                  <Link to={`/p/${epic.projectId}/t/${epic.id}`}>{epic.id}</Link> {epic.title}
                </span>
                <span className={styles.epicTrack} {...trackProps}>
                  <span className={styles.epicFill} style={{ transform: `scaleX(${progress})` }} />
                </span>
                <span className={styles.rowValue}>
                  {epic.closed}/{epic.total} · {epicEta(epic.weeks)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
