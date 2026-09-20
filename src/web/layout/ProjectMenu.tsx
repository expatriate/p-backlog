import { useState } from "react";
import { useNavigate } from "react-router";
import type { Project } from "../../core/model/types";
import { listPath } from "../app/paths";
import { useDeleteProject, useSetProjectActive } from "../app/queries";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Popover, useClosePopover } from "../ui/Popover";
import styles from "./ProjectMenu.module.css";

export function ProjectMenu({ project, openTasks }: { project: Project; openTasks: number }) {
  const [confirming, setConfirming] = useState(false);
  const deleteProject = useDeleteProject();
  const navigate = useNavigate();

  return (
    <>
      <Popover trigger="…" triggerProps={{ "aria-label": `Действия с проектом ${project.name}`, className: styles.trigger }}>
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
        {project.active ? "Сделать неактивным" : "Сделать активным"}
      </button>
      <button
        type="button"
        className={styles.item}
        onClick={() => {
          closePopover();
          onDelete();
        }}
      >
        Удалить…
      </button>
    </div>
  );
}
