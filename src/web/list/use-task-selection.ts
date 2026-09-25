import { useCallback, useMemo, useState } from "react";

type AllVisibleState = "none" | "some" | "all";

type SelectionState = { scopeKey: string; selected: ReadonlySet<string>; anchor: string | undefined };

const NOTHING_SELECTED: ReadonlySet<string> = new Set();

export function useTaskSelection(visibleIds: readonly string[], scopeKey: string, loadedIds: ReadonlySet<string>) {
  const [state, setState] = useState<SelectionState>({ scopeKey, selected: NOTHING_SELECTED, anchor: undefined });
  if (state.scopeKey !== scopeKey) setState({ scopeKey, selected: NOTHING_SELECTED, anchor: undefined });
  const selected = useMemo(() => onlyLoaded(state.selected, loadedIds), [state.selected, loadedIds]);

  const toggle = useCallback(
    (id: string, options?: { range: boolean }) =>
      setState((current) => {
        const on = !current.selected.has(id);
        const ids = options?.range === true ? rangeOf(visibleIds, current.anchor, id) : [id];
        return { ...current, selected: withMarks(current.selected, ids, on), anchor: id };
      }),
    [visibleIds],
  );
  const setAllVisible = useCallback((on: boolean) => setState((current) => ({ ...current, selected: withMarks(current.selected, visibleIds, on) })), [visibleIds]);
  const clear = useCallback(() => setState((current) => ({ ...current, selected: NOTHING_SELECTED, anchor: undefined })), []);

  const visibleSelectedCount = useMemo(() => visibleIds.filter((id) => selected.has(id)).length, [visibleIds, selected]);

  return {
    selected,
    hiddenCount: selected.size - visibleSelectedCount,
    toggle,
    setAllVisible,
    allVisibleState: allVisibleStateOf(visibleSelectedCount, visibleIds.length),
    clear,
  };
}

export type TaskSelection = ReturnType<typeof useTaskSelection>;

function onlyLoaded(selected: ReadonlySet<string>, loadedIds: ReadonlySet<string>): ReadonlySet<string> {
  const loaded = [...selected].filter((id) => loadedIds.has(id));
  return loaded.length === selected.size ? selected : new Set(loaded);
}

function rangeOf(visibleIds: readonly string[], anchor: string | undefined, id: string): readonly string[] {
  const from = anchor === undefined ? -1 : visibleIds.indexOf(anchor);
  const to = visibleIds.indexOf(id);
  if (from === -1 || to === -1) return [id];
  return visibleIds.slice(Math.min(from, to), Math.max(from, to) + 1);
}

function withMarks(selected: ReadonlySet<string>, ids: readonly string[], on: boolean): ReadonlySet<string> {
  const next = new Set(selected);
  for (const id of ids) {
    if (on) next.add(id);
    else next.delete(id);
  }
  return next;
}

function allVisibleStateOf(visibleSelectedCount: number, visibleCount: number): AllVisibleState {
  if (visibleSelectedCount === 0) return "none";
  return visibleSelectedCount === visibleCount ? "all" : "some";
}
