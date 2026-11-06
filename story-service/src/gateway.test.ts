import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { PostgresStoryStorage } from "./storage/postgres.js";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { createStoryGateway, encodeModel } from "./gateway.js";

const expires = Math.floor(Date.now() / 1000) + 3600;
function token(id: number) {
  return (
    "header." +
    Buffer.from(
      JSON.stringify({ sid: "session-" + id, exp: expires }),
    ).toString("base64url") +
    ".signature-" +
    id
  );
}
for (const postgres of [false, true])
  test(
    `original Studio APIs isolate accounts and route managed models through New API (${postgres ? "PostgreSQL" : "legacy"})`,
    { skip: postgres && !process.env.STORY_TEST_DATABASE_URL },
    async () => {
      const storage = postgres
        ? new PostgresStoryStorage(
            process.env.STORY_TEST_DATABASE_URL!,
            "dmx_story_test_" + randomUUID().replaceAll("-", ""),
          )
        : undefined;
      await storage?.initialize();
      const dir = await mkdtemp(join(tmpdir(), "dmx-story-test-"));
      const tokens = new Map([
        [token(41), 41],
        [token(42), 42],
      ]);
      const relayed: Array<{
        path: string;
        authorization: string;
        body: Record<string, unknown>;
      }> = [];
      const fakeFetch: typeof fetch = async (input, init) => {
        const url = new URL(String(input));
        const authorization =
          new Headers(init?.headers).get("Authorization") ?? "";
        const id = tokens.get(authorization.replace("Bearer ", ""));
        if (!id) return Response.json({ success: false }, { status: 401 });
        if (url.pathname === "/api/user/self")
          return Response.json({
            success: true,
            data: { id, group: "default" },
          });
        if (url.pathname === "/api/pricing")
          return Response.json({
            data: [
              {
                model_name: "writing-model",
                enable_groups: ["default"],
                supported_endpoint_types: ["openai"],
              },
            ],
            usable_group: { default: "Default" },
            group_ratio: { default: 1 },
            auto_groups: [],
          });
        if (url.pathname === "/api/canvas/relay/v1/chat/completions") {
          relayed.push({
            path: url.pathname,
            authorization,
            body: JSON.parse(String(init?.body)),
          });
          return new Response(
            [
              {
                id: "test",
                object: "chat.completion.chunk",
                model: "writing-model",
                choices: [
                  {
                    index: 0,
                    delta: {
                      role: "assistant",
                      tool_calls: [
                        {
                          index: 0,
                          id: "finish-test",
                          type: "function",
                          function: {
                            name: "finish_turn",
                            arguments: JSON.stringify({
                              status: "answered",
                              message: "A story",
                            }),
                          },
                        },
                      ],
                    },
                    finish_reason: null,
                  },
                ],
              },
              {
                id: "test",
                object: "chat.completion.chunk",
                model: "writing-model",
                choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }],
                usage: { prompt_tokens: 1, completion_tokens: 2 },
              },
            ]
              .map((data) => "data: " + JSON.stringify(data) + "\n\n")
              .join("") + "data: [DONE]\n\n",
            { headers: { "Content-Type": "text/event-stream" } },
          );
        }
        return Response.json({ error: "unexpected upstream" }, { status: 404 });
      };
      const gateway = createStoryGateway({
        storage,
        newApiUrl: "http://newapi.test",
        dataDir: dir,
        publicOrigins: ["http://canvas.test"],
        fetchImpl: fakeFetch,
      });
      const server = serve({
        fetch: gateway.app.fetch,
        port: 0,
        hostname: "127.0.0.1",
      });
      await new Promise<void>((resolve) => server.once("listening", resolve));
      const origin =
        "http://127.0.0.1:" + (server.address() as { port: number }).port;
      gateway.setInternalOrigin(origin);
      const headers = (id: number) => ({
        Authorization: "Bearer " + token(id),
        Origin: "http://canvas.test",
        "Content-Type": "application/json",
      });
      try {
        assert.equal((await fetch(origin + "/inkos-api/v1/books")).status, 401);
        assert.equal(
          (
            await fetch(origin + "/inkos-api/session", {
              method: "POST",
              headers: { ...headers(41), Origin: "http://evil.test" },
            })
          ).status,
          403,
        );
        const boot = await fetch(origin + "/inkos-api/session", {
          method: "POST",
          headers: headers(41),
        });
        assert.equal(boot.status, 200, await boot.text());
        const cookie = boot.headers.get("set-cookie")!.split(";")[0]!;
        const project = await fetch(origin + "/inkos-api/v1/project", {
          headers: headers(41),
        });
        assert.equal(project.status, 200);
        assert.equal((await project.json()).language, "zh");
        assert.equal(
          (
            await fetch(origin + "/inkos-api/v1/project?_owner=42", {
              headers: { Cookie: cookie },
            })
          ).status,
          409,
        );
        const create = await fetch(origin + "/inkos-api/v1/sessions", {
          method: "POST",
          headers: headers(41),
          body: JSON.stringify({
            title: "Only owner 41",
            sessionKind: "short",
          }),
        });
        assert.equal(create.status, 200, await create.clone().text());
        const created = await create.json();
        const session = created.session;
        const rename = await fetch(
          origin + "/inkos-api/v1/sessions/" + session.sessionId,
          {
            method: "PUT",
            headers: headers(41),
            body: JSON.stringify({ title: "Only owner 41" }),
          },
        );
        assert.equal(rename.status, 200, await rename.text());
        const mine = await fetch(origin + "/inkos-api/v1/sessions", {
          headers: headers(41),
        });
        assert.match(await mine.text(), /Only owner 41/);
        const other = await fetch(origin + "/inkos-api/v1/sessions", {
          headers: headers(42),
        });
        assert.equal(other.status, 200);
        assert.doesNotMatch(await other.text(), /Only owner 41/);
        const blocked = await fetch(
          origin + "/inkos-api/v1/services/custom/secret",
          {
            method: "PUT",
            headers: headers(41),
            body: JSON.stringify({ apiKey: "must-not-save" }),
          },
        );
        assert.equal(blocked.status, 403);
        const models = await fetch(origin + "/inkos-api/v1/services/models", {
          headers: headers(41),
        });
        const catalog = await models.json();
        assert.equal(catalog.groups[0].models[0].name, "writing-model");
        const settings = await fetch(origin + "/inkos-api/v1/managed-models", {
          method: "PUT",
          headers: headers(41),
          body: JSON.stringify({
            textModel: encodeModel("writing-model", "chat"),
          }),
        });
        assert.equal(settings.status, 200);
        const json = storage
          ? Buffer.from(
              await storage.operate(41, "files.read", { path: "inkos.json" }),
              "base64",
            ).toString()
          : await readFile(join(dir, "41/inkos.json"), "utf8");
        assert.doesNotMatch(json, /must-not-save|signature-41|session-41/);
        assert.equal(JSON.parse(json).llm.apiKey, "");
        assert.equal(
          (
            await fetch(origin + "/internal/relay/v1/chat/completions", {
              method: "POST",
              headers: headers(41),
              body: "{}",
            })
          ).status,
          401,
        );
        // The worker itself is not a public alternate route around the gateway.
        const chatCreate = await fetch(origin + "/inkos-api/v1/sessions", {
          method: "POST",
          headers: headers(41),
          body: JSON.stringify({ sessionKind: "chat" }),
        });
        const chat = (await chatCreate.json()).session;
        const run = await fetch(origin + "/inkos-api/v1/agent", {
          method: "POST",
          headers: headers(41),
          body: JSON.stringify({
            instruction: "Give me a story idea",
            sessionId: chat.sessionId,
            model: encodeModel("writing-model", "chat"),
            service: "custom",
          }),
        });
        const result = await run.text();
        assert.equal(run.status, 200, result);
        assert.ok(relayed.length > 0, result);
        assert.equal(relayed[0]!.authorization, "Bearer " + token(41));
        assert.equal(relayed[0]!.body.model, "writing-model");
        assert.match(result, /A story/);
        const missing = await fetch(
          origin + "/inkos-api/v1/sessions/" + session.sessionId,
          { headers: headers(42) },
        );
        assert.equal(missing.status, 404);
        tokens.delete(token(41));
        assert.equal(
          (
            await fetch(origin + "/inkos-api/v1/project?_owner=41", {
              headers: { Cookie: cookie },
            })
          ).status,
          401,
        );
      } finally {
        await gateway.close();
        if ("closeAllConnections" in server) server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
        await rm(dir, { recursive: true, force: true });
        if (storage) {
          await storage.pool.query(`DROP SCHEMA "${storage.schema}" CASCADE`);
          await storage.close();
        }
      }
    },
  );
