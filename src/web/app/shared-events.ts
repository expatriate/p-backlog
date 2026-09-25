import type { EventStream } from "./backlog-api";

type EventListenerFor = Parameters<EventStream["addEventListener"]>[1];
type Relayed = { type: string; data: unknown };

const LEADER_LOCK = "p-backlog:events";
const RELAY_CHANNEL = "p-backlog:events";
const RELAYED_EVENTS = ["open", "change"];
const LEADER_RETRY_MS = 5_000;

export function openSharedEvents(url: string): EventStream {
  if (!("locks" in navigator) || typeof BroadcastChannel === "undefined") return new EventSource(url);

  const listeners = new Map<string, Set<EventListenerFor>>();
  const notify = (type: string, data: unknown) => listeners.get(type)?.forEach((listener) => listener(new MessageEvent(type, { data })));
  const relay = new BroadcastChannel(RELAY_CHANNEL);
  relay.onmessage = (event: MessageEvent<unknown>) => {
    if (isRelayed(event.data)) notify(event.data.type, event.data.data);
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
        source.addEventListener(type, (event: MessageEvent<unknown>) => {
          notify(type, event.data);
          relay.postMessage({ type, data: event.data } satisfies Relayed);
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

function isRelayed(message: unknown): message is Relayed {
  return typeof message === "object" && message !== null && "type" in message && typeof message.type === "string" && "data" in message;
}
