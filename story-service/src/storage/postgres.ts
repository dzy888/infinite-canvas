import { databaseSnapshot } from "./snapshot.js";
import { HARNESS_VERSION } from "../../vendor/core/src/harness/contracts.js";
import { Pool, type PoolClient } from "pg";
import { posix } from "node:path";
import { createHash } from "node:crypto";

type Queryable = Pool | PoolClient;
type RecordInput = {
  kind: string;
  id: string;
  data: Record<string, any>;
  parent?: string;
  work?: string;
  ordinal?: number;
  sort?: string;
};
export class PostgresStoryStorage {
  readonly pool: Pool;
  readonly schema: string;
  private readonly prefix: string;
  constructor(databaseUrl: string, schema = "dmx_story") {
    if (!/^postgres(?:ql)?:\/\//.test(databaseUrl))
      throw new Error("Story storage requires New API's PostgreSQL SQL_DSN");
    if (!/^[a-z_][a-z0-9_]*$/.test(schema))
      throw new Error("Invalid story schema");
    this.schema = schema;
    this.prefix = `"${schema}".`;
    this.pool = new Pool({ connectionString: databaseUrl });
    this.pool.on("error", () =>
      console.error("[stories] PostgreSQL connection error"),
    );
  }
  async initialize() {
    await this.pool.query(`CREATE SCHEMA IF NOT EXISTS "${this.schema}";
      CREATE TABLE IF NOT EXISTS ${this.prefix}accounts (user_id BIGINT PRIMARY KEY, migrated_at TIMESTAMPTZ NOT NULL DEFAULT now());
      CREATE TABLE IF NOT EXISTS ${this.prefix}files (
        user_id BIGINT NOT NULL, path TEXT NOT NULL, parent_path TEXT NOT NULL, name TEXT NOT NULL,
        directory BOOLEAN NOT NULL, content BYTEA, database_file BOOLEAN NOT NULL DEFAULT false,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(user_id,path));
      CREATE INDEX IF NOT EXISTS story_files_parent ON ${this.prefix}files(user_id,parent_path,name);
      CREATE INDEX IF NOT EXISTS story_files_prefix ON ${this.prefix}files(user_id,path text_pattern_ops);
      CREATE TABLE IF NOT EXISTS ${this.prefix}records (
        user_id BIGINT NOT NULL, namespace TEXT NOT NULL, kind TEXT NOT NULL, id TEXT NOT NULL,
        parent_id TEXT, work_id TEXT, ordinal BIGINT NOT NULL DEFAULT 0, sort_key TEXT NOT NULL DEFAULT '',
        data JSONB NOT NULL, PRIMARY KEY(user_id,namespace,kind,id));
      CREATE INDEX IF NOT EXISTS story_records_parent ON ${this.prefix}records(user_id,namespace,kind,parent_id,ordinal,id);
      CREATE INDEX IF NOT EXISTS story_records_work ON ${this.prefix}records(user_id,namespace,kind,work_id,sort_key DESC,id DESC);
      CREATE INDEX IF NOT EXISTS story_records_order ON ${this.prefix}records(user_id,namespace,kind,sort_key DESC,id DESC);
      CREATE INDEX IF NOT EXISTS story_records_prefix ON ${this.prefix}records(user_id,namespace text_pattern_ops);
      CREATE INDEX IF NOT EXISTS story_records_data ON ${this.prefix}records USING GIN(data jsonb_path_ops);
      CREATE TABLE IF NOT EXISTS ${this.prefix}search_documents (
        user_id BIGINT NOT NULL, namespace TEXT NOT NULL, scope TEXT NOT NULL, id TEXT NOT NULL,
        kind TEXT NOT NULL, source TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, metadata JSONB NOT NULL,
        checksum TEXT NOT NULL, tokens TSVECTOR NOT NULL, PRIMARY KEY(user_id,namespace,scope,id));
      CREATE INDEX IF NOT EXISTS story_search_scope ON ${this.prefix}search_documents(user_id,namespace,scope,kind);
      CREATE INDEX IF NOT EXISTS story_search_prefix ON ${this.prefix}search_documents(user_id,namespace text_pattern_ops);
      CREATE INDEX IF NOT EXISTS story_search_tokens ON ${this.prefix}search_documents USING GIN(tokens);`);
  }
  async transaction<T>(action: (client: PoolClient) => Promise<T>) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await action(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  path(value: string) {
    if (
      typeof value !== "string" ||
      value.includes("\0") ||
      value.includes("\\") ||
      posix.isAbsolute(value) ||
      value.split("/").includes("..")
    )
      throw Object.assign(new Error("Invalid story storage path"), {
        code: "EACCES",
      });
    return posix.normalize(value || ".").replace(/^\.\//, "");
  }
  async writeFile(
    client: Queryable,
    user: number,
    path: string,
    content: Buffer,
    exclusive = false,
    databaseFile = false,
  ) {
    const parent = posix.dirname(path),
      parents = new Set<string>(["."]);
    let current = parent;
    while (current !== ".") {
      parents.add(current);
      current = posix.dirname(current);
    }
    const directories = [...parents];
    await client.query(
      `INSERT INTO ${this.prefix}files(user_id,path,parent_path,name,directory)
      SELECT $1,p,parent,name,true FROM unnest($2::text[],$3::text[],$4::text[]) AS d(p,parent,name) ON CONFLICT DO NOTHING`,
      [
        user,
        directories,
        directories.map((p) => (p === "." ? "" : posix.dirname(p))),
        directories.map((p) => posix.basename(p)),
      ],
    );
    if (
      (
        await client.query(
          `SELECT 1 FROM ${this.prefix}files WHERE user_id=$1 AND path=ANY($2::text[]) AND NOT directory LIMIT 1`,
          [user, directories],
        )
      ).rowCount
    )
      throw Object.assign(new Error("Parent path is not a directory"), {
        code: "ENOTDIR",
      });
    const insert = `INSERT INTO ${this.prefix}files(user_id,path,parent_path,name,directory,content,database_file) VALUES($1,$2,$3,$4,false,$5,$6)`;
    try {
      const result = await client.query(
        insert +
          (exclusive
            ? ""
            : " ON CONFLICT(user_id,path) DO UPDATE SET content=EXCLUDED.content,database_file=EXCLUDED.database_file,updated_at=now() WHERE NOT files.directory"),
        [user, path, parent, posix.basename(path), content, databaseFile],
      );
      if (!result.rowCount)
        throw Object.assign(new Error("Path is a directory"), {
          code: "EISDIR",
        });
    } catch (error) {
      if ((error as { code?: string }).code === "23505")
        throw Object.assign(new Error("Story file already exists"), {
          code: "EEXIST",
        });
      throw error;
    }
  }
  async putRecord(
    client: Queryable,
    user: number,
    namespace: string,
    record: RecordInput,
  ) {
    return this.putRecords(client, user, namespace, [record]);
  }
  async putRecords(
    client: Queryable,
    user: number,
    namespace: string,
    records: RecordInput[],
  ) {
    // Collapse repeated updates in a single transaction, matching the last write semantics of InkOS.
    const unique = [
      ...new Map(records.map((r) => [`${r.kind}\0${r.id}`, r])).values(),
    ].map((r) => ({
      ...r,
      parent: r.parent ?? null,
      work: r.work ?? null,
      ordinal: r.ordinal ?? 0,
      sort: r.sort ?? "",
    }));
    if (!unique.length) return;
    await client.query(
      `INSERT INTO ${this.prefix}records(user_id,namespace,kind,id,parent_id,work_id,ordinal,sort_key,data)
      SELECT $1,$2,kind,id,parent,work,ordinal,sort,data FROM jsonb_to_recordset($3::jsonb) AS r(kind text,id text,parent text,work text,ordinal bigint,sort text,data jsonb)
      ON CONFLICT(user_id,namespace,kind,id) DO UPDATE SET parent_id=EXCLUDED.parent_id,work_id=EXCLUDED.work_id,ordinal=EXCLUDED.ordinal,sort_key=EXCLUDED.sort_key,data=EXCLUDED.data`,
      [user, namespace, JSON.stringify(unique)],
    );
  }
  async restoreSnapshot(
    client: Queryable,
    user: number,
    path: string,
    content: Buffer,
  ) {
    if (
      !/\.(?:db|sqlite)$/.test(path) ||
      path.includes("/revisions/") ||
      !content.length
    )
      return;
    let snapshot: any;
    try {
      snapshot = JSON.parse(content.toString());
    } catch {
      return;
    }
    if (
      snapshot?.format !== "dmx-story-records-v1" ||
      !Array.isArray(snapshot.records)
    )
      return;
    await client.query(
      `DELETE FROM ${this.prefix}records WHERE user_id=$1 AND namespace=$2`,
      [user, path],
    );
    await this.putRecords(client, user, path, snapshot.records);
    await client.query(
      `UPDATE ${this.prefix}files SET database_file=true WHERE user_id=$1 AND path=$2`,
      [user, path],
    );
  }
  async replaceSearch(
    client: Queryable,
    user: number,
    namespace: string,
    scope: string,
    documents: any[],
  ) {
    await client.query(
      `DELETE FROM ${this.prefix}search_documents WHERE user_id=$1 AND namespace=$2 AND scope=$3 AND NOT(id=ANY($4::text[]))`,
      [user, namespace, scope, documents.map((doc) => doc.id)],
    );
    const rows = documents.map((doc) => ({
      ...doc,
      metadata: doc.metadata ?? {},
      checksum: createHash("sha256").update(JSON.stringify(doc)).digest("hex"),
    }));
    await client.query(
      `INSERT INTO ${this.prefix}search_documents(user_id,namespace,scope,id,kind,source,title,body,metadata,checksum,tokens)
      SELECT $1,$2,$3,id,kind,source,title,body,metadata,checksum,setweight(to_tsvector('simple',"titleTokens"),'A')||setweight(to_tsvector('simple',"bodyTokens"),'B')
      FROM jsonb_to_recordset($4::jsonb) AS d(id text,kind text,source text,title text,body text,metadata jsonb,checksum text,"titleTokens" text,"bodyTokens" text)
      ON CONFLICT(user_id,namespace,scope,id) DO UPDATE SET kind=EXCLUDED.kind,source=EXCLUDED.source,title=EXCLUDED.title,body=EXCLUDED.body,metadata=EXCLUDED.metadata,checksum=EXCLUDED.checksum,tokens=EXCLUDED.tokens
      WHERE search_documents.checksum<>EXCLUDED.checksum`,
      [user, namespace, scope, JSON.stringify(rows)],
    );
  }
  async operate(user: number, op: string, args: any): Promise<any> {
    if (!Number.isSafeInteger(user) || user <= 0)
      throw new Error("Invalid story owner");
    const path = args.path === undefined ? undefined : this.path(args.path);
    const namespace =
      args.namespace === undefined ? undefined : this.path(args.namespace);
    switch (op) {
      case "files.stat": {
        const row = (
          await this.pool.query(
            `SELECT path,name,directory,octet_length(content) AS size,updated_at FROM ${this.prefix}files WHERE user_id=$1 AND path=$2`,
            [user, path],
          )
        ).rows[0];
        if (!row)
          throw Object.assign(new Error("Story file does not exist"), {
            code: "ENOENT",
          });
        return row;
      }
      case "files.list":
        return (
          await this.pool.query(
            `SELECT path,name,directory,octet_length(content) AS size,updated_at FROM ${this.prefix}files WHERE user_id=$1 AND parent_path=$2 AND path<>$2 ORDER BY name`,
            [user, path],
          )
        ).rows;
      case "files.read": {
        const row = (
          await this.pool.query(
            `SELECT content,directory,database_file FROM ${this.prefix}files WHERE user_id=$1 AND path=$2`,
            [user, path],
          )
        ).rows[0];
        if (!row)
          throw Object.assign(new Error("Story file does not exist"), {
            code: "ENOENT",
          });
        if (row.directory)
          throw Object.assign(new Error("Path is a directory"), {
            code: "EISDIR",
          });
        if (row.database_file)
          return databaseSnapshot(
            await this.operate(user, "records.list", { namespace: path }),
          ).toString("base64");
        return Buffer.from(row.content ?? "").toString("base64");
      }
      case "files.write":
        return this.transaction(async (client) => {
          let content = Buffer.from(args.content ?? "", "base64");
          if (args.append) {
            await client.query(
              "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
              [`${user}:${path}`],
            );
            const existing = await client.query(
              `SELECT content FROM ${this.prefix}files WHERE user_id=$1 AND path=$2 FOR UPDATE`,
              [user, path],
            );
            content = Buffer.concat([
              existing.rows[0]?.content ?? Buffer.alloc(0),
              content,
            ]);
          }
          await this.writeFile(
            client,
            user,
            path!,
            content,
            args.exclusive,
            args.databaseFile,
          );
          await this.restoreSnapshot(client, user, path!, content);
        });
      case "files.mkdir":
        return this.transaction(async (client) => {
          const segments = path === "." ? [] : path!.split("/");
          const dirs = [
            ".",
            ...segments.map((_: string, i: number) =>
              segments.slice(0, i + 1).join("/"),
            ),
          ];
          const existing = (
            await client.query(
              `SELECT directory FROM ${this.prefix}files WHERE user_id=$1 AND path=$2`,
              [user, path],
            )
          ).rows[0];
          if (existing && (!existing.directory || !args.recursive))
            throw Object.assign(new Error("Story path already exists"), {
              code: "EEXIST",
            });
          if (!args.recursive && path !== ".") {
            const parent = (
              await client.query(
                `SELECT directory FROM ${this.prefix}files WHERE user_id=$1 AND path=$2`,
                [user, posix.dirname(path!)],
              )
            ).rows[0];
            if (!parent)
              throw Object.assign(
                new Error("Parent directory does not exist"),
                { code: "ENOENT" },
              );
            if (!parent.directory)
              throw Object.assign(new Error("Parent is not a directory"), {
                code: "ENOTDIR",
              });
          }
          await client.query(
            `INSERT INTO ${this.prefix}files(user_id,path,parent_path,name,directory) SELECT $1,p,parent,name,true FROM unnest($2::text[],$3::text[],$4::text[]) d(p,parent,name) ON CONFLICT DO NOTHING`,
            [
              user,
              dirs,
              dirs.map((p) => (p === "." ? "" : posix.dirname(p))),
              dirs.map((p) => posix.basename(p)),
            ],
          );
          if (
            (
              await client.query(
                `SELECT 1 FROM ${this.prefix}files WHERE user_id=$1 AND path=ANY($2::text[]) AND NOT directory LIMIT 1`,
                [user, dirs],
              )
            ).rowCount
          )
            throw Object.assign(new Error("Path is not a directory"), {
              code: "ENOTDIR",
            });
        });
      case "files.remove":
        return this.transaction(async (client) => {
          const row = (
            await client.query(
              `SELECT directory FROM ${this.prefix}files WHERE user_id=$1 AND path=$2 FOR UPDATE`,
              [user, path],
            )
          ).rows[0];
          if (!row) {
            if (args.force) return;
            throw Object.assign(new Error("Story file does not exist"), {
              code: "ENOENT",
            });
          }
          const prefix = path + "/";
          if (
            row.directory &&
            !args.recursive &&
            (
              await client.query(
                `SELECT 1 FROM ${this.prefix}files WHERE user_id=$1 AND parent_path=$2 LIMIT 1`,
                [user, path],
              )
            ).rowCount
          )
            throw Object.assign(new Error("Directory is not empty"), {
              code: "ENOTEMPTY",
            });
          await client.query(
            `DELETE FROM ${this.prefix}records WHERE user_id=$1 AND (namespace=$2 OR starts_with(namespace,$3))`,
            [user, path, prefix],
          );
          await client.query(
            `DELETE FROM ${this.prefix}search_documents WHERE user_id=$1 AND (namespace=$2 OR starts_with(namespace,$3))`,
            [user, path, prefix],
          );
          await client.query(
            `DELETE FROM ${this.prefix}files WHERE user_id=$1 AND (path=$2 OR starts_with(path,$3))`,
            [user, path, prefix],
          );
        });
      case "files.rename":
        return this.transaction(async (client) => {
          const target = this.path(args.target);
          if (target === path || target.startsWith(path + "/"))
            throw Object.assign(new Error("Invalid rename target"), {
              code: "EINVAL",
            });
          const rows = (
            await client.query(
              `SELECT * FROM ${this.prefix}files WHERE user_id=$1 AND (path=$2 OR starts_with(path,$3)) ORDER BY length(path) FOR UPDATE`,
              [user, path, path + "/"],
            )
          ).rows;
          if (!rows.length)
            throw Object.assign(new Error("Story file does not exist"), {
              code: "ENOENT",
            });
          for (const row of rows) {
            const next = target + row.path.slice(path!.length);
            await client.query(
              `DELETE FROM ${this.prefix}files WHERE user_id=$1 AND path=$2 AND NOT directory`,
              [user, next],
            );
            await client.query(
              `UPDATE ${this.prefix}files SET path=$3,parent_path=$4,name=$5,updated_at=now() WHERE user_id=$1 AND path=$2`,
              [user, row.path, next, posix.dirname(next), posix.basename(next)],
            );
            await client.query(
              `UPDATE ${this.prefix}records SET namespace=$3 WHERE user_id=$1 AND namespace=$2`,
              [user, row.path, next],
            );
            await client.query(
              `UPDATE ${this.prefix}search_documents SET namespace=$3 WHERE user_id=$1 AND namespace=$2`,
              [user, row.path, next],
            );
          }
        });
      case "files.commit":
        return this.transaction(async (client) => {
          for (const write of args.writes ?? []) {
            const path = this.path(write.path),
              content = Buffer.from(write.content, "base64");
            await this.writeFile(client, user, path, content);
            await this.restoreSnapshot(client, user, path, content);
          }
          for (const remove of args.deletes ?? []) {
            const path = this.path(remove);
            await client.query(
              `DELETE FROM ${this.prefix}records WHERE user_id=$1 AND namespace=$2`,
              [user, path],
            );
            await client.query(
              `DELETE FROM ${this.prefix}search_documents WHERE user_id=$1 AND namespace=$2`,
              [user, path],
            );
            await client.query(
              `DELETE FROM ${this.prefix}files WHERE user_id=$1 AND path=$2`,
              [user, path],
            );
          }
        });
      case "records.ensure": {
        if (
          !(
            await this.pool.query(
              `SELECT 1 FROM ${this.prefix}files WHERE user_id=$1 AND path=$2`,
              [user, namespace],
            )
          ).rowCount
        ) {
          try {
            await this.operate(user, "files.write", {
              path: namespace,
              content: "",
              databaseFile: true,
              exclusive: true,
            });
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
          }
        }
        return;
      }
      case "records.create":
        return this.transaction(async (client) => {
          await client.query(
            `INSERT INTO ${this.prefix}records(user_id,namespace,kind,id,work_id,sort_key,data) VALUES($1,$2,$3,$4,$5,$6,$7)`,
            [
              user,
              namespace,
              args.record.kind,
              args.record.id,
              args.record.work ?? null,
              args.record.sort ?? "",
              args.record.data,
            ],
          );
        });
      case "episode.list":
        return (
          await this.pool.query(
            `SELECT e.data FROM ${this.prefix}records e WHERE e.user_id=$1 AND e.namespace=$2 AND e.kind='episode'
        AND ($3::text IS NULL OR e.work_id=$3 OR EXISTS(SELECT 1 FROM ${this.prefix}records v WHERE v.user_id=e.user_id AND v.namespace=e.namespace AND v.kind='episode-event' AND v.parent_id=e.id AND (v.work_id=$3 OR v.data @> $4::jsonb OR v.data @> $5::jsonb OR v.data @> $6::jsonb)))
        AND ($7::jsonb IS NULL OR e.data @> $7) AND ($8::jsonb IS NULL OR e.data @> $8) ORDER BY e.sort_key DESC,e.id DESC LIMIT $9`,
            [
              user,
              namespace,
              args.workId ?? null,
              {
                type: "action-started",
                payload: { parameters: { workId: args.workId } },
              },
              {
                type: "action-started",
                payload: { parameters: { projectId: args.workId } },
              },
              {
                type: "action-started",
                payload: { parameters: { bookId: args.workId } },
              },
              args.profileId ? { profileId: args.profileId } : null,
              args.status ? { status: args.status } : null,
              args.limit,
            ],
          )
        ).rows.map((row) => row.data);
      case "episode.recover":
        return this.transaction(async (client) => {
          const episode = (
            await client.query(
              `SELECT data FROM ${this.prefix}records WHERE user_id=$1 AND namespace=$2 AND kind='episode' AND id=$3 AND data @> '{"status":"running"}' FOR UPDATE`,
              [user, namespace, args.id],
            )
          ).rows[0]?.data;
          if (!episode) return;
          const seq = Number(
            (
              await client.query(
                `SELECT COALESCE(MAX(ordinal),-1)+1 AS seq FROM ${this.prefix}records WHERE user_id=$1 AND namespace=$2 AND kind='episode-event' AND parent_id=$3`,
                [user, namespace, args.id],
              )
            ).rows[0].seq,
          );
          const event = {
            version: HARNESS_VERSION,
            episodeId: args.id,
            workId: episode.workId,
            seq,
            timestamp: args.completedAt,
            type: "episode-failed",
            payload: { reason: args.reason },
          };
          await this.putRecord(client, user, namespace!, {
            kind: "episode-event",
            id: `${args.id}:${seq}`,
            parent: args.id,
            work: episode.workId,
            ordinal: seq,
            sort: args.completedAt,
            data: event,
          });
          await this.putRecord(client, user, namespace!, {
            kind: "episode",
            id: episode.id,
            work: episode.workId,
            sort: episode.startedAt,
            data: {
              ...episode,
              status: "failed",
              completedAt: args.completedAt,
            },
          });
        });
      case "records.get":
        return (
          (
            await this.pool.query(
              `SELECT data FROM ${this.prefix}records WHERE user_id=$1 AND namespace=$2 AND kind=$3 AND id=$4`,
              [user, namespace, args.kind, args.id],
            )
          ).rows[0]?.data ?? null
        );
      case "records.list":
        return (
          await this.pool.query(
            `SELECT kind,id,data,parent_id AS parent,work_id AS work,ordinal,sort_key AS sort FROM ${this.prefix}records WHERE user_id=$1 AND namespace=$2
        AND ($3::text IS NULL OR kind=$3) AND ($4::text IS NULL OR parent_id=$4) AND ($5::jsonb IS NULL OR data @> $5) AND ($6::jsonb IS NULL OR data @> $6 OR data @> $7) AND ($8::text[] IS NULL OR id=ANY($8)) ORDER BY sort_key DESC,ordinal,id`,
            [
              user,
              namespace,
              args.kind ?? null,
              args.parent ?? null,
              args.filter ?? null,
              args.filterAny?.[0] ?? null,
              args.filterAny?.[1] ?? null,
              args.ids ?? null,
            ],
          )
        ).rows;
      case "records.batch":
        return this.transaction(async (client) => {
          if (args.replace)
            await client.query(
              `DELETE FROM ${this.prefix}records WHERE user_id=$1 AND namespace=$2`,
              [user, namespace],
            );
          await this.putRecords(client, user, namespace!, args.records ?? []);
          await client.query(
            `UPDATE ${this.prefix}files SET updated_at=now() WHERE user_id=$1 AND path=$2`,
            [user, namespace],
          );
        });
      case "episode.append":
        return this.transaction(async (client) => {
          const row = (
            await client.query(
              `SELECT data FROM ${this.prefix}records WHERE user_id=$1 AND namespace=$2 AND kind='episode' AND id=$3 FOR UPDATE`,
              [user, namespace, args.event.episodeId],
            )
          ).rows[0];
          if (!row) throw new Error("Unknown creative episode");
          const seq = Number(
            (
              await client.query(
                `SELECT COALESCE(MAX(ordinal),-1)+1 AS seq FROM ${this.prefix}records WHERE user_id=$1 AND namespace=$2 AND kind='episode-event' AND parent_id=$3`,
                [user, namespace, args.event.episodeId],
              )
            ).rows[0].seq,
          );
          const event = { ...args.event, seq };
          await this.putRecord(client, user, namespace!, {
            kind: "episode-event",
            id: `${event.episodeId}:${seq}`,
            parent: event.episodeId,
            work: event.workId,
            ordinal: seq,
            sort: event.timestamp,
            data: event,
          });
          return event;
        });
      case "episode.finish": {
        const result = await this.pool.query(
          `UPDATE ${this.prefix}records SET data=data || $4::jsonb WHERE user_id=$1 AND namespace=$2 AND kind='episode' AND id=$3 AND data @> '{"status":"running"}' RETURNING data`,
          [
            user,
            namespace,
            args.id,
            { status: args.status, completedAt: args.completedAt },
          ],
        );
        if (!result.rowCount)
          throw new Error("Creative episode is missing or already terminal");
        return result.rows[0].data;
      }
      case "episode.bind":
        return this.transaction(async (client) => {
          const row = (
            await client.query(
              `SELECT data FROM ${this.prefix}records WHERE user_id=$1 AND namespace=$2 AND kind='episode' AND id=$3 FOR UPDATE`,
              [user, namespace, args.id],
            )
          ).rows[0];
          if (!row) throw new Error("Unknown creative episode");
          const episode = row.data;
          if (episode.workId && episode.workId !== args.workId)
            throw new Error("Episode is already bound to another work");
          if (episode.workId === args.workId) return episode;
          if (episode.status !== "running")
            throw new Error("Cannot bind terminal creative episode");
          episode.workId = args.workId;
          await this.putRecord(client, user, namespace!, {
            kind: "episode",
            id: episode.id,
            data: episode,
            work: args.workId,
            sort: episode.startedAt,
          });
          const seq = Number(
            (
              await client.query(
                `SELECT COALESCE(MAX(ordinal),-1)+1 AS seq FROM ${this.prefix}records WHERE user_id=$1 AND namespace=$2 AND kind='episode-event' AND parent_id=$3`,
                [user, namespace, args.id],
              )
            ).rows[0].seq,
          );
          const event = {
            version: HARNESS_VERSION,
            episodeId: args.id,
            workId: args.workId,
            seq,
            timestamp: args.timestamp,
            type: "episode-work-bound",
            payload: {},
          };
          await this.putRecord(client, user, namespace!, {
            kind: "episode-event",
            id: `${args.id}:${seq}`,
            parent: args.id,
            work: args.workId,
            ordinal: seq,
            sort: args.timestamp,
            data: event,
          });
          return episode;
        });
      case "search.replace":
        return this.transaction((client) =>
          this.replaceSearch(
            client,
            user,
            namespace!,
            args.scope,
            args.documents,
          ),
        );
      case "search.query": {
        if (!args.tokens.length) return [];
        const query = args.tokens
          .map((_: string, i: number) => `plainto_tsquery('simple',$${i + 6})`)
          .join(" || ");
        return (
          await this.pool.query(
            `SELECT id,scope,kind,source,title,body,metadata,ts_rank_cd(tokens,(${query})) AS score FROM ${this.prefix}search_documents WHERE user_id=$1 AND namespace=$2 AND scope=$3 AND (cardinality($4::text[])=0 OR kind=ANY($4)) AND tokens @@ (${query}) ORDER BY score DESC,id LIMIT $5`,
            [
              user,
              namespace,
              args.scope,
              args.kinds ?? [],
              args.limit,
              ...args.tokens,
            ],
          )
        ).rows;
      }
      default:
        throw new Error("Unsupported story storage operation");
    }
  }
  close() {
    return this.pool.end();
  }
}
