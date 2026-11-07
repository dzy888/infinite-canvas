import { evictAgentCache } from "../vendor/core/src/agent/agent-session.js";
import { releaseMemoryEpisodes } from "./storage/episode-store.js";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { loadProjectConfig } from "@actalk/inkos-core";
import {
  createStudioServer,
  publishStudioEvent,
} from "../vendor/studio/src/api/server.js";

import {
  clientSessionsEnabled,
  hydrateLocalSession,
  localSessionSnapshot,
  localSessionBusy,
  onLocalTranscript,
  releaseLocalSession,
} from "./storage/session-memory.js";
const root = process.env.DMX_STORY_ROOT!;
const config = await loadProjectConfig(root, {
  consumer: "studio",
  requireApiKey: false,
});
const studio = createStudioServer(config, root);
if (clientSessionsEnabled)
  onLocalTranscript((sessionId, transcript) =>
    publishStudioEvent("session:local", { version: 1, sessionId, transcript }),
  );
const app = new Hono();
app.use("*", async (c, next) => {
  if (c.req.header("X-Dmx-Worker") !== process.env.DMX_STORY_KEY)
    return c.json({ error: "Unauthorized" }, 401);
  await next();
});
app.all("*", async (c) => {
  let request = c.req.raw;
  let sessionId = c.req.path.match(/\/sessions\/([^/]+)/)?.[1];
  if (
    clientSessionsEnabled &&
    !["GET", "HEAD"].includes(c.req.method) &&
    c.req.header("content-type")?.includes("application/json")
  ) {
    const body = await c.req.raw.clone().json();
    sessionId = typeof body.sessionId === "string" ? body.sessionId : sessionId;
    if (body.localSession && sessionId) {
      try {
        hydrateLocalSession(sessionId, body.localSession);
      } catch (error) {
        return c.json(
          {
            error: {
              code: (error as any).code ?? "INVALID_LOCAL_SESSION",
              message: (error as Error).message,
            },
          },
          409,
        );
      }
    }
    const {
      localSession: _local,
      retryOfRequestId: _retry,
      ...engineBody
    } = body;
    request = new Request(c.req.raw, { body: JSON.stringify(engineBody) });
  }
  const response = await studio.fetch(request);
  if (
    !clientSessionsEnabled ||
    !response.headers.get("content-type")?.includes("application/json")
  )
    return response;
  const data = (await response.json()) as any;
  sessionId ??= data.session?.sessionId;
  const snapshot = sessionId ? localSessionSnapshot(sessionId) : null;
  const result = new Response(
    JSON.stringify(snapshot ? { ...data, localSession: snapshot } : data),
    { status: response.status, headers: response.headers },
  );
  if (
    sessionId &&
    !localSessionBusy(sessionId) &&
    studio.releaseLocalSession(sessionId)
  ) {
    evictAgentCache(sessionId);
    releaseLocalSession(sessionId);
  }
  if (clientSessionsEnabled) releaseMemoryEpisodes();
  return result;
});
const server = serve(
  { fetch: app.fetch, port: 0, hostname: "127.0.0.1" },
  (address) => process.send?.({ port: address.port }),
);
process.on("disconnect", () => server.close(() => process.exit()));
