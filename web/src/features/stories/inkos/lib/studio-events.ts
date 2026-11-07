import { appendLocalTranscript } from "@/features/stories/local-chat-storage";
import { storyUrl } from "@/features/stories/transport";
import { refreshPlatformAccount } from "@/services/api/new-api-platform";
import { fetchJson } from "../hooks/use-api";
import type { SessionResponse } from "../store/chat/types";

export interface StudioEventStream {
  addEventListener(type: string, listener: (event: MessageEvent) => void): void;
  close(): void;
}

type Subscription = StudioEventStream & { onopen: (() => void) | null; onerror: (() => void) | null; listeners: Map<string, Set<(event: MessageEvent) => void>>; replay(): void };
type Connection = { source: EventSource; subscribers: Set<Subscription>; events: Set<string> };
const connections = new Map<string, Connection>();

/** Dashboard and conversation consumers share one HTTP connection in each page. */
export function subscribeStudioEvents(url = "/inkos-api/v1/events"): Subscription {
  const [endpoint, query] = url.split("?");
  const sessionId = new URLSearchParams(query).get("sessionId");
  let connection = connections.get(endpoint);
  if (!connection) {
    const source = new EventSource(storyUrl(endpoint));
    connection = { source, subscribers: new Set(), events: new Set() };
    connections.set(endpoint, connection);
    source.addEventListener("session:local", ((event: MessageEvent) => {
      try { const data=JSON.parse(event.data); void appendLocalTranscript(data.sessionId,data.transcript).catch(error=>window.dispatchEvent(new CustomEvent("dmx:chat-storage-error",{detail:(error as Error).message}))); }
      catch(error){window.dispatchEvent(new CustomEvent("dmx:chat-storage-error",{detail:(error as Error).message}));}
    }) as EventListener);
    const current = connection;
    source.onopen = () => { for (const item of current.subscribers) { item.onopen?.(); item.replay(); } };
    source.onerror = () => { for (const item of current.subscribers) item.onerror?.(); };
  }
  const current = connection;
  let closed = false;
  const subscription: Subscription = {
    onopen: null, onerror: null, listeners: new Map(),
    replay() {
      if (!sessionId) return;
      void fetchJson<SessionResponse>(`/sessions/${encodeURIComponent(sessionId)}`).then(result => {
        if (closed) return;
        const snapshot = new MessageEvent("session:snapshot", { data: JSON.stringify(result) });
        for (const listener of subscription.listeners.get("session:snapshot") ?? []) listener(snapshot);
        if (result.task) {
          const event = new MessageEvent("task:snapshot", { data: JSON.stringify(result.task) });
          for (const listener of subscription.listeners.get("task:snapshot") ?? []) listener(event);
        }
      }).catch(() => { /* A new draft session may not be persisted yet. */ });
    },
    addEventListener(type, listener) {
      if (closed) return;
      const listeners = subscription.listeners.get(type) ?? new Set();
      listeners.add(listener); subscription.listeners.set(type, listeners);
      if (!current.events.has(type)) {
        current.events.add(type);
        current.source.addEventListener(type, ((event: MessageEvent) => {
          if (/(complete|error)$/.test(type)) void refreshPlatformAccount({ platformManaged: true });
          for (const item of current.subscribers) for (const handler of item.listeners.get(type) ?? []) handler(event);
        }) as EventListener);
      }
    },
    close() {
      if (closed) return;
      closed = true; current.subscribers.delete(subscription); subscription.listeners.clear();
      if (current.subscribers.size === 0) { current.source.close(); connections.delete(endpoint); }
    },
  };
  current.subscribers.add(subscription);
  if (current.source.readyState === 1) queueMicrotask(() => { if (!closed) { subscription.onopen?.(); subscription.replay(); } });
  return subscription;
}

export function closeStudioEventConnections(): void {
  for (const connection of [...connections.values()]) for (const subscription of [...connection.subscribers]) subscription.close();
}
