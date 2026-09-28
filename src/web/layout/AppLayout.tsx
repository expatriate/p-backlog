import { Fragment, useMemo, useRef, useState } from "react";
import { listPath, statsPath } from "../../core/api/web-paths";
import { Link, matchPath, NavLink, Outlet, useLocation, useNavigate } from "react-router";
import type { ProjectView } from "../../core/api/contract";
import type { Task } from "../../core/model/types";
import { useMessages } from "../i18n";
import { useProjects, useSignals, useTasks } from "../app/queries";
import { OPEN_STATUSES } from "../../core/model/query";
import { countBy } from "../../core/stats/numbers";
import { RequestFailure } from "../app/RequestFailure";
import { scopeNote, taskScope, type TaskScope } from "../app/scope";
import { NO_VALUE } from "../labels";
import { cx } from "../ui/cx";
import type { GraphTrouble, HintPart } from "./messages.ru";
import { LanguageSwitch } from "./LanguageSwitch";
import { ProjectCheckbox, ProjectDeleteButton } from "./ProjectControls";
import styles from "./AppLayout.module.css";

const PROJECT_LIST_ID = "sidebar-projects";
const GRAPH_TROUBLES: readonly GraphTrouble[] = ["none", "stale", "unreadable"];

export function AppLayout() {
  const { layout } = useMessages();
  const { pathname, search } = useLocation();

  const projectId = matchPath("/p/:projectId/*", pathname)?.params.projectId;
  const signals = useSignals(projectId);
  const signalCount = signals.data?.signals.length ?? 0;
  const statsTab = (matchPath("/stats/*", pathname) ?? matchPath("/p/:projectId/stats/*", pathname))?.params["*"];
  const onStats = statsTab !== undefined;
  const scopePath = (id?: string) => (onStats ? `${statsPath(id)}${statsTab === "" ? "" : `/${statsTab}`}` : listPath(id));

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
        <ul className={styles.projects} aria-label={layout.sectionsLabel}>
          <li>
            <Link to={listPath(projectId)} className={navClass(!onStats)} aria-current={onStats ? undefined : "page"}>
              <span className={styles.projectName}>{layout.tasksNav}</span>
            </Link>
          </li>
          <li>
            <Link to={statsPath(projectId)} className={navClass(onStats)} aria-current={statsCurrent(statsTab)}>
              <span className={styles.projectName}>{layout.statsNav}</span>
              {signalCount > 0 && (
                <>
                  <span className={cx(styles.count, styles.signalCount)} aria-hidden="true">{signalCount}</span>
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

type ProjectsScopeProps = { projectId: string | undefined; scopePath: (id?: string) => string; search: string };

function ProjectsScope({ projectId, scopePath, search }: ProjectsScopeProps) {
  const { app, layout } = useMessages();
  const projects = useProjects();
  const tasks = useTasks();
  const allProjects = useMemo(() => projects.data ?? [], [projects.data]);
  const inScope = useMemo(() => taskScope(projects.data, undefined), [projects.data]);
  const counts = useMemo(() => (tasks.data === undefined ? undefined : taskCounts(tasks.data.tasks, inScope)), [tasks.data, inScope]);
  const [listOpen, setListOpen] = useState(true);
  const scopeLink = useRef<HTMLAnchorElement>(null);
  const navigate = useNavigate();

  return (
    <div className={styles.scope}>
      <div className={cx(styles.row, styles.scopeRow, projectId === undefined && styles.scopeCurrent)}>
        <button
          type="button"
          className={styles.disclosure}
          aria-expanded={listOpen}
          aria-controls={listOpen ? PROJECT_LIST_ID : undefined}
          aria-label={listOpen ? layout.collapseProjects : layout.expandProjects}
          onClick={() => setListOpen(!listOpen)}
        >
          <Chevron open={listOpen} />
        </button>
        <NavLink ref={scopeLink} to={{ pathname: scopePath(), search }} end aria-current="true" className={cx(styles.rowLink, styles.scopeName)}>
          {layout.projects}
        </NavLink>
        <span className={styles.count}>
          {counts?.scopeOpen === undefined ? (
            NO_VALUE
          ) : (
            <>
              <span className={styles.number}>{counts.scopeOpen}</span> {layout.taskWord(counts.scopeOpen)}
            </>
          )}
        </span>
      </div>
      {projects.data !== undefined && (
        <p className={styles.scopeNote}>
          {scopeNote(allProjects, app)}
          {listOpen && layout.checkedSuffix}
        </p>
      )}
      {projects.error !== null && (
        <div className={styles.projectsFailure}>
          <RequestFailure error={projects.error} fetching={projects.isFetching} onRetry={() => void projects.refetch()} />
        </div>
      )}
      {listOpen && (
        <ul className={styles.projects} id={PROJECT_LIST_ID} aria-label={layout.projects}>
          {allProjects.map((project) => (
            <ProjectRow
              key={project.id}
              project={project}
              to={scopePath(project.id)}
              search={search}
              openTasks={counts === undefined ? undefined : (counts.openByProject.get(project.id) ?? 0)}
              taskCount={counts === undefined ? undefined : (counts.totalByProject.get(project.id) ?? 0)}
              onDeleted={() => {
                if (project.id === projectId) void navigate(scopePath());
                scopeLink.current?.focus();
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function GraphNotes() {
  const { layout, core } = useMessages();
  const projects = useProjects();
  const graphTroubles = useMemo(() => graphTroubleCounts(projects.data ?? []), [projects.data]);
  if (graphTroubles.length === 0) return null;

  return (
    <div className={styles.graphNotes}>
      {graphTroubles.map(([state, count]) => {
        const note = layout.graphNotes[state];
        return (
          <p key={state} className={styles.graphNote}>
            {note.title}: {core.count(count, "project")}
            <span>
              <GraphHint parts={note.hint} />
            </span>
          </p>
        );
      })}
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
      <span className={styles.count}>{openTasks ?? NO_VALUE}</span>
      <ProjectDeleteButton project={project} taskCount={taskCount} onDeleted={onDeleted} />
    </li>
  );
}

function GraphHint({ parts }: { parts: readonly HintPart[] }) {
  return (
    <>
      {parts.map((part, index) => (
        <Fragment key={index}>{"code" in part ? <code>{part.code}</code> : part.text}</Fragment>
      ))}
    </>
  );
}

type TaskCounts = { scopeOpen: number | undefined; openByProject: ReadonlyMap<string, number>; totalByProject: ReadonlyMap<string, number> };

function taskCounts(tasks: readonly Task[], inScope: TaskScope | undefined): TaskCounts {
  const open = tasks.filter((task) => OPEN_STATUSES.includes(task.status));
  return {
    scopeOpen: inScope === undefined ? undefined : open.filter(inScope).length,
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
  return GRAPH_TROUBLES.flatMap((state): [GraphTrouble, number][] => {
    const count = watched.filter((project) => project.codeGraph === state).length;
    return count === 0 ? [] : [[state, count]];
  });
}
