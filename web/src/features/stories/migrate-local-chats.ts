import { storyFetch } from "./transport";
import { decodeClientSession } from "@actalk/inkos-core/interaction/client-session";
import { saveLocalChat, saveServerMigrationBackup } from "./local-chat-storage";
let pending: Promise<void> | undefined;
export function migrateServerChats() {
  return (pending ??= run().catch((error) => {
    pending = undefined;
    throw error;
  }));
}
async function run() {
  const response = await storyFetch("/inkos-api/v1/sessions?source=server");
  if (!response.ok)
    throw new Error("旧聊天迁移暂未完成，服务器原记录仍保留，请稍后重试。");
  const data = await response.json();
  if (!data.archive?.files?.length && !data.archive?.records?.length) return;
  const sessions = (data.sessions ?? []).map((value: unknown) =>
    decodeClientSession(value),
  );
  await saveServerMigrationBackup(data.archive);
  for (const chat of sessions) await saveLocalChat(chat);
  const removed = await storyFetch("/inkos-api/v1/sessions?source=server", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ checksum: data.archive.checksum }),
  });
  if (!removed.ok)
    throw new Error("聊天已保存到本机，但服务器旧副本尚未清理，请重试。");
  window.dispatchEvent(new Event("dmx:local-chats-changed"));
}
