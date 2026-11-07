import {
  flushLocalChats,
  lastSequence,
  hasLocalChatStorage,
  listLocalChats,
  readLocalChat,
  readLocalChatUI,
  saveLocalChat,
  removeLocalChat,
  renameLocalChat,
  readLocalRequest,
  saveLocalRequest,
} from "./local-chat-storage";

export async function localChatTransport(
  url: URL,
  init: RequestInit,
  remote: (init: RequestInit) => Promise<Response>,
): Promise<Response> {
  if (!hasLocalChatStorage()) return remote(init);
  const path = url.pathname.slice("/inkos-api/v1".length),
    method = init.method ?? "GET";
  const match = path.match(/^\/sessions\/([^/]+)(?:\/(play-mode|abort))?$/);
  const id = match ? decodeURIComponent(match[1]) : undefined;
  if (
    path === "/sessions" &&
    method === "GET" &&
    !url.searchParams.has("source")
  )
    return Response.json({
      sessions: await listLocalChats(
        url.searchParams.get("bookId") === "null"
          ? null
          : url.searchParams.get("bookId"),
      ),
    });
  if (id && method === "GET") {
    const local = await readLocalChat(id),
      ui = await readLocalChatUI(id);
    if (local && !ui?.isStreaming && !ui?.isChatStreaming)
      return Response.json({
        session: local.session,
        localUI:
          ui &&
          (ui.isStreaming ||
            ui.isChatStreaming ||
            (ui.transcriptSeq ?? 0) >= lastSequence(local.transcript))
            ? ui
            : undefined,
        local: true,
      });
    const response = await remote(init);
    if (response.status === 404 && local) {
      const previous = await readLocalRequest(id);
      const {
        instruction,
        localSession: _ignored,
        ...options
      } = previous ?? {};
      return Response.json({
        session: local.session,
        localUI:
          ui &&
          (ui.isStreaming ||
            ui.isChatStreaming ||
            (ui.transcriptSeq ?? 0) >= lastSequence(local.transcript))
            ? ui
            : undefined,
        local: true,
        chatRequest: ui?.isStreaming
          ? {
              sessionId: id,
              requestId: previous?.clientRequestId ?? id,
              startedAt: local.session?.updatedAt ?? Date.now(),
              status: "failed",
              error: {
                code: "LOCAL_REQUEST_INTERRUPTED",
                message:
                  "运行已中断，已保留本地记录和已生成作品，可以重新发送。",
              },
              retry: instruction
                ? {
                    text: instruction,
                    options: { ...options, retryOfRequestId: undefined },
                  }
                : undefined,
            }
          : undefined,
      });
    }
    return capture(response);
  }
  if (id && method === "DELETE") {
    const response = await remote(init);
    if (response.ok || response.status === 404) {
      await removeLocalChat(id);
      return Response.json({ ok: true });
    }
    return response;
  }
  if (id && method === "PUT" && !match?.[2]) {
    const ui = await readLocalChatUI(id);
    if (!ui?.isStreaming && !ui?.isChatStreaming) {
      const body = JSON.parse(String(init.body));
      const chat = await renameLocalChat(id, body.title);
      return Response.json({ session: chat.session });
    }
  }
  let next = init;
  if (
    typeof init.body === "string" &&
    new Headers(init.headers).get("Content-Type")?.includes("application/json")
  ) {
    const body = JSON.parse(init.body),
      sessionId = body.sessionId ?? id;
    if (sessionId) {
      await flushLocalChats();
      if (path === "/agent") await saveLocalRequest(sessionId, body);
      const chat = await readLocalChat(sessionId);
      if (chat)
        next = {
          ...init,
          body: JSON.stringify({ ...body, localSession: chat }),
        };
    }
  }
  return capture(await remote(next));
}
async function capture(response: Response) {
  if (response.headers.get("content-type")?.includes("application/json")) {
    const data = await response.clone().json();
    if (data.localSession) await saveLocalChat(data.localSession);
  }
  return response;
}
