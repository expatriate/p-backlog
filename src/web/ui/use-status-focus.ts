import { useEffect, useRef, type RefObject } from "react";

export function useStatusFocus(settled: boolean, settledTarget: RefObject<HTMLElement | null> | undefined) {
  const status = useRef<HTMLDivElement>(null);
  const watching = useRef(false);

  useEffect(() => {
    if (!watching.current) return;
    const active = document.activeElement;
    const region = status.current;
    if (active !== document.body && !(active !== null && region?.contains(active))) {
      watching.current = false;
      return;
    }
    if (!settled) {
      if (active === document.body) region?.focus();
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
