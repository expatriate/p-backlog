import { useEffect, useRef, useState, type RefObject } from "react";

export type Draft<E extends HTMLElement = HTMLInputElement> = {
  ref: RefObject<E | null>;
  value: string;
  canonical: string;
  set: (next: string) => void;
  unsaved: boolean;
  conflicted: boolean;
  commit: (save: (canonical: string) => Promise<boolean>) => void;
  reset: () => void;
};

type DraftState = { text: string; base: string; conflicted: boolean };

const synced = (serverValue: string): DraftState => ({ text: serverValue, base: serverValue, conflicted: false });

const asTyped = (text: string) => text;

const untouchedSinceBase = (draft: DraftState, canonicalText: string) => canonicalText === draft.base;

const serverMovedUnderEdit = (draft: DraftState, serverValue: string) => serverValue !== draft.base;

export function useDraft<E extends HTMLElement = HTMLInputElement>(serverValue: string, canonical: (text: string) => string = asTyped): Draft<E> {
  const ref = useRef<E>(null);
  const [state, setState] = useState(() => synced(serverValue));

  useEffect(() => {
    if (document.activeElement === ref.current) return;
    setState((current) => {
      if (untouchedSinceBase(current, canonical(current.text))) return synced(serverValue);
      return serverMovedUnderEdit(current, serverValue) ? { ...current, conflicted: true } : current;
    });
  }, [serverValue, canonical]);

  const canonicalText = canonical(state.text);
  const matchesServer = canonicalText === serverValue;

  const commit = (save: (canonical: string) => Promise<boolean>) => {
    if (matchesServer) {
      setState({ text: state.text, base: serverValue, conflicted: false });
    } else if (untouchedSinceBase(state, canonicalText)) {
      setState(synced(serverValue));
    } else if (serverMovedUnderEdit(state, serverValue)) {
      setState({ text: state.text, base: serverValue, conflicted: true });
    } else {
      const previousBase = state.base;
      setState({ ...state, base: canonicalText });
      void save(canonicalText).then((saved) =>
        setState((current) => {
          if (current.base !== canonicalText) return current;
          return saved ? { ...current, conflicted: false } : { ...current, base: previousBase };
        }),
      );
    }
  };

  return {
    ref,
    value: state.text,
    canonical: canonicalText,
    set: (text) => setState((current) => ({ ...current, text })),
    unsaved: !untouchedSinceBase(state, canonicalText),
    conflicted: state.conflicted,
    commit,
    reset: () => setState(synced(serverValue)),
  };
}
