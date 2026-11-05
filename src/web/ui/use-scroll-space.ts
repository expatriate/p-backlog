import { useLayoutEffect, type RefObject } from "react";

export function useScrollSpaceFor(panel: RefObject<HTMLElement | null>, heightProperty: `--${string}`) {
  useLayoutEffect(() => {
    const element = panel.current;
    if (!element) return;
    const reserveScrollSpace = () => document.documentElement.style.setProperty(heightProperty, `${Math.ceil(element.getBoundingClientRect().height)}px`);
    reserveScrollSpace();
    const observer = new ResizeObserver(reserveScrollSpace);
    observer.observe(element, { box: "border-box" });
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty(heightProperty);
    };
  }, [panel, heightProperty]);
}
