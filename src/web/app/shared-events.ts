import type { EventStream } from "./backlog-api";

const LEADER_LOCK = "p-backlog:events";
const RELAY_CHANNEL = "p-backlog:events";
const RELAYED_EVENTS = ["open", "change"];

export function openSharedEvents(url: string): EventStream {
  if (!("locks" in navigator) || typeof BroadcastChannel === "undefined") return new EventSource(url);

  const listeners = new Map<string, Set<() => void>>();
  const notify = (type: string) => listeners.get(type)?.forEach((listener) => listener());
  const relay = new BroadcastChannel(RELAY_CHANNEL);
  relay.onmessage = (event: MessageEvent<unknown>) => {
    if (typeof event.data === "string") notify(event.data);
  };

  const closed = new AbortController();
  const lead = () =>
    new Promise<void>((resign) => {
      if (closed.signal.aborted) {
        resign();
        return;
      }
      const source = new EventSource(url);
      for (const type of RELAYED_EVENTS) {
        source.addEventListener(type, () => {
          notify(type);
          relay.postMessage(type);
        });
      }
      closed.signal.addEventListener("abort", () => {
        source.close();
        resign();
      });
    });
  navigator.locks.request(LEADER_LOCK, { signal: closed.signal }, lead).catch(() => undefined);

  return {
    addEventListener: (type, listener) => listeners.set(type, (listeners.get(type) ?? new Set()).add(listener)),
    close: () => {
      closed.abort();
      relay.close();
    },
  };
}
