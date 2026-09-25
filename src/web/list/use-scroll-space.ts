import { useEffect, useLayoutEffect, type RefObject } from "react";

const FOOTER_HEIGHT_PROPERTY = "--list-footer-height";

export function useScrollSpaceFor(footer: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => reserveScrollSpace(footer.current));
  useEffect(() => {
    const element = footer.current;
    if (!element) return;
    const observer = new ResizeObserver(() => reserveScrollSpace(element));
    observer.observe(element);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty(FOOTER_HEIGHT_PROPERTY);
    };
  }, [footer]);
}

function reserveScrollSpace(footer: HTMLElement | null) {
  if (footer) document.documentElement.style.setProperty(FOOTER_HEIGHT_PROPERTY, `${footer.offsetHeight}px`);
}
