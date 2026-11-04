import { useEffect, type RefObject } from "react";

export const NOTICE_LIFETIME_MS = 15_000;

type NoticeLifetime = { content: object | null; paused: boolean; expire: () => void };

export function useNoticeLifetime(notice: RefObject<HTMLElement | null>, { content, paused, expire }: NoticeLifetime): void {
  useEffect(() => {
    if (content === null || paused) return;
    let timer: ReturnType<typeof setTimeout>;
    const expireUnlessFocused = () => {
      if (notice.current?.contains(document.activeElement)) timer = setTimeout(expireUnlessFocused, NOTICE_LIFETIME_MS);
      else expire();
    };
    timer = setTimeout(expireUnlessFocused, NOTICE_LIFETIME_MS);
    return () => clearTimeout(timer);
  }, [notice, content, paused, expire]);
}
