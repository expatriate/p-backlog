import { relative, sep } from "node:path";
import { watch } from "chokidar";
import { errorText } from "../core/errors";
import type { ServerMessages } from "./messages.ru";

type ChangeListener = () => void;

export type ChangeFeed = {
  subscribe: (listener: ChangeListener) => () => void;
  closed: Promise<void>;
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

export type ChangeFeedOptions = { root: string; debounceMs: number; messages: () => Promise<ServerMessages>; warn: (line: string) => void };

export function createChangeFeed({ root, debounceMs, messages, warn }: ChangeFeedOptions): ChangeFeed {
  const listeners = new Set<ChangeListener>();
  let markClosed = (): void => undefined;
  const closed = new Promise<void>((resolve) => (markClosed = resolve));
  const debouncer = createDebouncer(debounceMs, () => {
    for (const listener of listeners) listener();
  });

  const watcher = watch(root, { ignoreInitial: true, ignored: (path) => isHiddenPath(root, path) });
  watcher.on("all", () => debouncer.schedule());
  watcher.on("error", (error) => {
    void messages().then((texts) => warn(texts.watcherError(root, errorText(error))));
  });

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    closed,
    close: async () => {
      debouncer.cancel();
      listeners.clear();
      markClosed();
      await watcher.close();
    },
  };
}
