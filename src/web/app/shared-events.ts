import type { EventStream } from "./backlog-api";

const LEADER_LOCK = "p-backlog:events";
const RELAY_CHANNEL = "p-backlog:events";
const RELAYED_EVENTS = ["open", "change"];
const LEADER_RETRY_MS = 5_000;

export function openSharedEvents(url: string): EventStream {
  if (!("locks" in navigator) || typeof BroadcastChannel === "undefined") return new EventSource(url);

  const listeners = new Map<string, Set<() => void>>();
  const notify = (type: string) => listeners.get(type)?.forEach((listener) => listener());
  const relay = new BroadcastChannel(RELAY_CHANNEL);
  relay.onmessage = (event: MessageEvent<unknown>) => {
    if (typeof event.data === "string") notify(event.data);
  };

  const closed = new AbortController();
  let retry: ReturnType<typeof setTimeout> | undefined;
  const lead = () =>
    new Promise<void>((resign) => {
      if (closed.signal.aborted) {
        resign();
        return;
      }
      const source = new EventSource(url);
      const stepDown = () => {
        source.close();
        resign();
      };
      for (const type of RELAYED_EVENTS) {
        source.addEventListener(type, () => {
          notify(type);
          relay.postMessage(type);
        });
      }
      source.addEventListener("error", () => {
        if (source.readyState !== EventSource.CLOSED) return;
        stepDown();
        retry = setTimeout(seekLeadership, LEADER_RETRY_MS);
      });
      closed.signal.addEventListener("abort", stepDown, { once: true });
    });
  const seekLeadership = () => {
    navigator.locks.request(LEADER_LOCK, { signal: closed.signal }, lead).catch(() => undefined);
  };
  seekLeadership();

  return {
    addEventListener: (type, listener) => listeners.set(type, (listeners.get(type) ?? new Set()).add(listener)),
    close: () => {
      clearTimeout(retry);
      closed.abort();
      relay.close();
    },
  };
}
