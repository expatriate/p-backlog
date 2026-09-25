import { useEffect, useRef, useState, type RefObject } from "react";

type CommitHandlers = { save: () => void; conflict: () => void };

type Draft = {
  value: string;
  set: (next: string) => void;
  commit: (canonical: string, handlers: CommitHandlers) => void;
  reset: () => void;
};

type DraftState = { text: string; base: string; serverMoved: boolean };

const synced = (serverValue: string): DraftState => ({ text: serverValue, base: serverValue, serverMoved: false });

export function useDraft<E extends HTMLElement = HTMLInputElement>(serverValue: string): [Draft, RefObject<E | null>] {
  const ref = useRef<E>(null);
  const [state, setState] = useState(() => synced(serverValue));

  useEffect(() => {
    const editing = document.activeElement === ref.current;
    setState((current) => (editing ? { ...current, serverMoved: serverValue !== current.base } : synced(serverValue)));
  }, [serverValue]);

  const commit = (canonical: string, { save, conflict }: CommitHandlers) => {
    if (canonical === serverValue) {
      setState({ text: state.text, base: serverValue, serverMoved: false });
    } else if (!state.serverMoved) {
      setState({ text: state.text, base: canonical, serverMoved: false });
      save();
    } else if (canonical === state.base) {
      setState(synced(serverValue));
    } else {
      setState({ text: state.text, base: serverValue, serverMoved: false });
      conflict();
    }
  };

  const draft: Draft = {
    value: state.text,
    set: (text) => setState((current) => ({ ...current, text })),
    commit,
    reset: () => setState(synced(serverValue)),
  };
  return [draft, ref];
}
