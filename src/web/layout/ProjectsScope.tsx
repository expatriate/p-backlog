import { useMemo, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router";
import type { ProjectView } from "../../core/api/contract";
import { countBy } from "../../core/collections";
import type { Task } from "../../core/model/types";
import { useProjects, useTasks } from "../app/queries";
import { RequestFailure } from "../app/RequestFailure";
import { countOpenTasks, isOpenTask, scopeNote, taskScope, type TaskScope } from "../app/scope";
import { useMessages } from "../i18n";
import { NO_VALUE } from "../labels";
import { cx } from "../ui/cx";
import { ProjectCheckbox, ProjectDeleteButton } from "./ProjectControls";
import rows from "./SidebarRows.module.css";
import styles from "./ProjectsScope.module.css";

const PROJECT_LIST_ID = "sidebar-projects";

type ProjectsScopeProps = { projectId: string | undefined; scopePath: (id?: string) => string; search: string };

export function ProjectsScope({ projectId, scopePath, search }: ProjectsScopeProps) {
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
        <span className={rows.count}>
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
        <ul className={rows.list} id={PROJECT_LIST_ID} aria-label={layout.projects}>
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

type ProjectRowProps = { to: string; search: string; openTasks: number | undefined; taskCount: number | undefined; project: ProjectView; onDeleted: () => void };

function ProjectRow({ to, search, openTasks, taskCount, project, onDeleted }: ProjectRowProps) {
  return (
    <li className={cx(styles.row, !project.active && rows.muted)}>
      <ProjectCheckbox project={project} />
      <NavLink to={{ pathname: to, search }} aria-current="true" className={cx(styles.rowLink)}>
        <span className={rows.name} title={project.name}>
          {project.name}
        </span>
      </NavLink>
      <span className={rows.count}>{openTasks ?? NO_VALUE}</span>
      <ProjectDeleteButton project={project} taskCount={taskCount} onDeleted={onDeleted} />
    </li>
  );
}

type TaskCounts = { scopeOpen: number | undefined; openByProject: ReadonlyMap<string, number>; totalByProject: ReadonlyMap<string, number> };

function taskCounts(tasks: readonly Task[], inScope: TaskScope | undefined): TaskCounts {
  const open = tasks.filter(isOpenTask);
  return {
    scopeOpen: inScope === undefined ? undefined : countOpenTasks(tasks, inScope).inScope,
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
