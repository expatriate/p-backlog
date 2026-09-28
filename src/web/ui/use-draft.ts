import { useEffect, useRef, useState, type RefObject } from "react";

export type Draft = {
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

export function useDraft<E extends HTMLElement = HTMLInputElement>(serverValue: string, canonical: (text: string) => string = asTyped): [Draft, RefObject<E | null>] {
  const ref = useRef<E>(null);
  const [state, setState] = useState(() => synced(serverValue));

  useEffect(() => {
    if (document.activeElement === ref.current) return;
    setState((current) => {
      if (canonical(current.text) === current.base) return synced(serverValue);
      return serverValue === current.base ? current : { ...current, conflicted: true };
    });
  }, [serverValue, canonical]);

  const canonicalText = canonical(state.text);

  const commit = (save: (canonical: string) => Promise<boolean>) => {
    if (canonicalText === serverValue) {
      setState({ text: state.text, base: serverValue, conflicted: false });
    } else if (canonicalText === state.base) {
      setState(synced(serverValue));
    } else if (serverValue !== state.base) {
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

  const draft: Draft = {
    value: state.text,
    canonical: canonicalText,
    set: (text) => setState((current) => ({ ...current, text })),
    unsaved: canonicalText !== state.base,
    conflicted: state.conflicted,
    commit,
    reset: () => setState(synced(serverValue)),
  };
  return [draft, ref];
}
