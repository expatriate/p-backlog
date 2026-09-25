import { useLayoutEffect, useMemo, type RefObject } from "react";
import { Link } from "react-router";
import { formatDateTime } from "../../core/i18n/format";
import { toggleChecklistItem } from "../../core/model/checklist";
import { dependentTasks, epicChildren, isClosed, relatedTasks, taskProgress, type BacklogIndex } from "../../core/model/graph";
import { parseId } from "../../core/model/ids";
import { taskWarnings } from "../../core/model/integrity";
import type { Task } from "../../core/model/types";
import { useLanguage, useMessages } from "../i18n";
import { Button } from "../ui/Button";
import { Countdown } from "../ui/Countdown";
import { ProgressBar } from "../ui/ProgressBar";
import type { Draft } from "../ui/use-draft";
import { useLeaveGuard } from "../ui/use-leave-guard";
import { SidePanel } from "../ui/SidePanel";
import { StatusBadge } from "../ui/StatusBadge";
import { useNow } from "../ui/use-now";
import { TaskBody } from "./TaskBody";
import { TaskFields } from "./TaskFields";
import { TaskOptions, TaskRefs, type TaskHref } from "./TaskRefs";
import { useFieldDrafts } from "./use-field-drafts";
import { useSaveNote, useTaskSaving } from "./use-task-saving";
import styles from "./TaskPanel.module.css";

export type TaskPanelProps = {
  task: Task;
  tasks: readonly Task[];
  index: BacklogIndex;
  taskHref: TaskHref;
  onClose: () => void;
  tone: number | undefined;
  gone: boolean;
};

const TASK_LIST_ID = "task-ids";
const EPIC_LIST_ID = "epic-ids";

