import { isClientSessionPath } from "./client-session-path.js";
import { databaseSnapshot } from "./snapshot.js";
import { createHash } from "node:crypto";
import { readdir, readFile, lstat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { isDeepStrictEqual } from "node:util";
import type { PostgresStoryStorage } from "./postgres.js";
import { HARNESS_VERSION } from "../../vendor/core/src/harness/contracts.js";

function groupBy<T>(values: Iterable<T>, key: (value: T) => string) {
  const groups = new Map<string, T[]>();
  for (const value of values) {
    const id = key(value),
      rows = groups.get(id) ?? [];
    rows.push(value);
    groups.set(id, rows);
  }
  return groups;
}

// Originals are never modified: SQLite is read only during this one-time import.
export async function importLegacyStories(
  storage: PostgresStoryStorage,
  user: number,
  root: string,
) {
  const prefix = `"${storage.schema}".`;
  if (
    (
      await storage.pool.query(
        `SELECT 1 FROM ${prefix}accounts WHERE user_id=$1`,
        [user],
      )
    ).rowCount
  )
    return;
  const files: Array<{
    path: string;
    content: Buffer;
    directory: boolean;
    database?: boolean;
  }> = [];
  const search: Array<{ namespace: string; scope: string; document: any }> = [];
  const records: Array<{
    namespace: string;
    kind: string;
    id: string;
    data: any;
    parent?: string;
    work?: string;
    ordinal?: number;
    sort?: string;
  }> = [];
  async function visit(directory: string) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      const path = join(directory, entry.name),
        key = relative(root, path).split(sep).join("/");
      if (isClientSessionPath(key) || key.startsWith(".inkos/harness.sqlite"))
        continue;
      if ((await lstat(path)).isSymbolicLink())
        throw new Error("Story migration does not follow symbolic links");
      if (entry.isDirectory()) {
        files.push({ path: key, content: Buffer.alloc(0), directory: true });
        await visit(path);
        continue;
      }
      if (
        entry.name.endsWith("-wal") ||
        entry.name.endsWith("-shm") ||
        entry.name === ".write.lock"
      )
        continue;
      if (/\.(?:db|sqlite)$/.test(entry.name)) {
        const db = new DatabaseSync(path, { readOnly: true });
        try {
          const tables = new Set(
            db
              .prepare("SELECT name FROM sqlite_master WHERE type='table'")
              .all()
              .map((row) => String(row.name)),
          );
          const json = (value: unknown) => JSON.parse(String(value ?? "{}"));
          const rows = (table: string) =>
            db.prepare(`SELECT * FROM "${table}"`).all() as Array<
              Record<string, any>
            >;
          if (tables.has("creative_episodes"))
            for (const row of rows("creative_episodes"))
              records.push({
                namespace: key,
                kind: "episode",
                id: row.episode_id,
                work: row.work_id,
                sort: row.started_at,
                data: {
                  version: HARNESS_VERSION,
                  id: row.episode_id,
                  workId: row.work_id,
                  profileId: row.profile_id,
                  status: row.status,
                  startedAt: row.started_at,
                  completedAt: row.completed_at,
                  ownerPid: row.owner_pid ?? null,
                },
              });
          if (tables.has("creative_episode_events"))
            for (const row of rows("creative_episode_events"))
              records.push({
                namespace: key,
                kind: "episode-event",
                id: `${row.episode_id}:${row.seq}`,
                parent: row.episode_id,
                work: row.work_id,
                ordinal: Number(row.seq),
                sort: row.timestamp,
                data: {
                  version: HARNESS_VERSION,
                  episodeId: row.episode_id,
                  seq: Number(row.seq),
                  timestamp: row.timestamp,
                  type: row.type,
                  workId: row.work_id,
                  ...(row.capability_id
                    ? { capabilityId: row.capability_id }
                    : {}),
                  ...(row.action_id ? { actionId: row.action_id } : {}),
                  payload: json(row.payload_json),
                },
              });
          if (tables.has("entities"))
            for (const row of rows("entities"))
              records.push({
                namespace: key,
                kind: "entity",
                id: row.id,
                data: {
                  id: row.id,
                  type: row.type,
                  label: row.label,
                  summary: row.summary,
                  status: row.status,
                  ...(row.created_event
                    ? { createdEventId: row.created_event }
                    : {}),
                  ...(row.updated_event
                    ? { updatedEventId: row.updated_event }
                    : {}),
                },
              });
          if (tables.has("edges"))
            for (const row of rows("edges"))
              records.push({
                namespace: key,
                kind: "edge",
                id: row.id,
                parent: row.from_id,
                data: {
                  id: row.id,
                  fromId: row.from_id,
                  type: row.type,
                  toId: row.to_id,
                  value: json(row.value_json),
                  validFromEventId: row.valid_from_event,
                  validUntilEventId: row.valid_until_event,
                  sourceEventId: row.source_event_id,
                  visibility: json(row.visibility_json),
                  ...(row.strength === null ? {} : { strength: row.strength }),
                },
              });
          if (tables.has("state_slots"))
            for (const row of rows("state_slots"))
              records.push({
                namespace: key,
                kind: "state-slot",
                id: row.id,
                parent: row.owner_entity_id,
                data: {
                  id: row.id,
                  ownerEntityId: row.owner_entity_id,
                  kind: row.kind,
                  label: row.label,
                  value: json(row.value_json),
                  updatedEventId: row.updated_event,
                },
              });
          if (tables.has("events"))
            for (const row of rows("events"))
              records.push({
                namespace: key,
                kind: "event",
                id: row.id,
                ordinal: Number(row.turn),
                data: {
                  id: row.id,
                  turn: Number(row.turn),
                  actionKind: row.action_kind,
                  rawInput: row.raw_input,
                  outcomeSummary: row.outcome_summary,
                  createdAt: row.created_at,
                },
              });
          if (tables.has("retrieval_documents"))
            for (const row of rows("retrieval_documents"))
              search.push({
                namespace: key,
                scope: row.scope,
                document: {
                  id: row.document_id,
                  scope: row.scope,
                  kind: row.kind,
                  source: row.source,
                  title: row.title,
                  body: row.body,
                  metadata: json(row.metadata_json),
                  titleTokens: row.title_tokens,
                  bodyTokens: row.body_tokens,
                },
              });
          const supported = [
            "creative_episodes",
            "creative_episode_events",
            "entities",
            "edges",
            "state_slots",
            "events",
            "retrieval_documents",
            "retrieval_documents_fts",
            "retrieval_documents_fts_content",
            "retrieval_documents_fts_data",
            "retrieval_documents_fts_idx",
            "retrieval_documents_fts_docsize",
            "retrieval_documents_fts_config",
            "sqlite_sequence",
          ];
          if ([...tables].some((table) => !supported.includes(table)))
            throw new Error(`Unrecognized story database: ${key}`);
          files.push({
            path: key,
            content: Buffer.alloc(0),
            directory: false,
            database: true,
          });
        } finally {
          db.close();
        }
      } else
        files.push({
          path: key,
          content: await readFile(path),
          directory: false,
        });
    }
  }
  await visit(root);
  const byPath = new Map(files.map((file) => [file.path, file]));
  for (const file of files)
    if (file.database) {
      file.content = databaseSnapshot(
        records.filter((record) => record.namespace === file.path),
      );
      if (file.path.includes("/revisions/")) file.database = false;
    }
  // Converted database revisions keep their IDs and references; update their byte checksums atomically.
  for (const file of files)
    if (/^works\/[^/]+\/work\.json$/.test(file.path)) {
      const manifest = JSON.parse(file.content.toString()),
        workRoot = file.path.slice(0, -"work.json".length);
      let changed = false;
      for (const artifact of manifest.artifacts ?? [])
        for (const revision of artifact.revisions ?? []) {
          if (!/\.(?:db|sqlite)$/.test(revision.path)) continue;
          const snapshot = byPath.get(
            workRoot + (revision.snapshotPath ?? revision.path),
          );
          if (snapshot) {
            revision.checksum =
              "sha256:" +
              createHash("sha256").update(snapshot.content).digest("hex");
            revision.byteLength = snapshot.content.length;
            changed = true;
          }
        }
      if (changed)
        file.content = Buffer.from(JSON.stringify(manifest, null, 2) + "\n");
    }

  await storage.transaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock($1)", [user]);
    if (
      (
        await client.query(`SELECT 1 FROM ${prefix}accounts WHERE user_id=$1`, [
          user,
        ])
      ).rowCount
    )
      return;
    // A missing marker with populated rows requires review; never overwrite an interrupted or externally populated account.
    if (
      (
        await client.query(
          `SELECT 1 FROM ${prefix}files WHERE user_id=$1 LIMIT 1`,
          [user],
        )
      ).rowCount
    )
      throw new Error(
        "Story account already has database data without a migration marker",
      );
    await client.query(
      `INSERT INTO ${prefix}files(user_id,path,parent_path,name,directory) VALUES($1,'.','','.',true)`,
      [user],
    );
    for (const file of files) {
      const parent = file.path.includes("/")
        ? file.path.slice(0, file.path.lastIndexOf("/"))
        : ".";
      await client.query(
        `INSERT INTO ${prefix}files(user_id,path,parent_path,name,directory,content,database_file) VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [
          user,
          file.path,
          parent,
          file.path.split("/").at(-1),
          file.directory,
          file.content,
          file.database ?? false,
        ],
      );
    }
    const namespaces = groupBy(records, (record) => record.namespace);
    for (const [namespace, items] of namespaces)
      await storage.putRecords(client, user, namespace, items);
    for (const [namespace, items] of groupBy(search, (row) => row.namespace))
      for (const [scope, docs] of groupBy(items, (row) => row.scope))
        await storage.replaceSearch(
          client,
          user,
          namespace,
          scope,
          docs.map((row) => row.document),
        );
    await client.query(`INSERT INTO ${prefix}accounts(user_id) VALUES($1)`, [
      user,
    ]);
    const count = Number(
      (
        await client.query(
          `SELECT count(*) AS count FROM ${prefix}files WHERE user_id=$1`,
          [user],
        )
      ).rows[0].count,
    );
    if (count !== files.length + 1)
      throw new Error("Story migration file-count verification failed");
    if (
      records.length !==
      Number(
        (
          await client.query(
            `SELECT count(*) AS count FROM ${prefix}records WHERE user_id=$1`,
            [user],
          )
        ).rows[0].count,
      )
    )
      throw new Error("Story migration record-count verification failed");
    const importedFiles = new Map(
      (
        await client.query(
          `SELECT path,content FROM ${prefix}files WHERE user_id=$1`,
          [user],
        )
      ).rows.map((row) => [row.path, row.content]),
    );
    for (const file of files)
      if (!Buffer.from(importedFiles.get(file.path) ?? "").equals(file.content))
        throw new Error("Story migration content verification failed");
    const importedRecords = new Map(
      (
        await client.query(
          `SELECT namespace,kind,id,data FROM ${prefix}records WHERE user_id=$1`,
          [user],
        )
      ).rows.map((row) => [
        `${row.namespace}\0${row.kind}\0${row.id}`,
        row.data,
      ]),
    );
    for (const record of records)
      if (
        !isDeepStrictEqual(
          importedRecords.get(
            `${record.namespace}\0${record.kind}\0${record.id}`,
          ),
          JSON.parse(JSON.stringify(record.data)),
        )
      )
        throw new Error("Story migration record verification failed");
    if (
      search.length !==
      Number(
        (
          await client.query(
            `SELECT count(*) AS count FROM ${prefix}search_documents WHERE user_id=$1`,
            [user],
          )
        ).rows[0].count,
      )
    )
      throw new Error("Story migration search verification failed");
  });
  return {
    files: files.length,
    records: records.length,
    searchDocuments: search.length,
  };
}
