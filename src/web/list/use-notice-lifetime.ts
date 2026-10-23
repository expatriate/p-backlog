import { useEffect, type RefObject } from "react";

const NOTICE_LIFETIME_MS = 15_000;

export function useNoticeLifetime(notice: RefObject<HTMLElement | null>, shown: unknown, held: boolean, expire: () => void): void {
  useEffect(() => {
    if (shown === null || held) return;
    let timer: ReturnType<typeof setTimeout>;
    const expireUnlessFocused = () => {
      if (notice.current?.contains(document.activeElement)) timer = setTimeout(expireUnlessFocused, NOTICE_LIFETIME_MS);
      else expire();
    };
    timer = setTimeout(expireUnlessFocused, NOTICE_LIFETIME_MS);
    return () => clearTimeout(timer);
  }, [notice, shown, held, expire]);
}
