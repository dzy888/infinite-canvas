import { create } from "zustand";
import type { ChatStore } from "./types";
import { initialChatState } from "./initialState";
import { createMessageSlice } from "./slices/message/action";
import { createCreateSlice } from "./slices/create/action";

export const useChatStore = create<ChatStore>()((...a) => ({
  ...initialChatState,
  ...createMessageSlice(...a),
  ...createCreateSlice(...a),
}));

// Save conversation UI and interrupted streams locally; wire history is saved separately.
import {
  hasLocalChatStorage,
  saveLocalChatUI,
  saveLocalDraft,
} from "@/features/stories/local-chat-storage";
function reportStorageError(error: unknown) {
  window.dispatchEvent(
    new CustomEvent("dmx:chat-storage-error", {
      detail: error instanceof Error ? error.message : String(error),
    }),
  );
}
useChatStore.subscribe((state, previous) => {
  if (!hasLocalChatStorage()) return;
  if (state.input !== previous.input)
    void saveLocalDraft(state.input).catch(reportStorageError);
  for (const [id, runtime] of Object.entries(state.sessions)) {
    const before = previous.sessions[id];
    // List summaries do not contain messages and must never replace saved UI history.
    const changed = before
      ? runtime.messages !== before.messages ||
        runtime.isDraft !== before.isDraft ||
        runtime.isStreaming !== before.isStreaming ||
        runtime.isChatStreaming !== before.isChatStreaming ||
        runtime.lastFailedSend !== before.lastFailedSend ||
        runtime.lastError !== before.lastError
      : runtime.messages.length > 0 || runtime.isDraft;
    if (changed) void saveLocalChatUI(runtime).catch(reportStorageError);
  }
});
