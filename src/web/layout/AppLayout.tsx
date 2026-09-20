import { useMemo, useState } from "react";
import { listPath, statsPath } from "../app/paths";
import { Link, matchPath, NavLink, Outlet, useLocation } from "react-router";
import { buildIndex } from "../../core/model/graph";
import type { Project } from "../../core/model/types";
import { useProjects, useSignals, useTasks } from "../app/queries";
import { activeProjectIds, tasksInScope } from "../app/scope";
import { plural, pluralCount } from "../../core/stats/format";
import { cx } from "../ui/cx";
import { ProjectCheckbox, ProjectDeleteButton } from "./ProjectControls";
import { healthSpeech, projectHealth, type ProjectHealth } from "./project-health";
import styles from "./AppLayout.module.css";

const PROJECT_LIST_ID = "sidebar-projects";

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
  const scopeHealth = healthOf();
  const [listOpen, setListOpen] = useState(true);

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
        <div className={styles.scope}>
          <div className={cx(styles.row, styles.scopeRow, projectId === undefined && styles.scopeCurrent)}>
            <div className={styles.rowLine}>
              <button
                type="button"
                className={styles.disclosure}
                aria-expanded={listOpen}
                aria-controls={PROJECT_LIST_ID}
                aria-label={listOpen ? "Свернуть список проектов" : "Развернуть список проектов"}
                onClick={() => setListOpen(!listOpen)}
              >
                <Chevron open={listOpen} />
              </button>
              <NavLink to={{ pathname: scopePath(), search: onStats ? "" : search }} end aria-current="true" className={cx(styles.rowLink, styles.scopeName)}>
                Проекты
              </NavLink>
              <span className={styles.count}>
                <span className={styles.number}>{scopeHealth.open}</span> {plural(scopeHealth.open, "задача", "задачи", "задач")}
              </span>
            </div>
            <HealthBar health={scopeHealth} />
          </div>
          {listOpen ? (
            <ul className={styles.projects} id={PROJECT_LIST_ID} aria-label="Проекты">
              {allProjects.map((project) => (
                <ProjectRow key={project.id} project={project} to={scopePath(project.id)} search={onStats ? "" : search} name={project.name} health={healthOf(project.id)} />
              ))}
            </ul>
          ) : (
            <p className={styles.scopeNote} id={PROJECT_LIST_ID}>
              учтено {activeIds.size} из {pluralCount(allProjects.length, "проекта", "проектов", "проектов")}
            </p>
          )}
        </div>
      </nav>
      <Outlet />
    </div>
  );
}

type ProjectRowProps = { name: string; to: string; search: string; health: ProjectHealth; project: Project };

function ProjectRow({ name, to, search, health, project }: ProjectRowProps) {
  return (
    <li className={cx(styles.row, !project.active && styles.muted)}>
      <div className={styles.rowLine}>
        <ProjectCheckbox project={project} />
        <NavLink to={{ pathname: to, search }} aria-current="true" className={cx(styles.rowLink)}>
          <span className={styles.projectName} title={name}>
            {name}
          </span>
        </NavLink>
        <span className={styles.count}>{health.open}</span>
        <ProjectDeleteButton project={project} openTasks={health.open} />
      </div>
      {project.active && <HealthBar health={health} />}
    </li>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {open ? <path d="M4 6.5 8 10.5l4-4" /> : <path d="M6 4l4 4-4 4" />}
    </svg>
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
