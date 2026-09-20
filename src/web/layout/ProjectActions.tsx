import { useState } from "react";
import { useNavigate } from "react-router";
import type { Project } from "../../core/model/types";
import { listPath } from "../app/paths";
import { useDeleteProject, useSetProjectActive } from "../app/queries";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Popover, useClosePopover } from "../ui/Popover";
import styles from "./ProjectActions.module.css";

export function ProjectActions({ project, openTasks }: { project: Project; openTasks: number }) {
  const [confirming, setConfirming] = useState(false);
  const deleteProject = useDeleteProject();
  const navigate = useNavigate();

  return (
    <>
      <Popover
        trigger={<MoreIcon />}
        triggerProps={{ "aria-label": `Действия с проектом ${project.name}`, className: styles.trigger }}
        panelClassName={styles.menu}
      >
        <MenuItems project={project} onDelete={() => setConfirming(true)} />
      </Popover>
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

function MenuItems({ project, onDelete }: { project: Project; onDelete: () => void }) {
  const setActive = useSetProjectActive();
  const closePopover = useClosePopover();

  return (
    <div className={styles.items}>
      <button
        type="button"
        className={styles.item}
        onClick={() => {
          setActive.mutate({ id: project.id, active: !project.active });
          closePopover();
        }}
      >
        {project.active ? <EyeOffIcon /> : <EyeIcon />}
        {project.active ? "Сделать неактивным" : "Сделать активным"}
      </button>
      <button
        type="button"
        className={`${styles.item} ${styles.danger}`}
        onClick={() => {
          closePopover();
          onDelete();
        }}
      >
        <TrashIcon />
        Удалить…
      </button>
    </div>
  );
}

function MoreIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">
      <circle cx="4" cy="8" r="1.3" />
      <circle cx="8" cy="8" r="1.3" />
      <circle cx="12" cy="8" r="1.3" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <Icon>
      <path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8s-2.4 4.5-6.5 4.5S1.5 8 1.5 8Z" />
      <circle cx="8" cy="8" r="2" />
    </Icon>
  );
}

function EyeOffIcon() {
  return (
    <Icon>
      <path d="M6.2 3.8A6.6 6.6 0 0 1 8 3.5c4.1 0 6.5 4.5 6.5 4.5a12 12 0 0 1-2 2.6M4 4.9A12 12 0 0 0 1.5 8S3.9 12.5 8 12.5c1 0 1.9-.3 2.7-.7" />
      <path d="M2.5 2.5 13.5 13.5" />
    </Icon>
  );
}

function TrashIcon() {
  return (
    <Icon>
      <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.2h5.8l.6-8.2" />
    </Icon>
  );
}

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}
