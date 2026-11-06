import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { PostgresStoryStorage } from "./storage/postgres.js";
import { serve } from "@hono/node-server";
import { resolve } from "node:path";
import { createStoryGateway } from "./gateway.js";
const envPath = resolve(process.env.NEW_API_ENV_FILE || "../../new-api/.env");
const newApiEnv = existsSync(envPath)
  ? parseEnv(readFileSync(envPath, "utf8"))
  : {};
const databaseUrl =
  process.env.STORY_DATABASE_URL || process.env.SQL_DSN || newApiEnv.SQL_DSN;
if (!databaseUrl)
  throw new Error(
    "Set STORY_DATABASE_URL to New API's PostgreSQL SQL_DSN (or set NEW_API_ENV_FILE)",
  );
const storage = new PostgresStoryStorage(databaseUrl);
await storage.initialize();
const port = Number(process.env.STORY_PORT || "3002");
const gateway = createStoryGateway({
  storage,
  newApiUrl: process.env.NEW_API_URL || "http://127.0.0.1:3000",
  dataDir: resolve(process.env.STORY_DATA_DIR || "../data/stories"),
  publicOrigins: (
    process.env.STORY_PUBLIC_ORIGINS ||
    "http://127.0.0.1:3001,http://localhost:3001"
  )
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
});
const server = serve(
  {
    fetch: gateway.app.fetch,
    port,
    hostname: process.env.STORY_HOST || "127.0.0.1",
  },
  (address) => {
    gateway.setInternalOrigin("http://127.0.0.1:" + address.port);
    console.log("DmxVideo story service: http://127.0.0.1:" + address.port);
  },
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, async () => {
    await gateway.close();
    await storage.close();
    server.close();
  });
