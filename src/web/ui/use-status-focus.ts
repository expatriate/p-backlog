import { useEffect, useRef, type RefObject } from "react";
import { focusDropped } from "./focus-dropped";

export function useStatusFocus(settled: boolean, settledTarget: RefObject<HTMLElement | null> | undefined) {
  const status = useRef<HTMLDivElement>(null);
  const watching = useRef(false);

  useEffect(() => {
    if (!watching.current) return;
    const active = document.activeElement;
    const region = status.current;
    const dropped = focusDropped();
    const focusInStatus = active !== null && region?.contains(active) === true;
    if (!dropped && !focusInStatus) {
      watching.current = false;
      return;
    }
    if (!settled) {
      if (dropped) region?.focus();
      return;
    }
    watching.current = false;
    settledTarget?.current?.focus();
  });

  const keepFocus = () => {
    watching.current = true;
  };
  return { status, keepFocus };
}
