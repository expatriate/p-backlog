import { useState } from "react";
import { useNavigate } from "react-router";
import type { Project } from "../../core/model/types";
import { listPath } from "../app/paths";
import { useDeleteProject, useSetProjectActive } from "../app/queries";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import styles from "./ProjectControls.module.css";

export function ProjectCheckbox({ project }: { project: Project }) {
  const setActive = useSetProjectActive();

  return (
    <label className={styles.checkbox}>
      <input
        type="checkbox"
        checked={project.active}
        aria-label={`Учитывать ${project.name} в «Проекты»`}
        onChange={(event) => setActive.mutate({ id: project.id, active: event.target.checked })}
      />
    </label>
  );
}

export function ProjectDeleteButton({ project, openTasks }: { project: Project; openTasks: number }) {
  const [confirming, setConfirming] = useState(false);
  const deleteProject = useDeleteProject();
  const navigate = useNavigate();

  return (
    <>
      <button type="button" className={styles.delete} aria-label={`Удалить проект ${project.name}`} title="Удалить проект" onClick={() => setConfirming(true)}>
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.2h5.8l.6-8.2" />
        </svg>
      </button>
      <ConfirmDialog
        open={confirming}
        title={`Удалить проект «${project.name}»?`}
        description={`Задач: ${openTasks}. Каталог проекта удалится вместе с ними, отменить нельзя.`}
        confirmWord={project.id}
        confirmWordLabel={`Введите id проекта: ${project.id}`}
        confirmLabel="Удалить"
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          deleteProject.mutate({ id: project.id, confirm: project.id }, { onSuccess: () => void navigate(listPath()) });
        }}
      />
    </>
  );
}
