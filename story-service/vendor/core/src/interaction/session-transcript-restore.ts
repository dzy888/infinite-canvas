import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { BookSession, SessionKind } from "./session.js";
import { readTranscriptEvents } from "./session-transcript.js";
import { deriveBookSessionFromEvents, restoreAgentMessagesFromEvents } from "./session-transcript-derive.js";
export * from "./session-transcript-derive.js";

export async function restoreAgentMessagesFromTranscript(root: string, id: string, kind?: SessionKind): Promise<AgentMessage[]> {
  return restoreAgentMessagesFromEvents(await readTranscriptEvents(root, id), kind);
}
export async function deriveBookSessionFromTranscript(root: string, id: string): Promise<BookSession | null> {
  return deriveBookSessionFromEvents(id, await readTranscriptEvents(root, id));
}
