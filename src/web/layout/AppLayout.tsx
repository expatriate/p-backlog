import { useMemo } from "react";
import { listPath, statsPath } from "../app/paths";
import { Link, matchPath, NavLink, Outlet, useLocation } from "react-router";
import { buildIndex } from "../../core/model/graph";
import { filterTasks, OPEN_STATUSES } from "../../core/model/query";
import type { Project } from "../../core/model/types";
import { useProjects, useSignals, useTasks } from "../app/queries";
import { activeProjectIds, tasksInScope } from "../app/scope";
import { cx } from "../ui/cx";
import { ProjectActions } from "./ProjectActions";
import styles from "./AppLayout.module.css";

export function AppLayout() {
  const projects = useProjects();
  const tasks = useTasks();
  const { pathname, search } = useLocation();

  const allTasks = useMemo(() => tasks.data?.tasks ?? [], [tasks.data]);
  const index = useMemo(() => buildIndex(allTasks), [allTasks]);
  const allProjects = useMemo(() => projects.data ?? [], [projects.data]);
  const activeIds = useMemo(() => activeProjectIds(allProjects), [allProjects]);
  const openCount = (projectId?: string) => filterTasks(tasksInScope(allTasks, projectId, activeIds), { statuses: OPEN_STATUSES }, index).length;
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
            <NavLink to={{ pathname: scopePath(), search: onStats ? "" : search }} end aria-current="true" className={({ isActive }) => navClass(isActive)}>
              <span className={styles.projectName}>Все проекты</span>
              <span className={styles.count}>{openCount()}</span>
            </NavLink>
          </li>
          {allProjects
            .filter((project) => project.active)
            .map((project) => (
              <ProjectRow key={project.id} project={project} to={scopePath(project.id)} search={onStats ? "" : search} openTasks={openCount(project.id)} />
            ))}
        </ul>
        {allProjects.some((project) => !project.active) && (
          <>
            <div className={styles.groupLabel} id="sidebar-inactive">
              Неактивные
            </div>
            <ul className={cx(styles.projects, styles.inactive)} aria-labelledby="sidebar-inactive">
              {allProjects
                .filter((project) => !project.active)
                .map((project) => (
                  <ProjectRow key={project.id} project={project} to={scopePath(project.id)} search={onStats ? "" : search} openTasks={openCount(project.id)} />
                ))}
            </ul>
          </>
        )}
      </nav>
      <Outlet />
    </div>
  );
}

function ProjectRow({ project, to, search, openTasks }: { project: Project; to: string; search: string; openTasks: number }) {
  return (
    <li className={styles.row}>
      <NavLink to={{ pathname: to, search }} aria-current="true" className={({ isActive }) => navClass(isActive)}>
        <span className={styles.projectName} title={project.name}>
          {project.name}
        </span>
        <span className={styles.count}>{openTasks}</span>
      </NavLink>
      <ProjectActions project={project} openTasks={openTasks} />
    </li>
  );
}

function navClass(isActive: boolean): string {
  return cx(styles.project, isActive && styles.projectActive);
}
