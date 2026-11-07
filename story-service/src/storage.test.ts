import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rm,
  access,
  copyFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { serve } from "@hono/node-server";
import { PostgresStoryStorage } from "./storage/postgres.js";
import { importLegacyStories } from "./storage/migrate.js";
import { HARNESS_VERSION } from "../vendor/core/src/harness/contracts.js";

async function runtimeProbe() {
  const fs = await import("./storage/fs-promises.js");
  const { PlayDB } = await import("./storage/play-db.js");
  const { CreativeEpisodeStore } = await import("./storage/episode-store.js");
  const { LocalSearchIndex } = await import("./storage/local-search.js");
  const { commitAtomicFileSet } = await import("./storage/atomic-file-set.js");
  const root = process.env.DMX_STORY_ROOT!;
  const run = join(root, "play", "probe"),
    db = new PlayDB(run);
  db.transaction(() => {
    db.recordEvent({
      id: "event-1",
      turn: 1,
      actionKind: "inspect",
      rawInput: "查看灯塔",
      createdAt: new Date().toISOString(),
    });
    db.upsertEntity({ id: "claim", type: "claim", label: "灯塔", summary: "" });
    for (const [id, strength] of [
      ["weak", 1],
      ["strong", 3],
    ] as const) {
      db.upsertEntity({ id, type: "clue", label: id, summary: "" });
      db.upsertEdge({
        id: "edge-" + id,
        fromId: id,
        toId: "claim",
        type: "supports",
        validFromEventId: "event-1",
        sourceEventId: "event-1",
        strength,
      });
    }
    db.upsertStateSlot({
      id: "slot",
      ownerEntityId: "claim",
      kind: "flag",
      label: "观察",
      value: true,
      updatedEventId: "event-1",
    });
  });
  assert.deepEqual(
    db.getEvidenceForClaim("claim").map((row) => row.id),
    ["strong", "weak"],
  );
  assert.equal(db.getCurrentEdgesForEntity("claim").length, 2);
  assert.equal(db.getStateSlotsForEntity("claim").length, 1);
  assert.throws(() =>
    db.transaction(() => {
      db.upsertEntity({
        id: "rollback",
        type: "clue",
        label: "rollback",
        summary: "",
      });
      throw new Error("rollback");
    }),
  );
  assert.equal(db.getEntity("rollback"), null);
  const snapshot = db.snapshot(),
    saved = await fs.readFile(join(run, "play.db"));
  await fs.writeFile(join(root, "revisions", "r1", "play.db"), saved);
  db.upsertEntity({ id: "claim", type: "claim", label: "修改后", summary: "" });
  await fs.copyFile(
    join(root, "revisions", "r1", "play.db"),
    join(run, "play.db"),
  );
  assert.deepEqual(db.snapshot(), snapshot);
  await commitAtomicFileSet({
    rootDir: root,
    writes: [],
    deletes: ["play/probe/play.db"],
  });
  const reopened = new PlayDB(run);
  assert.equal(reopened.getEntity("claim"), null);
  reopened.close();

  const search = new LocalSearchIndex(join(root, "search.sqlite"));
  search.replaceScope("memory", [
    {
      id: "clue",
      scope: "memory",
      kind: "chapter",
      source: "chapter.md",
      title: "灯塔线索",
      body: "灯塔里的陌生人",
      metadata: { chapter: 1 },
    },
  ]);
  assert.equal(search.search("灯塔", { scope: "memory" })[0]?.id, "clue");
  const episodes = new CreativeEpisodeStore(
    join(root, ".inkos", "legacy-episodes.sqlite"),
  );
  episodes.create({
    version: HARNESS_VERSION,
    id: "probe-episode",
    workId: null,
    profileId: "workspace-default",
    status: "running",
    startedAt: new Date().toISOString(),
    completedAt: null,
  });
  episodes.append({
    episodeId: "probe-episode",
    workId: null,
    type: "episode-started",
    payload: { tools: [{ name: "test", execute: () => undefined }] },
  });
  episodes.bindWork("probe-episode", "work-probe");
  assert.equal(episodes.listEvents("probe-episode").length, 2);
  assert.equal(
    episodes.finish("probe-episode", "completed").status,
    "completed",
  );
  await commitAtomicFileSet({
    rootDir: root,
    writes: [
      { relativePath: "chapters/probe.md", content: "测试章节" },
      { relativePath: "sessions/probe.json", content: '{"title":"测试"}' },
    ],
  });
  assert.equal(
    await fs.readFile(join(root, "chapters", "probe.md"), "utf8"),
    "测试章节",
  );
  db.close();
  episodes.close();
  search.close();
}

