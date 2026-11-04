import { useEffect, type RefObject } from "react";

const TASK_ID_ATTRIBUTE = "data-task-id";

export const taskIdAttribute = (id: string) => ({ [TASK_ID_ATTRIBUTE]: id });

export function taskElementOf(container: HTMLElement | null, id: string): HTMLElement | null {
  return container?.querySelector<HTMLElement>(`[${TASK_ID_ATTRIBUTE}="${CSS.escape(id)}"]`) ?? null;
}

export function useOpenedTaskInView(container: RefObject<HTMLElement | null>, openedId: string | undefined): void {
  useEffect(() => {
    if (openedId !== undefined) taskElementOf(container.current, openedId)?.scrollIntoView({ block: "nearest" });
  }, [container, openedId]);
}
