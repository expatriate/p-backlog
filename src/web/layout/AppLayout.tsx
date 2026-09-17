import { useMemo } from "react";
import { NavLink, Outlet, useLocation } from "react-router";
import { buildIndex } from "../../core/model/graph";
import { filterTasks, OPEN_STATUSES } from "../../core/model/query";
import { useProjects, useTasks } from "../app/queries";
import { cx } from "../ui/cx";
import styles from "./AppLayout.module.css";

export function AppLayout() {
  const projects = useProjects();
  const tasks = useTasks();
  const { search } = useLocation();

  const allTasks = useMemo(() => tasks.data?.tasks ?? [], [tasks.data]);
  const index = useMemo(() => buildIndex(allTasks), [allTasks]);
  const openCount = (projectId?: string) => filterTasks(allTasks, { projectId, statuses: OPEN_STATUSES }, index).length;

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
      </nav>
      <Outlet />
    </div>
  );
}

function navClass(isActive: boolean): string {
  return cx(styles.project, isActive && styles.projectActive);
}
