import type { ChangeFeed, ChangeListener } from "../change-feed";

export type TestChangeFeed = { changes: ChangeFeed; emitChange: (paths: readonly string[]) => Promise<void> };

export function makeTestChangeFeed(): TestChangeFeed {
  const listeners = new Set<ChangeListener>();
  const { promise: closed, resolve: markClosed }: PromiseWithResolvers<void> = Promise.withResolvers();
  const changes: ChangeFeed = {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    closed,
    close: async () => {
      listeners.clear();
      markClosed();
    },
  };
  return {
    changes,
    emitChange: async (paths) => {
      await Promise.all([...listeners].map((listener) => listener(paths)));
    },
  };
}
