import { useEffect } from "react";
import { useBeforeUnload, useBlocker } from "react-router";

type LeaveGuardState = { unsaved: boolean; saving: boolean; saveFailed: boolean };

export function useLeaveGuard({ unsaved, saving, saveFailed }: LeaveGuardState, question: string): void {
  const guarded = unsaved || saving;
  const blocker = useBlocker(({ currentLocation, nextLocation }) => guarded && currentLocation.pathname !== nextLocation.pathname);

  useEffect(() => {
    if (blocker.state !== "blocked" || saving) return;
    const mayLeave = unsaved ? window.confirm(question) : !saveFailed;
    if (mayLeave) blocker.proceed();
    else blocker.reset();
  }, [blocker, question, unsaved, saving, saveFailed]);

  useBeforeUnload((event) => {
    if (guarded) event.preventDefault();
  });
}
