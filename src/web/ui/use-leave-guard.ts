import { useEffect, useState } from "react";
import { useBeforeUnload, useBlocker } from "react-router";

export const SAVE_WAIT_BEFORE_ASKING_MS = 5_000;

type LeaveGuardState = { unsaved: boolean; saving: boolean; saveFailed: boolean };
type LeaveQuestions = { ifUnsaved: string; ifStillSaving: string };

export function useLeaveGuard({ unsaved, saving, saveFailed }: LeaveGuardState, { ifUnsaved, ifStillSaving }: LeaveQuestions): void {
  const guarded = unsaved || saving;
  const blocker = useBlocker(({ currentLocation, nextLocation }) => guarded && currentLocation.pathname !== nextLocation.pathname);
  const blocked = blocker.state === "blocked";
  const [waitedForSave, setWaitedForSave] = useState(false);

  useEffect(() => {
    if (!blocked || !saving) return;
    const waitTimer = setTimeout(() => setWaitedForSave(true), SAVE_WAIT_BEFORE_ASKING_MS);
    return () => {
      clearTimeout(waitTimer);
      setWaitedForSave(false);
    };
  }, [blocked, saving]);

  useEffect(() => {
    if (blocker.state !== "blocked" || (saving && !waitedForSave)) return;
    const mayLeave = unsaved ? window.confirm(ifUnsaved) : saving ? window.confirm(ifStillSaving) : !saveFailed;
    if (mayLeave) blocker.proceed();
    else blocker.reset();
  }, [blocker, ifUnsaved, ifStillSaving, unsaved, saving, saveFailed, waitedForSave]);

  useBeforeUnload((event) => {
    if (guarded) event.preventDefault();
  });
}
