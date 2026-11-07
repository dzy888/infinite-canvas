import {
  createAccountStorage,
  registerAccountFlush,
} from "@/lib/account-storage";
import {
  decodeClientSession,
  mergeClientTranscripts,
} from "@actalk/inkos-core/interaction/client-session";
import type { SessionRuntime } from "./inkos/store/chat/types";

export type LocalChat = ReturnType<typeof decodeClientSession>;
export type LocalChatUI = Pick<
  SessionRuntime,
  | "messages"
  | "lastFailedSend"
  | "lastError"
  | "isDraft"
  | "isStreaming"
  | "isChatStreaming"
> & { transcriptSeq?: number };
let instance: LocalForage | undefined;
let queue: Promise<unknown> = Promise.resolve();
const supported = () => typeof indexedDB !== "undefined";
export const hasLocalChatStorage = supported;
export function flushLocalChats() {
  return queue;
}
registerAccountFlush(flushLocalChats);
const serialize = <T,>(action: () => Promise<T>): Promise<T> => {
  const result = queue.then(action);
  queue = result.catch(() => undefined);
  return result;
};
async function openDatabase() {
  if (!supported())
    throw new Error(
      "当前浏览器无法使用本地聊天存储，请允许网站使用浏览器存储。",
    );
  instance ??= createAccountStorage("story_chats");
  await instance.setDriver("asyncStorage");
  await instance.ready();
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(instance!.config("name") as string);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
const resultOf = <T,>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
async function transaction<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  const database = await openDatabase();
  const tx = database.transaction("story_chats", mode);
  const completed = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () =>
      reject(tx.error ?? new Error("本地保存失败，原数据已保留。"));
  });
  try {
    const store = tx.objectStore("story_chats");
    const version = await resultOf(store.get("formatVersion"));
    if (version !== undefined && version !== 1)
      throw new Error("本地聊天存储版本无法识别，请先导出原始数据。");
    if (mode === "readwrite" && version === undefined)
      store.put(1, "formatVersion");
    const value = await action(store);
    await completed;
    return value;
  } catch (error) {
    try {
      tx.abort();
    } catch {
      /* Already rolled back. */
    }
    await completed.catch(() => undefined);
    throw error;
  } finally {
    database.close();
  }
}
const range = (prefix: string) => IDBKeyRange.bound(prefix, prefix + "\uffff");
function storeChat(store: IDBObjectStore, chat: LocalChat) {
  if (!chat.session) throw new Error("聊天记录缺少会话信息。");
  const { messages, ...metadata } = chat.session;
  store.put(chat, "record:" + chat.sessionId);
  store.put(
    { ...metadata, messageCount: messages.length },
    "summary:" + chat.sessionId,
  );
}
export function readLocalChat(id: string): Promise<LocalChat | undefined> {
  return serialize(() =>
    transaction("readonly", (store) => resultOf(store.get("record:" + id))),
  );
}
export function listLocalChats(bookId: string | null) {
  return serialize(() =>
    transaction("readonly", async (store) => {
      const summaries = await resultOf(store.getAll(range("summary:")));
      return summaries
        .filter((item) => item.bookId === bookId && !item.isDraft)
        .sort((a, b) => b.updatedAt - a.updatedAt);
    }),
  );
}
export function saveLocalChat(value: unknown) {
  const incoming = decodeClientSession(value);
  return serialize(() =>
    transaction("readwrite", async (store) => {
      if (await resultOf(store.get("deleted:" + incoming.sessionId)))
        return incoming;
      const previous = (await resultOf(
        store.get("record:" + incoming.sessionId),
      )) as LocalChat | undefined;
      const chat = previous
        ? decodeClientSession({
            ...incoming,
            transcript: mergeClientTranscripts(
              previous.transcript,
              incoming.transcript,
              incoming.sessionId,
            ),
          })
        : incoming;
      storeChat(store, chat);
      return chat;
    }),
  );
}
export function appendLocalTranscript(id: string, transcript: string) {
  return serialize(() =>
    transaction("readwrite", async (store) => {
      if (await resultOf(store.get("deleted:" + id))) return;
      const previous = (await resultOf(store.get("record:" + id))) as
        | LocalChat
        | undefined;
      const raw = mergeClientTranscripts(
        previous?.transcript ?? "",
        transcript,
        id,
      );
      // Out-of-order SSE delivery is reconciled by the full HTTP snapshot.
      if (JSON.parse(raw.split("\n")[0]).type !== "session_created") return;
      storeChat(
        store,
        decodeClientSession({
          ...previous,
          version: 1,
          sessionId: id,
          transcript: raw,
        }),
      );
    }),
  );
}
export function saveLocalChatUI(runtime: SessionRuntime) {
  return serialize(() =>
    transaction("readwrite", async (store) => {
      if (await resultOf(store.get("deleted:" + runtime.sessionId))) return;
      if (!(await resultOf(store.get("record:" + runtime.sessionId)))) {
        const timestamp = Number(runtime.sessionId.split("-")[0]) || Date.now();
        const {
          sessionId,
          bookId,
          sessionKind,
          profileId,
          workId,
          proposalAction,
          playMode,
          modelOverride,
          serviceOverride,
          title,
        } = runtime;
        const event = {
          version: 1,
          type: "session_created",
          sessionId,
          seq: 1,
          timestamp,
          bookId,
          sessionKind,
          profileId,
          workId,
          proposalAction,
          playMode,
          modelOverride,
          serviceOverride,
          title,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        storeChat(
          store,
          decodeClientSession({
            version: 1,
            sessionId,
            transcript: JSON.stringify(event) + "\n",
          }),
        );
      }
      const record = await resultOf(store.get("record:" + runtime.sessionId));
      const ui: LocalChatUI = {
        transcriptSeq: lastSequence(record.transcript),
        messages: runtime.messages,
        lastFailedSend: runtime.lastFailedSend,
        lastError: runtime.lastError,
        isDraft: runtime.isDraft,
        isStreaming: runtime.isStreaming,
        isChatStreaming: runtime.isChatStreaming,
      };
      store.put(ui, "ui:" + runtime.sessionId);
      const summary = await resultOf(store.get("summary:" + runtime.sessionId));
      if (summary)
        store.put(
          {
            ...summary,
            isDraft: runtime.isDraft,
            title:
              summary.title ??
              runtime.messages
                .find((message) => message.role === "user")
                ?.content.trim()
                .replace(/\s+/g, " ") ??
              null,
            messageCount: Math.max(
              summary.messageCount,
              runtime.messages.length,
            ),
            updatedAt: Math.max(
              summary.updatedAt,
              runtime.messages.reduce(
                (latest, message) => Math.max(latest, message.timestamp),
                0,
              ),
            ),
          },
          "summary:" + runtime.sessionId,
        );
    }),
  );
}
export function readLocalChatUI(id: string): Promise<LocalChatUI | undefined> {
  return serialize(() =>
    transaction("readonly", (store) => resultOf(store.get("ui:" + id))),
  );
}
export function saveLocalDraft(text: string) {
  return serialize(() =>
    transaction("readwrite", async (store) => {
      store.put(text, "draft");
    }),
  );
}
export function readLocalDraft(): Promise<string | undefined> {
  return serialize(() =>
    transaction("readonly", (store) => resultOf(store.get("draft"))),
  );
}
export function removeLocalChat(id: string) {
  return serialize(() =>
    transaction("readwrite", async (store) => {
      for (const prefix of ["record:", "summary:", "ui:", "request:"])
        store.delete(prefix + id);
      store.put(true, "deleted:" + id);
    }),
  );
}
export function renameLocalChat(id: string, title: string) {
  return serialize(() =>
    transaction("readwrite", async (store) => {
      const chat = (await resultOf(store.get("record:" + id))) as
        | LocalChat
        | undefined;
      if (!chat?.session) throw new Error("会话不存在。");
      const events = chat.transcript
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));
      const timestamp = Date.now();
      events.push({
        version: 1,
        type: "session_metadata_updated",
        sessionId: id,
        seq:
          events.reduce((latest, event) => Math.max(latest, event.seq), 0) + 1,
        timestamp,
        updatedAt: timestamp,
        title,
      });
      const updated = decodeClientSession({
        ...chat,
        transcript: events.map((e) => JSON.stringify(e)).join("\n") + "\n",
      });
      storeChat(store, updated);
      return updated;
    }),
  );
}
export function lastSequence(transcript: string): number {
  const end = transcript.trimEnd();
  const line = end.slice(end.lastIndexOf("\n") + 1);
  return line ? JSON.parse(line).seq : 0;
}
async function digest(value: unknown) {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return Array.from(new Uint8Array(hash), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
export function saveLocalRequest(id: string, value: unknown) {
  return serialize(() =>
    transaction("readwrite", async (store) => {
      if (await resultOf(store.get("deleted:" + id))) return;
      store.put(value, "request:" + id);
    }),
  );
}
export function readLocalRequest(id: string): Promise<any> {
  return serialize(() =>
    transaction("readonly", (store) => resultOf(store.get("request:" + id))),
  );
}
export async function exportLocalChats() {
  const data = await serialize(() =>
    transaction("readonly", async (store) => ({
      sessions: (await resultOf(store.getAll(range("record:")))) as LocalChat[],
      ui: await resultOf(store.getAll(range("ui:"))),
      uiKeys: await resultOf(store.getAllKeys(range("ui:"))),
      draft: await resultOf(store.get("draft")),
      migrationBackups: await resultOf(
        store.getAll(range("server-migration:")),
      ),
      requests: await resultOf(store.getAll(range("request:"))),
      requestKeys: await resultOf(store.getAllKeys(range("request:"))),
    })),
  );
  const payload = { ...data, exportedAt: new Date().toISOString() };
  return JSON.stringify(
    {
      format: "dmxvideo-chat-backup",
      version: 1,
      checksum: await digest(payload),
      payload,
    },
    null,
    2,
  );
}
export async function importLocalChats(text: string) {
  const backup = JSON.parse(text);
  if (
    backup.format !== "dmxvideo-chat-backup" ||
    backup.version !== 1 ||
    !backup.payload ||
    !Array.isArray(backup.payload.sessions)
  )
    throw new Error("无法识别的聊天备份格式或版本。");
  if (backup.checksum !== (await digest(backup.payload)))
    throw new Error("备份校验失败，文件可能已损坏，未修改现有记录。");
  const sessions = backup.payload.sessions.map((value: unknown) =>
    decodeClientSession(value),
  );
  if (sessions.some((chat: LocalChat) => !chat.session))
    throw new Error("备份中存在不完整的会话。");
  const uiKeys = backup.payload.uiKeys ?? [],
    uiValues = backup.payload.ui ?? [];
  if (
    !Array.isArray(uiKeys) ||
    !Array.isArray(uiValues) ||
    uiKeys.length !== uiValues.length
  )
    throw new Error("备份的界面记录已损坏。");
  const requestKeys = backup.payload.requestKeys ?? [],
    requests = backup.payload.requests ?? [];
  if (
    !Array.isArray(requestKeys) ||
    !Array.isArray(requests) ||
    requestKeys.length !== requests.length ||
    requestKeys.some(
      (key: unknown) => typeof key !== "string" || !key.startsWith("request:"),
    ) ||
    uiKeys.some(
      (key: unknown) => typeof key !== "string" || !key.startsWith("ui:"),
    ) ||
    (backup.payload.draft !== undefined &&
      typeof backup.payload.draft !== "string") ||
    (backup.payload.migrationBackups !== undefined &&
      !Array.isArray(backup.payload.migrationBackups))
  )
    throw new Error("备份清单已损坏。");
  for (const ui of uiValues)
    if (
      !ui ||
      !Array.isArray(ui.messages) ||
      ui.messages.some(
        (m: any) =>
          !["user", "assistant"].includes(m.role) ||
          typeof m.content !== "string" ||
          typeof m.timestamp !== "number",
      )
    )
      throw new Error("备份包含无效的聊天消息。");
  return serialize(() =>
    transaction("readwrite", async (store) => {
      // A single IndexedDB transaction saves the original data before importing.
      const keys = await resultOf(store.getAllKeys());
      const values = await resultOf(store.getAll());
      const original = keys
        .map((key, index) => ({ key, value: values[index] }))
        .filter(
          (entry) =>
            !String(entry.key).startsWith("before-import:") &&
            !String(entry.key).startsWith("server-migration:"),
        );
      store.put(
        { version: 1, entries: original },
        "before-import:" + crypto.randomUUID(),
      );
      let imported = 0,
        copies = 0;
      for (let chat of sessions) {
        const oldId = chat.sessionId;
        const previous = (await resultOf(store.get("record:" + oldId))) as
          | LocalChat
          | undefined;
        let keepExistingUI = false;
        if (previous) {
          try {
            keepExistingUI =
              lastSequence(previous.transcript) >=
              lastSequence(chat.transcript);
            chat = decodeClientSession({
              ...chat,
              transcript: mergeClientTranscripts(
                previous.transcript,
                chat.transcript,
                oldId,
              ),
            });
          } catch {
            keepExistingUI = false;
            const id = `${Date.now()}-${crypto.randomUUID().replaceAll("-", "")}`;
            const events = chat.transcript
              .trim()
              .split("\n")
              .map((line: string) => ({ ...JSON.parse(line), sessionId: id }));
            const timestamp = Date.now();
            events.push({
              version: 1,
              type: "session_metadata_updated",
              sessionId: id,
              seq: events[events.length - 1].seq + 1,
              timestamp,
              updatedAt: timestamp,
              title: (chat.session?.title ?? "未命名会话") + "（导入副本）",
            });
            chat = decodeClientSession({
              ...chat,
              sessionId: id,
              transcript:
                events.map((event: any) => JSON.stringify(event)).join("\n") +
                "\n",
            });
            copies++;
          }
        }
        store.delete("deleted:" + chat.sessionId);
        storeChat(store, chat);
        const requestIndex = (backup.payload.requestKeys ?? []).indexOf(
          "request:" + oldId,
        );
        if (requestIndex >= 0 && !keepExistingUI)
          store.put(
            backup.payload.requests[requestIndex],
            "request:" + chat.sessionId,
          );
        const ui = uiValues[uiKeys.indexOf("ui:" + oldId)];
        if (ui && !keepExistingUI)
          store.put(
            {
              ...ui,
              transcriptSeq: lastSequence(chat.transcript),
              isStreaming: false,
              isChatStreaming: false,
            },
            "ui:" + chat.sessionId,
          );
        imported++;
      }
      for (const migration of backup.payload.migrationBackups ?? [])
        store.put(migration, "server-migration:" + crypto.randomUUID());
      if (backup.payload.draft && !(await resultOf(store.get("draft"))))
        store.put(backup.payload.draft, "draft");
      return { imported, copies };
    }),
  );
}
export function saveServerMigrationBackup(value: unknown) {
  return serialize(() =>
    transaction("readwrite", async (store) => {
      const key = "server-migration:" + crypto.randomUUID();
      store.put(value, key);
      if (
        JSON.stringify(await resultOf(store.get(key))) !== JSON.stringify(value)
      )
        throw new Error("本机备份核对失败，服务器原始记录已保留。");
    }),
  );
}
