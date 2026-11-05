import { useEffect, useRef, useState, type RefObject } from "react";

export type Draft<E extends HTMLElement = HTMLInputElement> = {
  ref: RefObject<E | null>;
  value: string;
  canonical: string;
  set: (next: string) => void;
  unsaved: boolean;
  conflicted: boolean;
  failed: boolean;
  commit: (save: (canonical: string) => Promise<boolean>) => void;
  reset: () => void;
};

type DraftState = { text: string; base: string; confirmed: string; conflicted: boolean; failed: boolean; savesInFlight: number; latestSaveNumber: number };

const synced = (serverValue: string): DraftState => ({ text: serverValue, base: serverValue, confirmed: serverValue, conflicted: false, failed: false, savesInFlight: 0, latestSaveNumber: 0 });

const savingNow = (draft: DraftState) => draft.savesInFlight > 0;

const asTyped = (text: string) => text;

const untouchedSinceBase = (draft: DraftState, canonicalText: string) => canonicalText === draft.base;

const serverMovedUnderEdit = (draft: DraftState, serverValue: string) => serverValue !== draft.base;

export function useDraft<E extends HTMLElement = HTMLInputElement>(serverValue: string, canonical: (text: string) => string = asTyped): Draft<E> {
  const ref = useRef<E>(null);
  const saveCounter = useRef(0);
  const [state, setState] = useState(() => synced(serverValue));

  useEffect(() => {
    if (document.activeElement === ref.current) return;
    setState((current) => {
      if (savingNow(current)) return current;
      if (untouchedSinceBase(current, canonical(current.text))) return synced(serverValue);
      return serverMovedUnderEdit(current, serverValue) ? { ...current, conflicted: true } : current;
    });
  }, [serverValue, canonical]);

  const canonicalText = canonical(state.text);

  const send = (save: (canonical: string) => Promise<boolean>) => {
    const saveNumber = ++saveCounter.current;
    setState((current) => ({ ...current, base: canonicalText, savesInFlight: current.savesInFlight + 1, latestSaveNumber: saveNumber }));
    const settle = (saved: boolean) =>
      setState((current) => {
        const settled = { ...current, savesInFlight: current.savesInFlight - 1, confirmed: saved ? canonicalText : current.confirmed };
        if (current.latestSaveNumber !== saveNumber) return settled;
        return saved ? { ...settled, conflicted: false, failed: false } : { ...settled, base: current.confirmed, failed: true };
      });
    void save(canonicalText).then(settle);
  };

  const commit = (save: (canonical: string) => Promise<boolean>) => {
    if (savingNow(state)) {
      if (!untouchedSinceBase(state, canonicalText)) send(save);
    } else if (canonicalText === serverValue) {
      setState({ ...synced(serverValue), text: state.text });
    } else if (untouchedSinceBase(state, canonicalText)) {
      setState(synced(serverValue));
    } else if (serverMovedUnderEdit(state, serverValue)) {
      setState({ ...synced(serverValue), text: state.text, conflicted: true });
    } else {
      send(save);
    }
  };

  return {
    ref,
    value: state.text,
    canonical: canonicalText,
    set: (text) => setState((current) => ({ ...current, text })),
    unsaved: !untouchedSinceBase(state, canonicalText),
    conflicted: state.conflicted,
    failed: state.failed,
    commit,
    reset: () => setState((current) => ({ ...synced(serverValue), savesInFlight: current.savesInFlight })),
  };
}
