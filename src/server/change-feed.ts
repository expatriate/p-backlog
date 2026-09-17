import { relative, sep } from "node:path";
import { watch } from "chokidar";

export type ChangeListener = () => void;

export type ChangeFeed = {
  subscribe: (listener: ChangeListener) => () => void;
  close: () => Promise<void>;
};

export type Debouncer = { schedule: () => void; cancel: () => void };

export const CHANGE_DEBOUNCE_MS = 100;

export function createDebouncer(delayMs: number, run: () => void): Debouncer {
  let timer: NodeJS.Timeout | undefined;
  return {
    schedule: () => {
      clearTimeout(timer);
      timer = setTimeout(run, delayMs);
    },
    cancel: () => clearTimeout(timer),
  };
}

export function isHiddenPath(root: string, path: string): boolean {
  return relative(root, path)
    .split(sep)
    .some((segment) => segment.startsWith("."));
}

export function createChangeFeed(root: string, debounceMs = CHANGE_DEBOUNCE_MS): ChangeFeed {
  const listeners = new Set<ChangeListener>();
  const debouncer = createDebouncer(debounceMs, () => {
    for (const listener of listeners) listener();
  });

  const watcher = watch(root, { ignoreInitial: true, ignored: (path) => isHiddenPath(root, path) });
  watcher.on("all", () => debouncer.schedule());

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close: async () => {
      debouncer.cancel();
      listeners.clear();
      await watcher.close();
    },
  };
}
