import { useEffect } from "react";
import { statsPath } from "../app/paths";
import { Link, matchPath, Outlet, useLocation, useParams } from "react-router";
import { useProjects, useSignals } from "../app/queries";
import { cx } from "../ui/cx";
import styles from "./StatsPage.module.css";

const STATS_TABS = [
  { label: "Обзор", segment: "" },
  { label: "Код", segment: "code" },
  { label: "Качество", segment: "quality" },
  { label: "Эффект", segment: "effect" },
  { label: "Стоимость", segment: "cost" },
] as const;

export function StatsPage() {
  const { projectId } = useParams();
  const { pathname } = useLocation();
  const projects = useProjects();
  const signals = useSignals(projectId);
  const scopeName = projectId === undefined ? "Все проекты" : (projects.data?.find((project) => project.id === projectId)?.name ?? projectId);
  const heading = `Статистика · ${scopeName}`;
  const base = statsPath(projectId);
  const tabPath = (segment: string) => (segment === "" ? base : `${base}/${segment}`);
  const isActiveTab = (segment: string) => segment !== "" && matchPath({ path: tabPath(segment), end: true }, pathname) !== null;
  const active = STATS_TABS.find((tab) => isActiveTab(tab.segment)) ?? STATS_TABS[0];

  useEffect(() => {
    document.title = active.segment === "" ? `${heading} — Беклог` : `${active.label} · ${heading} — Беклог`;
  }, [active, heading]);

  return (
    <main id="content" tabIndex={-1} className={styles.page}>
      <h1 className={styles.heading}>{heading}</h1>
      {(signals.data?.signals.length ?? 0) > 0 && (
        <div className={styles.signals} role="status" aria-labelledby="stats-signals-heading">
          <strong id="stats-signals-heading" className={styles.signalsTitle}>
            Тревоги
          </strong>
          <ul>
            {signals.data?.signals.map((signal) => (
              <li key={signal.text}>{signal.text}</li>
            ))}
          </ul>
        </div>
      )}
      <nav className={styles.tabs} aria-label="Разделы статистики">
        {STATS_TABS.map((tab) => (
          <Link key={tab.label} to={tabPath(tab.segment)} className={cx(styles.tab, tab === active && styles.tabActive)} aria-current={tab === active ? "page" : undefined}>
            {tab.label}
          </Link>
        ))}
      </nav>
      <Outlet />
    </main>
  );
}
