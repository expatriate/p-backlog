import { useEffect, useLayoutEffect, type RefObject } from "react";

export function useScrollSpaceFor(panel: RefObject<HTMLElement | null>, heightProperty: `--${string}`) {
  useLayoutEffect(() => reserveScrollSpace(panel.current, heightProperty));
  useEffect(() => {
    const element = panel.current;
    if (!element) return;
    const observer = new ResizeObserver(() => reserveScrollSpace(element, heightProperty));
    observer.observe(element);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty(heightProperty);
    };
  }, [panel, heightProperty]);
}

function reserveScrollSpace(panel: HTMLElement | null, heightProperty: string) {
  if (panel) document.documentElement.style.setProperty(heightProperty, `${Math.ceil(panel.getBoundingClientRect().height)}px`);
}
