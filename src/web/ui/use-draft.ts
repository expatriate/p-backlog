import { useEffect, useRef, useState, type RefObject } from "react";

type DraftCommit = "save" | "keep" | "conflict";

export type Draft = {
  value: string;
  set: (next: string) => void;
  commit: (canonical: string) => DraftCommit;
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

  const commit = (canonical: string): DraftCommit => {
    if (canonical === serverValue) {
      setState({ text: state.text, base: serverValue, serverMoved: false });
      return "keep";
    }
    if (!state.serverMoved) {
      setState({ text: state.text, base: canonical, serverMoved: false });
      return "save";
    }
    if (canonical === state.base) {
      setState(synced(serverValue));
      return "keep";
    }
    setState({ text: state.text, base: serverValue, serverMoved: false });
    return "conflict";
  };

  const draft: Draft = {
    value: state.text,
    set: (text) => setState((current) => ({ ...current, text })),
    commit,
    reset: () => setState(synced(serverValue)),
  };
  return [draft, ref];
}
