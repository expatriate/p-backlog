import { relative, sep } from "node:path";
import { watch } from "chokidar";

export type ChangeListener = () => void;

export type ChangeFeed = {
  subscribe: (listener: ChangeListener) => () => void;
  close: () => Promise<void>;
};

export const CHANGE_DEBOUNCE_MS = 100;

export function isHiddenPath(root: string, path: string): boolean {
  return relative(root, path)
    .split(sep)
    .some((segment) => segment.startsWith("."));
}

export function createChangeFeed(root: string, debounceMs = CHANGE_DEBOUNCE_MS): ChangeFeed {
  const listeners = new Set<ChangeListener>();
  let timer: NodeJS.Timeout | undefined;

  const watcher = watch(root, { ignoreInitial: true, ignored: (path) => isHiddenPath(root, path) });
  watcher.on("all", () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      for (const listener of listeners) listener();
    }, debounceMs);
  });

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close: async () => {
      clearTimeout(timer);
      listeners.clear();
      await watcher.close();
    },
  };
}
