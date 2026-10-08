import { Link, Outlet, useLocation, useParams } from "react-router";
import { listPath, statsPath, statsTabPath } from "../../core/api/web-paths";
import { useMessages } from "../i18n";
import { useStatsReport } from "../app/queries";
import { cx } from "../ui/cx";
import type { StatsTab } from "../stats/stats-tabs";
import { useStatsTab } from "../stats/use-stats-tab";
import { GraphNotes } from "./GraphNotes";
import { LanguageSwitch } from "./LanguageSwitch";
import { ProjectsScope } from "./ProjectsScope";
import rows from "./SidebarRows.module.css";
import styles from "./AppLayout.module.css";

export function AppLayout() {
  const { layout } = useMessages();
  const { search } = useLocation();
  const { projectId } = useParams();
  const signals = useStatsReport("signals", projectId);
  const signalCount = signals.data?.signals.length ?? 0;
  const statsTab = useStatsTab();
  const onStats = statsTab !== undefined;
  const scopePath = (id?: string) => (onStats ? statsTabPath(statsTab.segment, id) : listPath(id));

  return (
    <div className={styles.shell}>
      <a href="#content" className={cx("visually-hidden", styles.skipLink)}>
        {layout.skipLink}
      </a>
      <nav className={styles.sidebar} aria-label={layout.sidebarNav}>
        <Link to={listPath()} className={styles.brand}>
          {layout.brand}
          <span className={styles.brandMark} aria-hidden="true" />
        </Link>
        <ul className={rows.list} aria-label={layout.sectionsLabel}>
          <li>
            <Link to={listPath(projectId)} className={navClass(!onStats)} aria-current={onStats ? undefined : "page"}>
              <span className={rows.name}>{layout.tasksNav}</span>
            </Link>
          </li>
          <li>
            <Link to={statsPath(projectId)} className={navClass(onStats)} aria-current={statsCurrent(statsTab)}>
              <span className={rows.name}>{layout.statsNav}</span>
              {signalCount > 0 && (
                <>
                  <span className={cx(rows.count, styles.signalCount)} aria-hidden="true">
                    {signalCount}
                  </span>
                  <span className="visually-hidden">{layout.signalsHidden(signalCount)}</span>
                </>
              )}
            </Link>
          </li>
        </ul>
        <ProjectsScope projectId={projectId} scopePath={scopePath} search={onStats ? "" : search} />
        <GraphNotes />
        <LanguageSwitch />
      </nav>
      <Outlet />
    </div>
  );
}

function statsCurrent(statsTab: StatsTab | undefined): "page" | "true" | undefined {
  if (statsTab === undefined) return undefined;
  return statsTab.key === "overview" ? "page" : "true";
}

function navClass(isActive: boolean): string {
  return cx(styles.project, isActive && styles.projectActive);
}
