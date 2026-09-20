import { useMemo } from "react";
import { listPath, statsPath } from "../app/paths";
import { Link, matchPath, NavLink, Outlet, useLocation } from "react-router";
import { buildIndex } from "../../core/model/graph";
import { filterTasks, OPEN_STATUSES } from "../../core/model/query";
import { useProjects, useSignals, useTasks } from "../app/queries";
import { cx } from "../ui/cx";
import styles from "./AppLayout.module.css";

export function AppLayout() {
  const projects = useProjects();
  const tasks = useTasks();
  const { pathname, search } = useLocation();

  const allTasks = useMemo(() => tasks.data?.tasks ?? [], [tasks.data]);
  const index = useMemo(() => buildIndex(allTasks), [allTasks]);
  const openCount = (projectId?: string) => filterTasks(allTasks, { projectId, statuses: OPEN_STATUSES }, index).length;
  const projectId = matchPath("/p/:projectId/*", pathname)?.params.projectId;
  const signals = useSignals(projectId);
  const signalCount = signals.data?.signals.length ?? 0;
  const statsTab = (matchPath("/stats/*", pathname) ?? matchPath("/p/:projectId/stats/*", pathname))?.params["*"];
  const onStats = statsTab !== undefined;
  const scopePath = (id?: string) => (onStats ? `${statsPath(id)}${statsTab === "" ? "" : `/${statsTab}`}` : listPath(id));

  return (
    <div className={styles.shell}>
      <a href="#content" className={cx("visually-hidden", styles.skipLink)}>
        Перейти к содержимому
      </a>
      <nav className={styles.sidebar} aria-label="Навигация">
        <div className={styles.brand}>Беклог</div>
        <ul className={styles.projects} aria-label="Разделы">
          <li>
            <Link to={listPath(projectId)} className={navClass(!onStats)} aria-current={onStats ? undefined : "page"}>
              <span className={styles.projectName}>Задачи</span>
            </Link>
          </li>
          <li>
            <Link to={statsPath(projectId)} className={navClass(onStats)} aria-current={onStats ? "page" : undefined}>
              <span className={styles.projectName}>Статистика</span>
              {signalCount > 0 && (
                <>
                  <span className={cx(styles.count, styles.signalCount)} aria-hidden="true">{signalCount}</span>
                  <span className="visually-hidden">, тревог: {signalCount}</span>
                </>
              )}
            </Link>
          </li>
        </ul>
        <div className={styles.groupLabel} id="sidebar-projects">
          Проекты
        </div>
        <ul className={styles.projects} aria-labelledby="sidebar-projects">
          <li>
            <NavLink to={{ pathname: scopePath(), search: onStats ? "" : search }} end className={({ isActive }) => navClass(isActive)}>
              <span className={styles.projectName}>Все проекты</span>
              <span className={styles.count}>{openCount()}</span>
            </NavLink>
          </li>
          {(projects.data ?? []).map((project) => (
            <li key={project.id}>
              <NavLink to={{ pathname: scopePath(project.id), search: onStats ? "" : search }} className={({ isActive }) => navClass(isActive)}>
                <span className={styles.projectName} title={project.name}>
                  {project.name}
                </span>
                <span className={styles.count}>{openCount(project.id)}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <Outlet />
    </div>
  );
}

function navClass(isActive: boolean): string {
  return cx(styles.project, isActive && styles.projectActive);
}
