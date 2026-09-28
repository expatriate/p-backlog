import type { EventStream } from "./backlog-api";

type EventListenerFor = Parameters<EventStream["addEventListener"]>[1];
type Relayed = { type: string; data: unknown };
type Broadcast = (type: string, data: unknown) => void;

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
  const stopLeading = leadWhenPossible(url, (type, data) => {
    notify(type, data);
    relay.postMessage({ type, data } satisfies Relayed);
  });

  return {
    addEventListener: (type, listener) => listeners.set(type, (listeners.get(type) ?? new Set()).add(listener)),
    close: () => {
      stopLeading();
      relay.close();
    },
  };
}

function leadWhenPossible(url: string, broadcast: Broadcast): () => void {
  const closed = new AbortController();
  let retry: ReturnType<typeof setTimeout> | undefined;
  const lead = () =>
    new Promise<void>((resign) => {
      if (closed.signal.aborted) {
        resign();
        return;
      }
      const source = relayedSource(url, broadcast);
      const stepDown = () => {
        closed.signal.removeEventListener("abort", stepDown);
        source.close();
        resign();
      };
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
  return () => {
    clearTimeout(retry);
    closed.abort();
  };
}

function relayedSource(url: string, broadcast: Broadcast): EventSource {
  const source = new EventSource(url);
  for (const type of RELAYED_EVENTS) source.addEventListener(type, (event: MessageEvent<unknown>) => broadcast(type, event.data));
  return source;
}

function isRelayed(message: unknown): message is Relayed {
  return typeof message === "object" && message !== null && "type" in message && typeof message.type === "string" && "data" in message;
}
