import { useEffect } from "react";
import { useBeforeUnload, useBlocker } from "react-router";

export function useLeaveGuard(active: boolean, question: string): void {
  const blocker = useBlocker(({ currentLocation, nextLocation }) => active && currentLocation.pathname !== nextLocation.pathname);

  useEffect(() => {
    if (blocker.state !== "blocked") return;
    if (window.confirm(question)) blocker.proceed();
    else blocker.reset();
  }, [blocker, question]);

  useBeforeUnload((event) => {
    if (active) event.preventDefault();
  });
}
