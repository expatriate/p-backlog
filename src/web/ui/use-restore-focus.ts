import { useCallback, useEffect, useRef, type RefObject } from "react";
import { focusDropped } from "./focus-dropped";

export function useRestoreFocus(triggerRef: RefObject<HTMLElement | null>, surfaceRef: RefObject<HTMLElement | null>, open: boolean): () => void {
  const restoring = useRef(false);

  useEffect(() => {
    if (open || !restoring.current) return;
    restoring.current = false;
    triggerRef.current?.focus();
  }, [open, triggerRef]);

  return useCallback(() => {
    restoring.current = focusFallsWith(surfaceRef.current);
  }, [surfaceRef]);
}

function focusFallsWith(surface: HTMLElement | null): boolean {
  const active = document.activeElement;
  if (focusDropped() || active === null || surface === null) return true;
  return surface.contains(active) || active.contains(surface);
}
