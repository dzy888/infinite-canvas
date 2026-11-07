import { decodeClientSession } from "../../vendor/core/src/interaction/client-session.js";
import { memfs } from "memfs";
import { posix } from "node:path";
import {
  isClientSessionPath,
  clientSessionRoots,
} from "./client-session-path.js";
import { parseTranscriptEvents } from "../../vendor/core/src/interaction/session-transcript.js";
import { deriveBookSessionFromEvents } from "../../vendor/core/src/interaction/session-transcript-restore.js";

const { fs } = memfs();
fs.mkdirSync("/.inkos", { recursive: true });
export const clientSessionsEnabled =
  process.env.DMX_STORY_CLIENT_SESSIONS === "1";
let notify: ((id: string, transcript: string) => void) | undefined;
export function onLocalTranscript(callback: typeof notify) {
  notify = callback;
}
const filename = (path: string) => {
  if (
    !isClientSessionPath(path) ||
    path.includes("\\") ||
    path.split("/").includes("..") ||
    path.includes("\0")
  )
    throw new Error("Invalid local session path");
  return "/" + path;
};
const row = (path: string) => {
  const stat = fs.statSync(filename(path));
  return {
    path,
    name: posix.basename(path),
    directory: stat.isDirectory(),
    size: Number(stat.size),
    updated_at: stat.mtime.toISOString(),
  };
};
export function handlesMemoryOperation(op: string, args: any) {
  if (!clientSessionsEnabled) return false;
  const paths =
    op === "files.commit"
      ? [
          ...(args.writes ?? []).map((w: any) => w.path),
          ...(args.deletes ?? []),
        ]
      : [args.path, args.target].filter((p) => p !== undefined);
  if (!paths.some(isClientSessionPath)) return false;
  if (!paths.every(isClientSessionPath))
    throw Object.assign(
      new Error("Cannot mix local chat storage and saved works"),
      { code: "EXDEV" },
    );
  return true;
}
export function memoryOperation(op: string, args: any): any {
  const path = args.path === undefined ? undefined : filename(args.path);
  switch (op) {
    case "files.stat":
      return row(args.path);
    case "files.list":
      return (fs.readdirSync(path!) as string[])
        .sort()
        .map((name) => row(args.path + "/" + name));
    case "files.read":
      return (fs.readFileSync(path!) as Buffer).toString("base64");
    case "files.mkdir":
      return void fs.mkdirSync(path!, { recursive: args.recursive });
    case "files.remove":
      return void fs.rmSync(path!, {
        recursive: args.recursive,
        force: args.force,
      });
    case "files.rename":
      return fs.renameSync(path!, filename(args.target));
    case "files.write": {
      fs.mkdirSync(posix.dirname(path!), { recursive: true });
      const data = Buffer.from(args.content ?? "", "base64");
      if (args.append) fs.appendFileSync(path!, data);
      else fs.writeFileSync(path!, data, { flag: args.exclusive ? "wx" : "w" });
      const match = args.path.match(/^\.inkos\/sessions\/([^/]+)\.jsonl$/);
      if (match && args.append) notify?.(match[1], data.toString("utf8"));
      return;
    }
    case "files.commit": {
      const paths = [
        ...new Set<string>([
          ...(args.writes ?? []).map((w: any) => w.path),
          ...(args.deletes ?? []),
        ]),
      ];
      const backup = paths.map((key) => ({
        key,
        content: fs.existsSync(filename(key))
          ? fs.readFileSync(filename(key))
          : null,
      }));
      try {
        for (const write of args.writes ?? [])
          memoryOperation("files.write", write);
        for (const key of args.deletes ?? [])
          fs.rmSync(filename(key), { force: true });
      } catch (error) {
        for (const entry of backup)
          if (entry.content === null)
            fs.rmSync(filename(entry.key), { force: true });
          else fs.writeFileSync(filename(entry.key), entry.content);
        throw error;
      }
      return;
    }
    default:
      throw new Error("Unsupported local session storage operation");
  }
}
export function localSessionSnapshot(id: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error("Invalid session ID");
  const path = filename(`.inkos/sessions/${id}.jsonl`);
  if (!fs.existsSync(path)) return null;
  const transcript = fs.readFileSync(path, "utf8") as string;
  const uploads: Record<string, string> = {};
  const uploadRoot = `/.inkos/uploads/${id}`;
  const visit = (directory: string) => {
    if (!fs.existsSync(directory)) return;
    for (const name of fs.readdirSync(directory) as string[]) {
      const file = directory + "/" + name;
      if (fs.statSync(file).isDirectory()) visit(file);
      else
        uploads[file.slice(uploadRoot.length + 1)] = (
          fs.readFileSync(file) as Buffer
        ).toString("base64");
    }
  };
  visit(uploadRoot);
  return {
    version: 1,
    sessionId: id,
    transcript,
    uploads,
    session: deriveBookSessionFromEvents(
      id,
      parseTranscriptEvents(transcript, path),
    ),
  };
}
export function hydrateLocalSession(id: string, value: any) {
  if (
    !value ||
    value.version !== 1 ||
    value.sessionId !== id ||
    typeof value.transcript !== "string"
  )
    throw new Error("Invalid local session snapshot");
  const validated = decodeClientSession(value);
  const events = parseTranscriptEvents(validated.transcript, id);
  if (
    events.some(
      (event, index) =>
        event.sessionId !== id ||
        (index > 0 && event.seq <= events[index - 1].seq),
    )
  )
    throw new Error("Conflicting transcript events");
  const current = localSessionSnapshot(id);
  const normalized =
    events.map((event) => JSON.stringify(event)).join("\n") +
    (events.length ? "\n" : "");
  const existing = current
    ? parseTranscriptEvents(current.transcript, id)
        .map((event) => JSON.stringify(event))
        .join("\n") + "\n"
    : "";
  if (existing.startsWith(normalized)) return;
  if (existing && !normalized.startsWith(existing))
    throw Object.assign(
      new Error(
        "Chat history changed in another page; local history was preserved",
      ),
      { code: "LOCAL_SESSION_CONFLICT" },
    );
  for (const [name, content] of Object.entries(validated.uploads ?? {}))
    memoryOperation("files.write", {
      path: `.inkos/uploads/${id}/${name}`,
      content,
    });
  memoryOperation("files.write", {
    path: `.inkos/sessions/${id}.jsonl`,
    content: Buffer.from(normalized).toString("base64"),
  });
}
export function localSessionBusy(id: string) {
  for (const dir of ["chat-requests", "tasks"]) {
    const path = `/.inkos/${dir}/${encodeURIComponent(id)}.json`;
    if (!fs.existsSync(path)) continue;
    const data = JSON.parse(fs.readFileSync(path, "utf8") as string);
    if (
      data.status === "running" ||
      ["running", "processing"].includes(data.execution?.status)
    )
      return true;
  }
  return false;
}
export function releaseLocalSession(id: string) {
  for (const root of clientSessionRoots) {
    const suffix = root.endsWith("sessions")
      ? `${id}.jsonl`
      : root.endsWith("uploads")
        ? id
        : `${encodeURIComponent(id)}.json`;
    fs.rmSync("/" + root + "/" + suffix, { force: true, recursive: true });
  }
}
