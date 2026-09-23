import { useEffect, useRef, type RefObject } from "react";
import { statsPath } from "../app/paths";
import { Link, matchPath, Outlet, useLocation, useNavigation, useParams } from "react-router";
import { coreMessages } from "../../core/messages";
import { useProjects, useSignals } from "../app/queries";
import { projectNameOf, scopeNote } from "../app/scope";
import { cx } from "../ui/cx";
import styles from "./StatsPage.module.css";

const messages = coreMessages("ru");

export type StatsOutletContext = { heading: RefObject<HTMLHeadingElement | null> };

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
  const scopeName = projectId === undefined ? "Проекты" : projectNameOf(projects.data, projectId);
  const heading = `Статистика · ${scopeName}`;
  const base = statsPath(projectId);
  const tabPath = (segment: string) => (segment === "" ? base : `${base}/${segment}`);
  const isTabAt = (segment: string, at: string) => matchPath({ path: tabPath(segment), end: true }, at) !== null;
  const active = STATS_TABS.find((tab) => tab.segment !== "" && isTabAt(tab.segment, pathname)) ?? STATS_TABS[0];
  const pendingPathname = useNavigation().location?.pathname;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const pending = pendingPathname === undefined ? undefined : STATS_TABS.find((tab) => isTabAt(tab.segment, pendingPathname));

  useEffect(() => {
    document.title = active.segment === "" ? `${heading} — Беклог` : `${active.label} · ${heading} — Беклог`;
  }, [active, heading]);

  return (
    <main id="content" tabIndex={-1} className={styles.page} aria-busy={pending !== undefined || undefined}>
      <h1 ref={headingRef} tabIndex={-1} className={styles.heading}>
        {heading}
      </h1>
      {projectId === undefined && projects.data !== undefined && (
        <p className={styles.scopeNote}>{scopeNote(projects.data)}</p>
      )}
      {(signals.data?.signals.length ?? 0) > 0 && (
        <div className={styles.signals} role="status" aria-labelledby="stats-signals-heading">
          <strong id="stats-signals-heading" className={styles.signalsTitle}>
            Тревоги
          </strong>
          <ul>
            {signals.data?.signals.map((signal) => (
              <li key={signal.kind}>{messages.signal(signal)}</li>
            ))}
          </ul>
        </div>
      )}
      <nav className={styles.tabs} aria-label="Разделы статистики">
        {STATS_TABS.map((tab) => (
          <Link
            key={tab.label}
            to={tabPath(tab.segment)}
            className={cx(styles.tab, tab === active && styles.tabActive, tab === pending && styles.tabPending)}
            aria-current={tab === active ? "page" : undefined}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      <Outlet context={{ heading: headingRef } satisfies StatsOutletContext} />
    </main>
  );
}
