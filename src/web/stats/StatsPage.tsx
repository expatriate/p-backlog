import { useEffect, useRef, type RefObject } from "react";
import { statsPath } from "../app/paths";
import { Link, matchPath, Outlet, useLocation, useNavigation, useParams } from "react-router";
import { useProjects, useSignals } from "../app/queries";
import { projectNameOf, scopeNote } from "../app/scope";
import { useMessages } from "../i18n";
import { cx } from "../ui/cx";
import type { StatsMessages } from "./messages.ru";
import styles from "./StatsPage.module.css";

export type StatsOutletContext = { heading: RefObject<HTMLHeadingElement | null> };

const STATS_TABS = [
  { key: "overview", segment: "" },
  { key: "code", segment: "code" },
  { key: "quality", segment: "quality" },
  { key: "effect", segment: "effect" },
  { key: "cost", segment: "cost" },
] as const satisfies readonly { key: keyof StatsMessages["tabs"]; segment: string }[];

export function StatsPage() {
  const { projectId } = useParams();
  const { pathname } = useLocation();
  const projects = useProjects();
  const signals = useSignals(projectId);
  const { app, core, stats } = useMessages();
  const scopeName = projectId === undefined ? stats.projects : projectNameOf(projects.data, projectId);
  const heading = stats.heading(scopeName);
  const base = statsPath(projectId);
  const tabPath = (segment: string) => (segment === "" ? base : `${base}/${segment}`);
  const isTabAt = (segment: string, at: string) => matchPath({ path: tabPath(segment), end: true }, at) !== null;
  const active = STATS_TABS.find((tab) => tab.segment !== "" && isTabAt(tab.segment, pathname)) ?? STATS_TABS[0];
  const pendingPathname = useNavigation().location?.pathname;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const pending = pendingPathname === undefined ? undefined : STATS_TABS.find((tab) => isTabAt(tab.segment, pendingPathname));

  const docTitle = stats.docTitle(active.segment === "" ? heading : `${stats.tabs[active.key]} · ${heading}`);

  useEffect(() => {
    document.title = docTitle;
  }, [docTitle]);

  return (
    <main id="content" tabIndex={-1} className={styles.page} aria-busy={pending !== undefined || undefined}>
      <h1 ref={headingRef} tabIndex={-1} className={styles.heading}>
        {heading}
      </h1>
      {projectId === undefined && projects.data !== undefined && (
        <p className={styles.scopeNote}>{scopeNote(projects.data, app)}</p>
      )}
      {(signals.data?.signals.length ?? 0) > 0 && (
        <div className={styles.signals} role="status" aria-labelledby="stats-signals-heading">
          <strong id="stats-signals-heading" className={styles.signalsTitle}>
            {stats.alerts}
          </strong>
          <ul>
            {signals.data?.signals.map((signal) => (
              <li key={signal.kind}>{core.signal(signal)}</li>
            ))}
          </ul>
        </div>
      )}
      <nav className={styles.tabs} aria-label={stats.tabsLabel}>
        {STATS_TABS.map((tab) => (
          <Link
            key={tab.key}
            to={tabPath(tab.segment)}
            className={cx(styles.tab, tab === active && styles.tabActive, tab === pending && styles.tabPending)}
            aria-current={tab === active ? "page" : undefined}
          >
            {stats.tabs[tab.key]}
          </Link>
        ))}
      </nav>
      <Outlet context={{ heading: headingRef } satisfies StatsOutletContext} />
    </main>
  );
}
