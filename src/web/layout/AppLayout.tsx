import { useMemo, useRef, useState, type ReactNode } from "react";
import { listPath, statsPath } from "../app/paths";
import { Link, matchPath, NavLink, Outlet, useLocation } from "react-router";
import type { ProjectView } from "../../core/api/contract";
import type { GraphState } from "../../core/check/graph-health";
import type { Task } from "../../core/model/types";
import { useProjects, useSignals, useTasks } from "../app/queries";
import { OPEN_STATUSES } from "../../core/model/query";
import { countBy } from "../../core/stats/numbers";
import { activeProjectIds, scopeNote, tasksInScope } from "../app/scope";
import { NBSP, plural, pluralCount } from "../../core/stats/format";
import { cx } from "../ui/cx";
import { ProjectCheckbox, ProjectDeleteButton } from "./ProjectControls";
import styles from "./AppLayout.module.css";

const PROJECT_LIST_ID = "sidebar-projects";
const UNKNOWN_COUNT = "—";

type GraphTrouble = Exclude<GraphState, "fresh">;

const GRAPH_NOTES: Record<GraphTrouble, { title: string; hint: ReactNode }> = {
  none: { title: "Без графа кода", hint: <><code>code-review-graph build</code> — кандидаты проверки точнее</> },
  stale: { title: "Граф кода устарел", hint: <><code>code-review-graph watch</code> или хук <code>update</code> — без них проверка не видит символов</> },
  unreadable: { title: "Граф кода не читается", hint: <><code>code-review-graph build</code> заново — база другой версии или от другого пути</> },
};

export function AppLayout() {
  const projects = useProjects();
  const tasks = useTasks();
  const { pathname, search } = useLocation();

  const allProjects = useMemo(() => projects.data ?? [], [projects.data]);
  const activeIds = useMemo(() => activeProjectIds(allProjects), [allProjects]);
  const counts = useMemo(() => (tasks.data === undefined ? undefined : taskCounts(tasks.data.tasks, activeIds)), [tasks.data, activeIds]);
  const projectId = matchPath("/p/:projectId/*", pathname)?.params.projectId;
  const signals = useSignals(projectId);
  const signalCount = signals.data?.signals.length ?? 0;
  const statsTab = (matchPath("/stats/*", pathname) ?? matchPath("/p/:projectId/stats/*", pathname))?.params["*"];
  const onStats = statsTab !== undefined;
  const scopePath = (id?: string) => (onStats ? `${statsPath(id)}${statsTab === "" ? "" : `/${statsTab}`}` : listPath(id));
  const graphTroubles = useMemo(() => graphTroubleCounts(allProjects), [allProjects]);
  const [listOpen, setListOpen] = useState(true);
  const scopeLink = useRef<HTMLAnchorElement>(null);

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
            <Link to={statsPath(projectId)} className={navClass(onStats)} aria-current={statsCurrent(statsTab)}>
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
            <button
              type="button"
              className={styles.disclosure}
              aria-expanded={listOpen}
              aria-controls={listOpen ? PROJECT_LIST_ID : undefined}
              aria-label={listOpen ? "Свернуть список проектов" : "Развернуть список проектов"}
              onClick={() => setListOpen(!listOpen)}
            >
              <Chevron open={listOpen} />
            </button>
            <NavLink ref={scopeLink} to={{ pathname: scopePath(), search: onStats ? "" : search }} end aria-current="true" className={cx(styles.rowLink, styles.scopeName)}>
              Проекты
            </NavLink>
            <span className={styles.count}>
              {counts === undefined ? (
                UNKNOWN_COUNT
              ) : (
                <>
                  <span className={styles.number}>{counts.scopeOpen}</span> {plural(counts.scopeOpen, "задача", "задачи", "задач")}
                </>
              )}
            </span>
          </div>
          {projects.data !== undefined && (
            <p className={styles.scopeNote}>
              {scopeNote(allProjects)}
              {listOpen && `${NBSP}— с${NBSP}галочкой`}
            </p>
          )}
          {listOpen && (
            <ul className={styles.projects} id={PROJECT_LIST_ID} aria-label="Проекты">
              {allProjects.map((project) => (
                <ProjectRow
                  key={project.id}
                  project={project}
                  to={scopePath(project.id)}
                  search={onStats ? "" : search}
                  openTasks={counts === undefined ? undefined : (counts.openByProject.get(project.id) ?? 0)}
                  taskCount={counts === undefined ? undefined : (counts.totalByProject.get(project.id) ?? 0)}
                  onDeleted={() => scopeLink.current?.focus()}
                />
              ))}
            </ul>
          )}
        </div>
        {graphTroubles.length > 0 && (
          <div className={styles.graphNotes}>
            {graphTroubles.map(([state, count]) => (
              <p key={state} className={styles.graphNote}>
                {GRAPH_NOTES[state].title}: {pluralCount(count, "проект", "проекта", "проектов")}
                <span>{GRAPH_NOTES[state].hint}</span>
              </p>
            ))}
          </div>
        )}
      </nav>
      <Outlet />
    </div>
  );
}

type ProjectRowProps = { to: string; search: string; openTasks: number | undefined; taskCount: number | undefined; project: ProjectView; onDeleted: () => void };

function ProjectRow({ to, search, openTasks, taskCount, project, onDeleted }: ProjectRowProps) {
  return (
    <li className={cx(styles.row, !project.active && styles.muted)}>
      <ProjectCheckbox project={project} />
      <NavLink to={{ pathname: to, search }} aria-current="true" className={cx(styles.rowLink)}>
        <span className={styles.projectName} title={project.name}>
          {project.name}
        </span>
      </NavLink>
      <span className={styles.count}>{openTasks ?? UNKNOWN_COUNT}</span>
      <ProjectDeleteButton project={project} taskCount={taskCount} onDeleted={onDeleted} />
    </li>
  );
}

type TaskCounts = { scopeOpen: number; openByProject: ReadonlyMap<string, number>; totalByProject: ReadonlyMap<string, number> };

function taskCounts(tasks: readonly Task[], activeIds: ReadonlySet<string>): TaskCounts {
  const open = tasks.filter((task) => OPEN_STATUSES.includes(task.status));
  return {
    scopeOpen: tasksInScope(open, undefined, activeIds).length,
    openByProject: countBy(open, (task) => task.projectId),
    totalByProject: countBy(tasks, (task) => task.projectId),
  };
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {open ? <path d="M4 6.5 8 10.5l4-4" /> : <path d="M6 4l4 4-4 4" />}
    </svg>
  );
}

function statsCurrent(statsTab: string | undefined): "page" | "true" | undefined {
  if (statsTab === undefined) return undefined;
  return statsTab === "" ? "page" : "true";
}

function navClass(isActive: boolean): string {
  return cx(styles.project, isActive && styles.projectActive);
}

function graphTroubleCounts(projects: readonly ProjectView[]): [GraphTrouble, number][] {
  const watched = projects.filter((project) => project.active && project.repos.length > 0);
  return (Object.keys(GRAPH_NOTES) as GraphTrouble[]).flatMap((state): [GraphTrouble, number][] => {
    const count = watched.filter((project) => project.codeGraph === state).length;
    return count === 0 ? [] : [[state, count]];
  });
}
