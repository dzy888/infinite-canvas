import "fake-indexeddb/auto";
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
const { initializeAccountStorage, createAccountStorage } =
  await import("@/lib/account-storage");
const {
  appendLocalTranscript,
  exportLocalChats,
  importLocalChats,
  listLocalChats,
  readLocalChat,
  readLocalChatUI,
  readLocalDraft,
  removeLocalChat,
  saveLocalChat,
  saveLocalChatUI,
  saveLocalDraft,
  saveLocalRequest,
} = await import("./local-chat-storage");
const { localChatTransport } = await import("./local-chat-transport");
import type { SessionRuntime } from "./inkos/store/chat/types";

initializeAccountStorage(987654321);
const db = createAccountStorage("story_chats");
beforeEach(async () => {
  await db.setDriver("asyncStorage");
  await db.clear();
});
function chat(id = "100-local", text = "你好") {
  const base = { version: 1, sessionId: id, timestamp: 100 };
  const events = [
    {
      ...base,
      seq: 1,
      type: "session_created",
      bookId: null,
      title: text,
      createdAt: 100,
      updatedAt: 100,
    },
    {
      ...base,
      seq: 2,
      type: "request_started",
      requestId: "turn-1",
      input: text,
    },
    {
      ...base,
      seq: 3,
      type: "message",
      requestId: "turn-1",
      uuid: "message-1",
      parentUuid: null,
      role: "user",
      message: {
        role: "user",
        content: [{ type: "text", text }],
        timestamp: 100,
      },
    },
    {
      ...base,
      seq: 4,
      type: "message",
      requestId: "turn-1",
      uuid: "message-2",
      parentUuid: "message-1",
      role: "assistant",
      visibility: "model",
      toolCallId: "call-1",
      message: {
        role: "assistant",
        content: [
          {
            type: "toolCall",
            id: "call-1",
            name: "read_file",
            arguments: { path: "story.md" },
          },
        ],
        timestamp: 100,
      },
    },
    {
      ...base,
      seq: 5,
      type: "message",
      requestId: "turn-1",
      uuid: "message-3",
      parentUuid: "message-2",
      role: "toolResult",
      visibility: "model",
      toolCallId: "call-1",
      sourceToolAssistantUuid: "message-2",
      message: {
        role: "toolResult",
        toolCallId: "call-1",
        toolName: "read_file",
        content: [{ type: "text", text: "人物设定" }],
        isError: false,
        timestamp: 100,
      },
    },
    { ...base, seq: 6, type: "request_committed", requestId: "turn-1" },
  ];
  return {
    version: 1,
    sessionId: id,
    transcript: events.map((event) => JSON.stringify(event)).join("\n") + "\n",
  };
}
function runtime(id = "100-local"): SessionRuntime {
  return {
    sessionId: id,
    bookId: null,
    title: "你好",
    messages: [{ role: "user", content: "你好", timestamp: 100 }],
    isDraft: false,
    isStreaming: false,
    isChatStreaming: false,
    lastError: null,
    stream: null,
  } as SessionRuntime;
}
async function repack(value: any) {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(value.payload)),
  );
  value.checksum = Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return JSON.stringify(value);
}
test("complete tool history, draft and retry survive export/import; list and detail stay local", async () => {
  const original = await saveLocalChat(chat());
  await saveLocalChatUI(runtime());
  await saveLocalDraft("未发出的草稿");
  await saveLocalRequest(original.sessionId, { instruction: "继续" });
  const backup = await exportLocalChats();
  await db.clear();
  assert.deepEqual(await importLocalChats(backup), { imported: 1, copies: 0 });
  assert.equal(
    (await readLocalChat(original.sessionId))?.transcript,
    original.transcript,
  );
  assert.equal(await readLocalDraft(), "未发出的草稿");
  assert.equal((await listLocalChats(null)).length, 1);
  let calls = 0;
  const remote = async () => {
    calls++;
    return Response.json({});
  };
  await localChatTransport(
    new URL("http://local/inkos-api/v1/sessions?bookId=null"),
    {},
    remote,
  );
  const detail = await localChatTransport(
    new URL("http://local/inkos-api/v1/sessions/100-local"),
    {},
    remote,
  );
  assert.equal(detail.ok, true);
  assert.equal(calls, 0);
  let sent: any;
  await localChatTransport(
    new URL("http://local/inkos-api/v1/agent"),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: "100-local", instruction: "继续" }),
    },
    async (init) => {
      sent = JSON.parse(String(init.body));
      return Response.json({});
    },
  );
  assert.equal(sent.localSession.transcript, original.transcript);
});
test("corrupt checksums and unknown storage versions do not overwrite original data", async () => {
  await saveLocalChat(chat());
  const backup = JSON.parse(await exportLocalChats());
  backup.payload.draft = "tampered";
  await assert.rejects(importLocalChats(JSON.stringify(backup)), /校验/);
  assert.equal((await listLocalChats(null)).length, 1);
  backup.version = 2;
  await assert.rejects(importLocalChats(JSON.stringify(backup)), /版本/);
  await db.setItem("formatVersion", 2);
  await assert.rejects(saveLocalChat(chat("200-other")), /版本/);
  assert.ok(await db.getItem("record:100-local"));
});
test("divergent IDs retain both histories, while an older backup preserves newer UI", async () => {
  await saveLocalChat(chat());
  const old = await exportLocalChats();
  await saveLocalChatUI({
    ...runtime(),
    messages: [
      ...runtime().messages,
      { role: "assistant", content: "新的回答", timestamp: 200 },
    ],
  });
  await importLocalChats(old);
  assert.equal(
    (await readLocalChatUI("100-local"))?.messages.at(-1)?.content,
    "新的回答",
  );
  const divergent = JSON.parse(old);
  divergent.payload.sessions = [chat("100-local", "另一个分支")];
  assert.equal((await importLocalChats(await repack(divergent))).copies, 1);
  const summaries = await listLocalChats(null);
  assert.equal(summaries.length, 2);
  assert.equal(
    summaries.some((s) => s.title?.includes("导入副本")),
    true,
  );
});
test("an IndexedDB write failure rolls back the entire import", async () => {
  await saveLocalChat(chat());
  const backup = JSON.parse(await exportLocalChats());
  backup.payload.sessions = [chat("200-one"), chat("300-two")];
  const original = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (value: any, key?: IDBValidKey) {
    if (key === "record:300-two") throw new Error("simulated disk full");
    return original.call(this, value, key);
  };
  try {
    await assert.rejects(importLocalChats(await repack(backup)), /disk full/);
  } finally {
    IDBObjectStore.prototype.put = original;
  }
  assert.deepEqual(
    (await listLocalChats(null)).map((s) => s.sessionId),
    ["100-local"],
  );
  assert.equal(
    (await db.keys()).some((key) => key.startsWith("before-import:")),
    false,
  );
});
test("late HTTP and SSE snapshots cannot resurrect a deleted conversation", async () => {
  const original = chat();
  await saveLocalChat(original);
  await removeLocalChat(original.sessionId);
  await saveLocalChat(original);
  await appendLocalTranscript(original.sessionId, original.transcript);
  await saveLocalChatUI(runtime());
  assert.equal(await readLocalChat(original.sessionId), undefined);
  assert.deepEqual(await listLocalChats(null), []);
});

