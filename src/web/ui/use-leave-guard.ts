import { useEffect } from "react";
import { useBeforeUnload, useBlocker } from "react-router";

type LeaveGuardState = { unsaved: boolean; saving: boolean };

export function useLeaveGuard({ unsaved, saving }: LeaveGuardState, question: string): void {
  const guarded = unsaved || saving;
  const blocker = useBlocker(({ currentLocation, nextLocation }) => guarded && currentLocation.pathname !== nextLocation.pathname);

  useEffect(() => {
    if (blocker.state !== "blocked" || saving) return;
    if (!unsaved || window.confirm(question)) blocker.proceed();
    else blocker.reset();
  }, [blocker, question, unsaved, saving]);

  useBeforeUnload((event) => {
    if (guarded) event.preventDefault();
  });
}
