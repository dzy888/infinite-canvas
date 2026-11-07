import { z } from "zod";
import {
  TranscriptEventSchema,
  type TranscriptEvent,
} from "./session-transcript-schema.js";
import { deriveBookSessionFromEvents } from "./session-transcript-derive.js";

export const CLIENT_SESSION_VERSION = 1;
export const ClientSessionSchema = z
  .object({
    version: z.literal(CLIENT_SESSION_VERSION),
    sessionId: z.string().regex(/^[a-zA-Z0-9_-]+$/),
    transcript: z.string(),
    uploads: z
      .record(
        z
          .string()
          .regex(
            /^(?:[A-Za-z0-9+\/]{4})*(?:[A-Za-z0-9+\/]{2}==|[A-Za-z0-9+\/]{3}=)?$/,
          ),
      )
      .optional(),
  })
  .passthrough();
export function decodeClientSession(value: unknown) {
  const input = ClientSessionSchema.parse(value);
  if (
    Object.keys(input.uploads ?? {}).some(
      (path) =>
        !path ||
        path.startsWith("/") ||
        path.includes("\\") ||
        path.includes("\0") ||
        path.split("/").some((part) => part === ".." || part === "." || !part),
    )
  )
    throw new Error("Invalid attachment path");
  const events = input.transcript
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => TranscriptEventSchema.parse(JSON.parse(line)))
    .sort((a, b) => a.seq - b.seq);
  if (
    events.some(
      (event, index) =>
        event.sessionId !== input.sessionId ||
        (index > 0 && event.seq <= events[index - 1].seq),
    )
  )
    throw new Error("Conflicting transcript identity or sequence");
  if (events.length && events[0].type !== "session_created")
    throw new Error("Session creation event is missing");
  return {
    ...input,
    version: CLIENT_SESSION_VERSION,
    sessionId: input.sessionId,
    transcript: encodeTranscript(events),
    session: deriveBookSessionFromEvents(input.sessionId, events),
  };
}
export function encodeTranscript(events: readonly TranscriptEvent[]) {
  return (
    events.map((event) => JSON.stringify(event)).join("\n") +
    (events.length ? "\n" : "")
  );
}
export function mergeClientTranscripts(
  previous: string,
  incoming: string,
  id: string,
) {
  const map = new Map<number, TranscriptEvent>();
  for (const raw of [previous, incoming])
    for (const line of raw.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const event = TranscriptEventSchema.parse(JSON.parse(line));
      if (event.sessionId !== id)
        throw new Error("Transcript belongs to another session");
      const existing = map.get(event.seq);
      if (existing && JSON.stringify(existing) !== JSON.stringify(event))
        throw new Error("Chat history conflicts; existing data was preserved");
      map.set(event.seq, event);
    }
  return encodeTranscript([...map.values()].sort((a, b) => a.seq - b.seq));
}