test("loading sidebar summaries never erases saved replies", async () => {
  await saveLocalChat(chat());
  await saveLocalChatUI({
    ...runtime(),
    messages: [
      ...runtime().messages,
      { role: "assistant", content: "已保存的回复", timestamp: 200 },
    ],
  });
  const previousWindow = globalThis.window;
  const previousStorage = Object.getOwnPropertyDescriptor(
    globalThis,
    "localStorage",
  );
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: () => null, setItem() {}, removeItem() {} },
  });
  globalThis.window = {
    location: { origin: "http://local" },
    dispatchEvent() {},
  } as unknown as Window & typeof globalThis;
  try {
    const { useUserStore } = await import("@/stores/use-user-store");
    useUserStore.getState().setSession({
      access_token: "test",
      token_type: "Bearer",
      access_expires_at: Date.now() / 1000 + 3600,
      session: { sid: "local-test" },
      user: { id: 987654321, username: "test", role: 1 },
    });
    const { useChatStore } = await import("./inkos/store/chat/store");
    useChatStore.setState({ sessions: {}, sessionIdsByBook: {} });
    await useChatStore.getState().loadSessionList(null);
    await (await import("./local-chat-storage")).flushLocalChats();
    assert.equal(
      (await readLocalChatUI("100-local"))?.messages.at(-1)?.content,
      "已保存的回复",
    );
    await useChatStore.getState().loadSessionDetail("100-local", true);
    assert.equal(
      useChatStore.getState().sessions["100-local"].messages.at(-1)?.content,
      "已保存的回复",
    );
    await (await import("./local-chat-storage")).flushLocalChats();
  } finally {
    if (previousWindow) globalThis.window = previousWindow;
    else Reflect.deleteProperty(globalThis, "window");
    if (previousStorage)
      Object.defineProperty(globalThis, "localStorage", previousStorage);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});
