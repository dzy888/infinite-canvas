import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { PostgresStoryStorage } from "./storage/postgres.js";
import {
  readLegacyChats,
  legacyChatSessions,
  removeLegacyChats,
} from "./storage/legacy-chats.js";
import { importLegacyStories } from "./storage/migrate.js";

test(
  "old chat moves only after a verified local backup and work data stays intact",
  { skip: !process.env.STORY_TEST_DATABASE_URL },
  async () => {
    const storage = new PostgresStoryStorage(
      process.env.STORY_TEST_DATABASE_URL!,
      "dmx_story_test_" + randomUUID().replaceAll("-", ""),
    );
    const root = await mkdtemp(join(tmpdir(), "dmx-story-local-"));
    await storage.initialize();
    try {
      const id = "100-old",
        path = `.inkos/sessions/${id}.jsonl`;
      const raw =
        JSON.stringify({
          version: 1,
          type: "session_created",
          sessionId: id,
          seq: 1,
          timestamp: 1,
          bookId: null,
          title: "旧聊天",
          createdAt: 1,
          updatedAt: 1,
        }) + "\n";
      await mkdir(join(root, ".inkos", "sessions"), { recursive: true });
      await writeFile(join(root, path), raw);
      await mkdir(join(root, "chapters"));
      await writeFile(join(root, "chapters", "story.md"), "故事保留");
      await importLegacyStories(storage, 41, root);
      assert.equal(
        (
          await storage.pool.query(
            `SELECT count(*) FROM "${storage.schema}".files WHERE user_id=41 AND path=$1`,
            [path],
          )
        ).rows[0].count,
        "0",
      );
      const archive = await readLegacyChats(storage, 41, root);
      assert.equal(legacyChatSessions(archive)[0].session?.title, "旧聊天");
      await assert.rejects(
        removeLegacyChats(storage, 41, root, "wrong-checksum"),
      );
      assert.equal(await readFile(join(root, path), "utf8"), raw);
      assert.equal(
        (await readLegacyChats(storage, 42, join(root, "absent"))).files.length,
        0,
      );
      await removeLegacyChats(storage, 41, root, archive.checksum);
      assert.equal((await readLegacyChats(storage, 41, root)).files.length, 0);
      assert.equal(
        await readFile(join(root, "chapters", "story.md"), "utf8"),
        "故事保留",
      );
      assert.equal(
        Buffer.from(
          await storage.operate(41, "files.read", {
            path: "chapters/story.md",
          }),
          "base64",
        ).toString(),
        "故事保留",
      );
    } finally {
      await storage.pool.query(`DROP SCHEMA "${storage.schema}" CASCADE`);
      await storage.close();
      await rm(root, { recursive: true, force: true });
    }
  },
);
