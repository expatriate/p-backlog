import { useEffect, useRef, useState, type RefObject } from "react";

export type Draft<E extends HTMLElement = HTMLInputElement> = {
  ref: RefObject<E | null>;
  value: string;
  canonical: string;
  set: (next: string) => void;
  unsaved: boolean;
  saving: boolean;
  conflicted: boolean;
  commit: (save: (canonical: string) => Promise<boolean>) => void;
  reset: () => void;
};

type DraftState = { text: string; base: string; conflicted: boolean; savesInFlight: number };

const synced = (serverValue: string): DraftState => ({ text: serverValue, base: serverValue, conflicted: false, savesInFlight: 0 });

const savingNow = (draft: DraftState) => draft.savesInFlight > 0;

const asTyped = (text: string) => text;

const untouchedSinceBase = (draft: DraftState, canonicalText: string) => canonicalText === draft.base;

const serverMovedUnderEdit = (draft: DraftState, serverValue: string) => serverValue !== draft.base;

export function useDraft<E extends HTMLElement = HTMLInputElement>(serverValue: string, canonical: (text: string) => string = asTyped): Draft<E> {
  const ref = useRef<E>(null);
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
    const previousBase = state.base;
    setState((current) => ({ ...current, base: canonicalText, savesInFlight: current.savesInFlight + 1 }));
    const settle = (saved: boolean) =>
      setState((current) => {
        const settled = { ...current, savesInFlight: current.savesInFlight - 1 };
        if (current.base !== canonicalText) return settled;
        return saved ? { ...settled, conflicted: false } : { ...settled, base: previousBase };
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
    saving: savingNow(state),
    conflicted: state.conflicted,
    commit,
    reset: () => setState((current) => ({ ...synced(serverValue), savesInFlight: current.savesInFlight })),
  };
}