if (process.env.DMX_STORY_STORAGE_PROBE === "1") await runtimeProbe();
else
  test(
    "PostgreSQL migration, transactions, runtime adapters and indexes preserve story data",
    { skip: !process.env.STORY_TEST_DATABASE_URL },
    async () => {
      const storage = new PostgresStoryStorage(
        process.env.STORY_TEST_DATABASE_URL!,
        "dmx_story_test_" + randomUUID().replaceAll("-", ""),
      );
      const root = await mkdtemp(join(tmpdir(), "dmx-story-pg-")),
        owner = 41;
      let server: ReturnType<typeof serve> | undefined;
      try {
        await storage.initialize();
        await mkdir(join(root, "chapters"), { recursive: true });
        await mkdir(join(root, ".inkos"), { recursive: true });
        await writeFile(join(root, "chapters", "old.md"), "旧章节：灯塔之夜");
        const { CreativeEpisodeStore } =
          await import("../vendor/core/src/harness/episode-store.js");
        const { LocalSearchIndex } =
          await import("../vendor/core/src/retrieval/local-search.js");
        const old = new CreativeEpisodeStore(
          join(root, ".inkos", "legacy-episodes.sqlite"),
        );
        old.create({
          version: HARNESS_VERSION,
          id: "legacy-episode",
          workId: "legacy-work",
          profileId: "workspace-default",
          status: "running",
          startedAt: new Date().toISOString(),
          completedAt: null,
        });
        old.append({
          episodeId: "legacy-episode",
          workId: "legacy-work",
          type: "episode-started",
          payload: { instruction: "旧稿" },
        });
        old.finish("legacy-episode", "completed");
        old.close();
        const search = new LocalSearchIndex(join(root, "legacy-search.sqlite"));
        search.replaceScope("legacy", [
          {
            id: "old-chapter",
            scope: "legacy",
            kind: "chapter",
            source: "chapters/old.md",
            title: "灯塔",
            body: "灯塔之夜",
          },
        ]);
        search.close();
        const { PlayDB } = await import("../vendor/core/src/play/play-db.js");
        const { createWorkManifest } =
          await import("../vendor/core/src/harness/work-store.js");
        const legacyRun = join(root, "works", "legacy", "source", "run");
        const legacyPlay = new PlayDB(legacyRun);
        legacyPlay.upsertEntity({
          id: "old-actor",
          type: "actor",
          label: "旧人物",
          summary: "",
        });
        legacyPlay.close();
        const revisionPath = "revisions/play/rev-old.db";
        await mkdir(join(root, "works", "legacy", "revisions", "play"), {
          recursive: true,
        });
        await copyFile(
          join(legacyRun, "play.db"),
          join(root, "works", "legacy", revisionPath),
        );
        const legacyBytes = await readFile(
          join(root, "works", "legacy", revisionPath),
        );
        const work = createWorkManifest({
          id: "legacy",
          title: "旧作品",
          profileId: "interactive-play",
          language: "zh",
        });
        work.artifacts.push({
          id: "play",
          kind: "play-state",
          currentRevisionId: "rev-old",
          metadata: {},
          revisions: [
            {
              id: "rev-old",
              parentRevisionId: null,
              path: "source/run/play.db",
              snapshotPath: revisionPath,
              contentType: "application/x-sqlite3",
              status: "current",
              checksum:
                "sha256:" +
                createHash("sha256").update(legacyBytes).digest("hex"),
              byteLength: legacyBytes.length,
              createdAt: new Date().toISOString(),
            },
          ],
        });
        await writeFile(
          join(root, "works", "legacy", "work.json"),
          JSON.stringify(work),
        );
        const original = await readFile(join(root, ".inkos", "legacy-episodes.sqlite"));
        const imported = await importLegacyStories(storage, owner, root);
        assert.equal(imported?.records, 4);
        assert.equal(imported?.searchDocuments, 1);
        assert.deepEqual(
          await readFile(join(root, ".inkos", "legacy-episodes.sqlite")),
          original,
        );
        assert.equal(
          await importLegacyStories(storage, owner, root),
          undefined,
        );
        const read = async (path: string) =>
          Buffer.from(
            await storage.operate(owner, "files.read", { path }),
            "base64",
          ).toString();
        assert.equal(await read("chapters/old.md"), "旧章节：灯塔之夜");
        await assert.rejects(
          storage.operate(42, "files.read", { path: "chapters/old.md" }),
          { code: "ENOENT" },
        );
        await assert.rejects(
          storage.operate(owner, "files.commit", {
            writes: [
              {
                path: "chapters/old.md",
                content: Buffer.from("不应保存").toString("base64"),
              },
              { path: "../outside", content: "" },
            ],
          }),
        );
        assert.equal(await read("chapters/old.md"), "旧章节：灯塔之夜");
        await Promise.all(
          Array.from({ length: 8 }, () =>
            storage.operate(owner, "files.write", {
              path: "sessions/concurrent.jsonl",
              content: Buffer.from("entry\n").toString("base64"),
              append: true,
            }),
          ),
        );
        assert.equal(
          (await read("sessions/concurrent.jsonl")).split("\n").filter(Boolean)
            .length,
          8,
        );
        const events = await Promise.all(
          Array.from({ length: 12 }, () =>
            storage.operate(owner, "episode.append", {
              namespace: ".inkos/legacy-episodes.sqlite",
              event: {
                version: HARNESS_VERSION,
                episodeId: "legacy-episode",
                workId: "legacy-work",
                type: "action-started",
                timestamp: new Date().toISOString(),
                payload: {},
              },
            }),
          ),
        );
        assert.deepEqual(
          events.map((row) => row.seq).sort((a, b) => a - b),
          Array.from({ length: 12 }, (_, i) => i + 1),
        );
        server = serve({
          hostname: "127.0.0.1",
          port: 0,
          fetch: async (request) => {
            if (request.headers.get("X-Dmx-Worker") !== "isolated-test-key")
              return new Response(null, { status: 401 });
            try {
              const { op, args } = (await request.json()) as any;
              return Response.json({
                data: (await storage.operate(owner, op, args)) ?? null,
              });
            } catch (error) {
              return Response.json(
                {
                  error: {
                    message: (error as Error).message,
                    code: (error as NodeJS.ErrnoException).code,
                  },
                },
                { status: 400 },
              );
            }
          },
        });
        await new Promise<void>((resolve) =>
          server!.once("listening", resolve),
        );
        const url =
          "http://127.0.0.1:" + (server.address() as { port: number }).port;
        await new Promise<void>((resolve, reject) => {
          const child = spawn(
            process.execPath,
            ["--import", "tsx", fileURLToPath(import.meta.url)],
            {
              stdio: ["ignore", "ignore", "pipe"],
              env: {
                ...process.env,
                DMX_STORY_STORAGE_PROBE: "1",
                DMX_STORY_STORAGE: "postgres",
                DMX_STORY_ROOT: root,
                DMX_STORY_STORAGE_URL: url,
                DMX_STORY_KEY: "isolated-test-key",
              },
            },
          );
          let stderr = "";
          child.stderr.on("data", (chunk) => (stderr += chunk));
          child.on("error", reject);
          child.on("exit", (code) =>
            code === 0 ? resolve() : reject(new Error(stderr)),
          );
        });
        await assert.rejects(access(join(root, "chapters", "probe.md")), {
          code: "ENOENT",
        });
        assert.equal(await read("chapters/probe.md"), "测试章节");
        const restored = new PostgresStoryStorage(
          process.env.STORY_TEST_DATABASE_URL!,
          storage.schema,
        );
        try {
          assert.equal(
            Buffer.from(
              await restored.operate(owner, "files.read", {
                path: "chapters/probe.md",
              }),
              "base64",
            ).toString(),
            "测试章节",
          );
        } finally {
          await restored.close();
        }
        await storage.transaction(async (client) => {
          await client.query("SET LOCAL enable_seqscan=off");
          const plans = [
            await client.query(
              `EXPLAIN SELECT * FROM "${storage.schema}".files WHERE user_id=41 AND parent_path='chapters' ORDER BY name`,
            ),
            await client.query(
              `EXPLAIN SELECT max(ordinal) FROM "${storage.schema}".records WHERE user_id=41 AND namespace='.inkos/legacy-episodes.sqlite' AND kind='episode-event' AND parent_id='legacy-episode'`,
            ),
            await client.query(
              `EXPLAIN SELECT * FROM "${storage.schema}".search_documents WHERE tokens @@ plainto_tsquery('simple','灯塔')`,
            ),
          ];
          assert.match(JSON.stringify(plans[0].rows), /story_files_parent/);
          assert.match(JSON.stringify(plans[1].rows), /story_records_parent/);
          assert.match(JSON.stringify(plans[2].rows), /story_search_tokens/);
        });
      } finally {
        if (server) {
          if ("closeAllConnections" in server) server.closeAllConnections();
          await new Promise<void>((resolve) => server!.close(() => resolve()));
        }
        await storage.pool.query(`DROP SCHEMA "${storage.schema}" CASCADE`);
        await storage.close();
        await rm(root, { recursive: true, force: true });
      }
    },
  );
