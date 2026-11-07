import { createHash } from "node:crypto";
import { lstat, readdir, readFile, rm } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import type { PostgresStoryStorage } from "./postgres.js";
import { clientSessionRoots } from "./client-session-path.js";
import { decodeClientSession } from "../../vendor/core/src/interaction/client-session.js";

type LegacyFile = {
  source: "database" | "filesystem";
  path: string;
  content: string;
  directory: boolean;
};
export async function readLegacyChats(
  storage: PostgresStoryStorage,
  user: number,
  root: string,
) {
  const prefix = `"${storage.schema}".`;
  const roots = [...clientSessionRoots, ".inkos/harness.sqlite"];
  const rows = (
    await storage.pool.query(
      `SELECT path,content,directory FROM ${prefix}files WHERE user_id=$1 AND
    EXISTS(SELECT 1 FROM unnest($2::text[]) r WHERE path=r OR starts_with(path,r||'/')) ORDER BY path`,
      [user, roots],
    )
  ).rows;
  const files: LegacyFile[] = rows.map((row) => ({
    source: "database",
    path: row.path,
    content: Buffer.from(row.content ?? "").toString("base64"),
    directory: row.directory,
  }));
  async function visit(path: string) {
    let info;
    try {
      info = await lstat(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    if (info.isSymbolicLink())
      throw new Error("Cannot migrate symbolic links in chat storage");
    if (info.isDirectory()) {
      for (const name of (await readdir(path)).sort())
        await visit(join(path, name));
      return;
    }
    files.push({
      source: "filesystem",
      path: relative(root, path).split(sep).join("/"),
      content: (await readFile(path)).toString("base64"),
      directory: false,
    });
  }
  for (const key of [
    ...roots,
    ".inkos/harness.sqlite-wal",
    ".inkos/harness.sqlite-shm",
  ])
    await visit(join(root, key));
  const records = (
    await storage.pool.query(
      `SELECT namespace,kind,id,parent_id,work_id,ordinal,sort_key,data FROM ${prefix}records WHERE user_id=$1 AND namespace='.inkos/harness.sqlite' ORDER BY kind,id`,
      [user],
    )
  ).rows;
  const data = { version: 1, files, records };
  return {
    ...data,
    checksum: createHash("sha256").update(JSON.stringify(data)).digest("hex"),
  };
}
export function legacyChatSessions(
  archive: Awaited<ReturnType<typeof readLegacyChats>>,
) {
  return archive.files
    .filter(
      (file) =>
        !file.directory && /^\.inkos\/sessions\/[^/]+\.jsonl$/.test(file.path),
    )
    .map((file) =>
      decodeClientSession({
        version: 1,
        sessionId: file.path.split("/").at(-1)!.slice(0, -6),
        transcript: Buffer.from(file.content, "base64").toString("utf8"),
        uploads: Object.fromEntries(
          archive.files
            .filter(
              (upload) =>
                !upload.directory &&
                upload.path.startsWith(
                  `.inkos/uploads/${file.path.split("/").at(-1)!.slice(0, -6)}/`,
                ),
            )
            .map((upload) => [
              upload.path.split("/").slice(3).join("/"),
              upload.content,
            ]),
        ),
      }),
    );
}
export async function removeLegacyChats(
  storage: PostgresStoryStorage,
  user: number,
  root: string,
  checksum: string,
) {
  const archive = await readLegacyChats(storage, user, root);
  if (archive.checksum !== checksum)
    throw new Error(
      "Server chat data changed; the original records were preserved",
    );
  const prefix = `"${storage.schema}".`;
  await storage.transaction(async (client) => {
    const paths = archive.files
      .filter((file) => file.source === "database")
      .map((file) => file.path);
    await client.query(
      `DELETE FROM ${prefix}search_documents WHERE user_id=$1 AND namespace=ANY($2::text[])`,
      [user, paths],
    );
    await client.query(
      `DELETE FROM ${prefix}files WHERE user_id=$1 AND path=ANY($2::text[])`,
      [user, paths],
    );
    if (archive.records.length)
      await client.query(
        `DELETE FROM ${prefix}records r USING jsonb_to_recordset($2::jsonb) AS old(namespace text,kind text,id text)
      WHERE r.user_id=$1 AND r.namespace=old.namespace AND r.kind=old.kind AND r.id=old.id`,
        [user, JSON.stringify(archive.records)],
      );
    for (const file of archive.files)
      if (file.source === "filesystem") await rm(join(root, file.path));
  });
}
