import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { loadProjectConfig } from "@actalk/inkos-core";
import { createStudioServer } from "../vendor/studio/src/api/server.js";

const root = process.env.DMX_STORY_ROOT!;
const config = await loadProjectConfig(root, {
  consumer: "studio",
  requireApiKey: false,
});
const studio = createStudioServer(config, root);
const app = new Hono();
app.use("*", async (c, next) => {
  if (c.req.header("X-Dmx-Worker") !== process.env.DMX_STORY_KEY)
    return c.json({ error: "Unauthorized" }, 401);
  await next();
});
app.all("*", (c) => studio.fetch(c.req.raw));
const server = serve(
  { fetch: app.fetch, port: 0, hostname: "127.0.0.1" },
  (address) => process.send?.({ port: address.port }),
);
process.on("disconnect", () => server.close(() => process.exit()));
