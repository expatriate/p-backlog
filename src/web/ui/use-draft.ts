import { useEffect, useRef, useState, type RefObject } from "react";

export type Draft = {
  value: string;
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

  const commit = (save: (canonical: string) => Promise<boolean>) => {
    const next = canonical(state.text);
    if (next === serverValue) {
      setState({ text: state.text, base: serverValue, conflicted: false });
    } else if (next === state.base) {
      setState(synced(serverValue));
    } else if (serverValue !== state.base) {
      setState({ text: state.text, base: serverValue, conflicted: true });
    } else {
      const previousBase = state.base;
      setState({ ...state, base: next });
      void save(next).then((saved) =>
        setState((current) => {
          if (current.base !== next) return current;
          return saved ? { ...current, conflicted: false } : { ...current, base: previousBase };
        }),
      );
    }
  };

  const draft: Draft = {
    value: state.text,
    set: (text) => setState((current) => ({ ...current, text })),
    unsaved: canonical(state.text) !== state.base,
    conflicted: state.conflicted,
    commit,
    reset: () => setState(synced(serverValue)),
  };
  return [draft, ref];
}
