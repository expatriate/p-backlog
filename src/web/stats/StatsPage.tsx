import { useEffect } from "react";
import { Link, Outlet, useLocation, useParams } from "react-router";
import { useProjects } from "../app/queries";
import { cx } from "../ui/cx";
import styles from "./StatsPage.module.css";

const STATS_TABS = [
  { label: "Обзор", segment: "" },
  { label: "Поток", segment: "flow" },
] as const;

export function StatsPage() {
  const { projectId } = useParams();
  const { pathname } = useLocation();
  const projects = useProjects();
  const scopeName = projectId === undefined ? "Все проекты" : (projects.data?.find((project) => project.id === projectId)?.name ?? projectId);
  const heading = `Статистика · ${scopeName}`;
  const base = projectId === undefined ? "/stats" : `/p/${projectId}/stats`;
  const tabPath = (segment: string) => (segment === "" ? base : `${base}/${segment}`);
  const active = STATS_TABS.find((tab) => tab.segment !== "" && pathname === tabPath(tab.segment)) ?? STATS_TABS[0];

  useEffect(() => {
    document.title = active.segment === "" ? `${heading} — Беклог` : `${active.label} · ${heading} — Беклог`;
  }, [active, heading]);

  return (
    <main className={styles.page}>
      <h1 className={styles.heading}>{heading}</h1>
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
