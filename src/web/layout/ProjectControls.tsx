import { useEffect, useRef, useState, type RefObject } from "react";
import { useNavigate } from "react-router";
import type { Project } from "../../core/model/types";
import { listPath } from "../app/paths";
import { useDeleteProject, useSetProjectActive } from "../app/queries";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import styles from "./ProjectControls.module.css";

export function ProjectCheckbox({ project }: { project: Project }) {
  const setActive = useSetProjectActive();

  return (
    <>
      <label className={styles.checkbox}>
        <input
          type="checkbox"
          checked={project.active}
          aria-label={`Учитывать проект ${project.name} в области «Проекты»`}
          onChange={(event) => setActive.mutate({ id: project.id, active: event.target.checked })}
        />
      </label>
      <MutationError error={setActive.error} action={`Не удалось ${setActive.variables?.active ? "учесть" : "исключить"} проект`} />
    </>
  );
}

export type ProjectDeleteButtonProps = { project: Project; taskCount: number | undefined; onDeleted: () => void };

export function ProjectDeleteButton({ project, taskCount, onDeleted }: ProjectDeleteButtonProps) {
  const [confirming, setConfirming] = useState(false);
  const deleteButton = useFocusAfterDialogCloses<HTMLButtonElement>(confirming);
  const deleteProject = useDeleteProject();
  const navigate = useNavigate();

  return (
    <>
      <button ref={deleteButton} type="button" className={styles.delete} aria-label={`Удалить проект ${project.name}`} title="Удалить проект" onClick={() => setConfirming(true)}>
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.2h5.8l.6-8.2" />
        </svg>
      </button>
      <MutationError error={deleteProject.error} action="Не удалось удалить проект" />
      <ConfirmDialog
        open={confirming}
        title={`Удалить проект «${project.name}»?`}
        description={
          taskCount === undefined
            ? "Каталог проекта удалится со всеми задачами, отменить нельзя."
            : `Задач: ${taskCount}. Каталог проекта удалится вместе с ними, отменить нельзя.`
        }
        confirmWord={project.id}
        confirmWordLabel={`Введите id проекта: ${project.id}`}
        confirmLabel="Удалить"
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          deleteProject.mutate({ id: project.id, confirm: project.id }, {
            onSuccess: () => {
              void navigate(listPath());
              onDeleted();
            },
          });
        }}
      />
    </>
  );
}

function useFocusAfterDialogCloses<T extends HTMLElement>(dialogOpen: boolean): RefObject<T | null> {
  const target = useRef<T>(null);
  useEffect(() => {
    const element = target.current;
    if (!dialogOpen) return;
    return () => element?.focus();
  }, [dialogOpen]);
  return target;
}

function MutationError({ error, action }: { error: Error | null; action: string }) {
  if (error === null) return null;
  return (
    <span className={styles.error} role="alert">
      {action}: {error.message}
    </span>
  );
}
