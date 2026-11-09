import type { ChangeFeed, ChangeListener } from "../change-feed";

export type TestChangeFeed = { changes: ChangeFeed; emitChange: (paths: readonly string[]) => Promise<void> };

export function makeTestChangeFeed(): TestChangeFeed {
  const listeners = new Set<ChangeListener>();
  const closing = new AbortController();
  const changes: ChangeFeed = {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    closed: closing.signal,
    close: async () => {
      listeners.clear();
      closing.abort();
    },
  };
  return {
    changes,
    emitChange: async (paths) => {
      await Promise.all([...listeners].map(async (listener) => listener(paths)));
    },
  };
}