export function TaskPanel({ task, tasks, index, taskHref, onClose, tone, gone }: TaskPanelProps) {
  const { core, task: t } = useMessages();
  const saver = useTaskSaving(task);
  const fields = useFieldDrafts(task);
  const bodyEditing = saver.body.draft !== null;
  useLeaveGuard(bodyEditing || fields.unsaved, bodyEditing ? t.leaveWithDraft : t.leaveWithFieldEdits);
  const cardAlerts = distinctTexts([gone ? t.taskGone(task.id) : null, ...saver.alerts, ...fields.conflictAlerts]);
  const saveNote = useSaveNote(saver.lastSave, cardAlerts.length === 0, t);
  const refOptions = useMemo(
    () => (
      <>
        <TaskOptions id={TASK_LIST_ID} tasks={tasks.filter((other) => other.id !== task.id)} />
        <TaskOptions id={EPIC_LIST_ID} tasks={tasks.filter((candidate) => candidate.type === "epic")} />
      </>
    ),
    [tasks, task.id],
  );
  const idPrefix = parseId(task.id)?.prefix ?? task.id;
  const warnings = taskWarnings(task, index).map(core.problem);
  const children = task.type === "epic" ? epicChildren(task, index) : [];

  return (
    <SidePanel
      label={t.cardLabel(task.id)}
      heading={
        <span className={styles.id} data-epic-tone={tone}>
          {task.id}
        </span>
      }
      onClose={onClose}
    >
      <TitleField draft={fields.title} titleRef={fields.titleRef} label={t.title} onSave={(next) => saver.apply({ title: next })} />

      <TaskFields task={task} epicListId={EPIC_LIST_ID} knownTasks={tasks} onChange={saver.apply} tags={fields.tags} tagsRef={fields.tagsRef} epic={fields.epic} epicRef={fields.epicRef} />

      <TaskMeta task={task} index={index} />

      <p className={styles.saving} role="status">
        {saveNote}
      </p>

      {isClosed(task.status) && <ClosureNote task={task} onRestore={() => void saver.apply({ status: "backlog" })} />}

      {cardAlerts.map((text) => (
        <p key={text} className={styles.conflict} role="alert">
          {text}
        </p>
      ))}
      {warnings.length > 0 && (
        <ul className={styles.warnings}>
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}

      <TaskBody
        body={task.body}
        draft={saver.body.draft}
        saving={saver.body.saving}
        onDraftChange={saver.body.edit}
        onToggleLine={(line) => void saver.save((fresh) => ({ body: toggleChecklistItem(fresh.body, line) }))}
        onSave={saver.body.save}
      />

      <TaskRefs
        label={t.blockedByLabel}
        ids={task.blockedBy}
        tasks={tasks}
        listId={TASK_LIST_ID}
        taskHref={taskHref}
        idPrefix={idPrefix}
        onChange={(update) => saver.saveRefs((fresh) => ({ blockedBy: update(fresh.blockedBy) }))}
      />
      <TaskRefs
        label={t.relatedLabel}
        ids={task.related}
        tasks={tasks}
        listId={TASK_LIST_ID}
        taskHref={taskHref}
        idPrefix={idPrefix}
        onChange={(update) => saver.saveRefs((fresh) => ({ related: update(fresh.related) }))}
      />

      <ReadonlyRefs label={t.dependentsLabel} tasks={dependentTasks(task, index)} taskHref={taskHref} />
      <ReadonlyRefs
        label={t.referrersLabel}
        tasks={relatedTasks(task, index).filter((other) => !task.related.includes(other.id))}
        taskHref={taskHref}
      />
      <ReadonlyRefs label={t.epicChildrenLabel} tasks={children} taskHref={taskHref} />

      {refOptions}
    </SidePanel>
  );
}

function distinctTexts(texts: (string | null)[]): string[] {
  return [...new Set(texts.filter((text) => text !== null))];
}

function TaskMeta({ task, index }: { task: Task; index: BacklogIndex }) {
  const language = useLanguage();
  const { task: t } = useMessages();
  return (
    <div className={styles.meta}>
      <StatusBadge status={task.status} />
      <ProgressBar progress={taskProgress(task, index)} />
      <span>
        {t.createdLabel} {formatDateTime(language, task.created)}
      </span>
      {task.source && <span className={styles.source}>{task.source}</span>}
    </div>
  );
}

function ClosureNote({ task, onRestore }: { task: Task; onRestore: () => void }) {
  const language = useLanguage();
  const { core, task: t } = useMessages();
  const now = useNow();
  return (
    <div className={styles.closure}>
      <p>
        {t.closedLabel}
        {task.closed === undefined ? "" : ` ${formatDateTime(language, task.closed)}`}
        {task.resolution !== undefined && ` · ${core.resolutionLabel(task.resolution)} — ${task.reason ?? ""}`}
      </p>
      <Countdown task={task} now={now} />
      <Button className={styles.restore} onClick={onRestore}>
        {t.restoreToBacklog}
      </Button>
    </div>
  );
}

type TitleFieldProps = { draft: Draft; titleRef: RefObject<HTMLTextAreaElement | null>; label: string; onSave: (title: string) => Promise<boolean> };

function TitleField({ draft: title, titleRef, label, onSave }: TitleFieldProps) {
  useLayoutEffect(() => {
    const field = titleRef.current;
    if (!field) return;
    const fit = () => {
      const borders = field.offsetHeight - field.clientHeight;
      field.style.height = "auto";
      field.style.height = `${field.scrollHeight + borders}px`;
    };
    fit();
    const box = field.parentElement;
    if (!box) return;
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    return () => observer.disconnect();
  }, [title.value, titleRef]);

  return (
    <textarea
      ref={titleRef}
      className={styles.title}
      rows={1}
      value={title.value}
      aria-label={label}
      onChange={(event) => title.set(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
      onBlur={() => {
        const next = title.value.trim();
        if (next === "") title.reset();
        else title.commit(onSave);
      }}
    />
  );
}

function ReadonlyRefs({ label, tasks, taskHref }: { label: string; tasks: readonly Task[]; taskHref: TaskHref }) {
  if (tasks.length === 0) return null;
  return (
    <section className={styles.readonlyRefs} aria-label={label}>
      <h2>{label}</h2>
      <ul>
        {tasks.map((task) => (
          <li key={task.id} className={isClosed(task.status) ? styles.refClosed : undefined}>
            <span className={styles.id}>{task.id}</span>{" "}
            <Link to={taskHref(task.id)} className={styles.refLink}>
              {task.title}
            </Link>{" "}
            <StatusBadge status={task.status} />
          </li>
        ))}
      </ul>
    </section>
  );
}
