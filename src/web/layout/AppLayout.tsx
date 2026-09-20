import { useMemo } from "react";
import { listPath, statsPath } from "../app/paths";
import { Link, matchPath, NavLink, Outlet, useLocation } from "react-router";
import { buildIndex } from "../../core/model/graph";
import type { Project } from "../../core/model/types";
import { useProjects, useSignals, useTasks } from "../app/queries";
import { activeProjectIds, tasksInScope } from "../app/scope";
import { cx } from "../ui/cx";
import { ProjectActions } from "./ProjectActions";
import { healthSpeech, projectHealth, type ProjectHealth } from "./project-health";
import styles from "./AppLayout.module.css";

export function AppLayout() {
  const projects = useProjects();
  const tasks = useTasks();
  const { pathname, search } = useLocation();

  const allTasks = useMemo(() => tasks.data?.tasks ?? [], [tasks.data]);
  const index = useMemo(() => buildIndex(allTasks), [allTasks]);
  const allProjects = useMemo(() => projects.data ?? [], [projects.data]);
  const activeIds = useMemo(() => activeProjectIds(allProjects), [allProjects]);
  const healthOf = (projectId?: string) => projectHealth(tasksInScope(allTasks, projectId, activeIds), index);
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
        <Link to={listPath()} className={styles.brand}>
          беклог
          <span className={styles.brandMark} aria-hidden="true" />
        </Link>
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
          <ProjectRow to={scopePath()} search={onStats ? "" : search} name="Все проекты" health={healthOf()} end />
          {allProjects
            .filter((project) => project.active)
            .map((project) => (
              <ProjectRow key={project.id} project={project} to={scopePath(project.id)} search={onStats ? "" : search} name={project.name} health={healthOf(project.id)} />
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
                  <ProjectRow key={project.id} project={project} to={scopePath(project.id)} search={onStats ? "" : search} name={project.name} health={healthOf(project.id)} />
                ))}
            </ul>
          </>
        )}
      </nav>
      <Outlet />
    </div>
  );
}

type ProjectRowProps = { name: string; to: string; search: string; health: ProjectHealth; project?: Project; end?: boolean };

function ProjectRow({ name, to, search, health, project, end = false }: ProjectRowProps) {
  return (
    <li className={styles.row}>
      <div className={styles.rowLine}>
        <NavLink to={{ pathname: to, search }} end={end} aria-current="true" className={cx(styles.rowLink)}>
          <span className={styles.projectName} title={name}>
            {name}
          </span>
        </NavLink>
        {project === undefined ? <span className={styles.actionsSlot} /> : <ProjectActions project={project} openTasks={health.open} />}
        <span className={styles.count}>{health.open}</span>
      </div>
      <HealthBar health={health} />
    </li>
  );
}

function HealthBar({ health }: { health: ProjectHealth }) {
  if (health.open === 0) return null;
  const share = (count: number) => `${(count / health.open) * 100}%`;
  return (
    <span className={styles.health} role="img" aria-label={healthSpeech(health)}>
      <span className={styles.critical} style={{ width: share(health.critical) }} />
      <span className={styles.high} style={{ width: share(health.high) }} />
      <span className={styles.rest} style={{ width: share(health.rest) }} />
    </span>
  );
}

function navClass(isActive: boolean): string {
  return cx(styles.project, isActive && styles.projectActive);
}
