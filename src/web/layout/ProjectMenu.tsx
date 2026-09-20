import type { Project } from "../../core/model/types";
import { useSetProjectActive } from "../app/queries";
import { Popover, useClosePopover } from "../ui/Popover";
import styles from "./ProjectMenu.module.css";

export function ProjectMenu({ project }: { project: Project }) {
  return (
    <Popover trigger="…" triggerProps={{ "aria-label": `Действия с проектом ${project.name}`, className: styles.trigger }}>
      <MenuItems project={project} />
    </Popover>
  );
}

function MenuItems({ project }: { project: Project }) {
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
    </div>
  );
}
