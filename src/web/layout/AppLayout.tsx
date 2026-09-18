import { useMemo } from "react";
import { Link, matchPath, NavLink, Outlet, useLocation } from "react-router";
import { buildIndex } from "../../core/model/graph";
import { filterTasks, OPEN_STATUSES } from "../../core/model/query";
import { useProjects, useTasks } from "../app/queries";
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
  const onStats = matchPath("/stats", pathname) !== null || matchPath("/p/:projectId/stats", pathname) !== null;

  const scopePath = onStats ? statsPath : listPath;

  return (
    <div className={styles.shell}>
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
                <span className={styles.projectName}>{project.name}</span>
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

function listPath(projectId?: string): string {
  return projectId === undefined ? "/" : `/p/${projectId}`;
}

function statsPath(projectId?: string): string {
  return projectId === undefined ? "/stats" : `/p/${projectId}/stats`;
}

function navClass(isActive: boolean): string {
  return cx(styles.project, isActive && styles.projectActive);
}
