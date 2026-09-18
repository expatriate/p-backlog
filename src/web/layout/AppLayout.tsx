import { useMemo } from "react";
import { Link, matchPath, NavLink, Outlet, useLocation } from "react-router";
import { buildIndex } from "../../core/model/graph";
import { filterTasks, OPEN_STATUSES } from "../../core/model/query";
import { useProjects, useTasks } from "../app/queries";
import { AUTO_CLOSED_VIEW, writeListParams } from "../list/list-params";
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
  const autoClosedCount = filterTasks(allTasks, { projectId, ...AUTO_CLOSED_VIEW.filter }, index).length;
  const autoClosedActive = new URLSearchParams(search).get("auto") === "1";

  return (
    <div className={styles.shell}>
      <nav className={styles.sidebar} aria-label="Проекты">
        <div className={styles.brand}>Беклог</div>
        <ul className={styles.projects}>
          <li>
            <NavLink to={{ pathname: "/", search }} end className={({ isActive }) => navClass(isActive)}>
              <span className={styles.projectName}>Все проекты</span>
              <span className={styles.count}>{openCount()}</span>
            </NavLink>
          </li>
          {(projects.data ?? []).map((project) => (
            <li key={project.id}>
              <NavLink to={{ pathname: `/p/${project.id}`, search }} className={({ isActive }) => navClass(isActive)}>
                <span className={styles.projectName}>{project.name}</span>
                <span className={styles.count}>{openCount(project.id)}</span>
              </NavLink>
            </li>
          ))}
        </ul>
        <Link
          to={{ pathname: projectId === undefined ? "/" : `/p/${projectId}`, search: writeListParams(AUTO_CLOSED_VIEW).toString() }}
          className={navClass(autoClosedActive)}
        >
          <span className={styles.projectName}>Закрыты агентом</span>
          <span className={styles.count}>{autoClosedCount}</span>
        </Link>
      </nav>
      <Outlet />
    </div>
  );
}

function navClass(isActive: boolean): string {
  return cx(styles.project, isActive && styles.projectActive);
}
