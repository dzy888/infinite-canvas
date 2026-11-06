import * as native from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { resolve, join } from "node:path";
import { enabled, storagePath, storageRequest } from "./client.js";
export * from "node:fs/promises";
const key = (path: any) => (enabled ? storagePath(path) : null);
const encoded = (data: any, options?: any) =>
  Buffer.from(
    data,
    typeof options === "string" ? options : options?.encoding,
  ).toString("base64");
export const readFile = (async (path: any, options?: any) => {
  const pathKey = key(path);
  if (pathKey === null) return native.readFile(path, options);
  const data = Buffer.from(
    await storageRequest("files.read", { path: pathKey }),
    "base64",
  );
  const encoding = typeof options === "string" ? options : options?.encoding;
  return encoding ? data.toString(encoding) : data;
}) as typeof native.readFile;
export const writeFile = (async (path: any, data: any, options?: any) => {
  const pathKey = key(path);
  if (pathKey === null) return native.writeFile(path, data, options);
  await storageRequest("files.write", {
    path: pathKey,
    content: encoded(data, options),
    exclusive: options?.flag === "wx",
  });
}) as typeof native.writeFile;
export const appendFile = (async (path: any, data: any, options?: any) => {
  const pathKey = key(path);
  if (pathKey === null) return native.appendFile(path, data, options);
  await storageRequest("files.write", {
    path: pathKey,
    content: encoded(data, options),
    append: true,
  });
}) as typeof native.appendFile;
export function fileStat(row: any) {
  const date = new Date(row.updated_at);
  return {
    ...row,
    size: Number(row.size ?? 0),
    mtime: date,
    ctime: date,
    birthtime: date,
    atime: date,
    mtimeMs: date.getTime(),
    ctimeMs: date.getTime(),
    isDirectory: () => row.directory,
    isFile: () => !row.directory,
    isSymbolicLink: () => false,
  };
}
export const stat = (async (path: any, options?: any) => {
  const pathKey = key(path);
  return pathKey === null
    ? native.stat(path, options)
    : fileStat(await storageRequest("files.stat", { path: pathKey }));
}) as typeof native.stat;
export const lstat = stat as typeof native.lstat;
export const access = (async (path: any, mode?: number) => {
  const pathKey = key(path);
  if (pathKey === null) return native.access(path, mode);
  await stat(path);
}) as typeof native.access;
export const realpath = (async (path: any, options?: any) => {
  const pathKey = key(path);
  if (pathKey === null) return native.realpath(path, options);
  await stat(path);
  return options?.encoding === "buffer"
    ? Buffer.from(resolve(String(path)))
    : resolve(String(path));
}) as typeof native.realpath;
export const readdir = (async (path: any, options?: any) => {
  const pathKey = key(path);
  if (pathKey === null) return native.readdir(path, options);
  const dir = await stat(path);
  if (!dir.isDirectory())
    throw Object.assign(new Error("Path is not a directory"), {
      code: "ENOTDIR",
    });
  const rows = await storageRequest("files.list", { path: pathKey });
  return rows.map((row: any) =>
    options?.withFileTypes
      ? {
          ...fileStat(row),
          name: row.name,
          parentPath: String(path),
          path: String(path),
        }
      : row.name,
  );
}) as typeof native.readdir;
export const mkdir = (async (path: any, options?: any) => {
  const pathKey = key(path);
  if (pathKey === null) return native.mkdir(path, options);
  await storageRequest("files.mkdir", {
    path: pathKey,
    recursive: options?.recursive ?? false,
  });
  return options?.recursive ? String(path) : undefined;
}) as typeof native.mkdir;
export const rm = (async (path: any, options?: any) => {
  const pathKey = key(path);
  if (pathKey === null) return native.rm(path, options);
  await storageRequest("files.remove", {
    path: pathKey,
    force: options?.force,
    recursive: options?.recursive,
  });
}) as typeof native.rm;
export const unlink = (async (path: any) => rm(path)) as typeof native.unlink;
export const rename = (async (from: any, to: any) => {
  const source = key(from),
    target = key(to);
  if (source === null && target === null) return native.rename(from, to);
  if (source === null || target === null)
    throw Object.assign(
      new Error("Cannot move across story storage boundaries"),
      { code: "EXDEV" },
    );
  await storageRequest("files.rename", { path: source, target });
}) as typeof native.rename;
export const copyFile = (async (from: any, to: any) => {
  if (key(from) === null && key(to) === null) return native.copyFile(from, to);
  await writeFile(to, await readFile(from));
}) as typeof native.copyFile;
export const cp = (async (from: any, to: any, options?: any) => {
  if (key(from) === null && key(to) === null)
    return native.cp(from, to, options);
  if ((await stat(from)).isDirectory()) {
    await mkdir(to, { recursive: true });
    for (const entry of await readdir(from))
      await cp(join(from, String(entry)), join(to, String(entry)), options);
  } else await copyFile(from, to);
}) as typeof native.cp;
export const mkdtemp = (async (prefix: any, options?: any) => {
  if (key(prefix) === null) return native.mkdtemp(prefix, options);
  const directory = String(prefix) + randomBytes(6).toString("hex");
  await mkdir(directory, { recursive: true });
  return directory;
}) as typeof native.mkdtemp;
export const open = (async (path: any, flags: any, mode?: any) => {
  if (key(path) === null) return native.open(path, flags, mode);
  if (String(flags).startsWith("w"))
    await writeFile(path, Buffer.alloc(0), { flag: flags });
  else if (String(flags).startsWith("a")) {
    try {
      await access(path);
    } catch {
      await writeFile(path, Buffer.alloc(0));
    }
  } else await access(path);
  return {
    readFile: (options: any) => readFile(path, options),
    writeFile: (data: any, options: any) => writeFile(path, data, options),
    sync: async () => {},
    close: async () => {},
    stat: () => stat(path),
    write: async (
      data: any,
      offset: number,
      length: number,
      position: number,
    ) => {
      const prior = (await readFile(path)) as Buffer;
      const patch =
        typeof data === "string"
          ? Buffer.from(data)
          : Buffer.from(data).subarray(offset, offset + length);
      const buffer = Buffer.alloc(
        Math.max(prior.length, (position ?? 0) + patch.length),
      );
      prior.copy(buffer);
      patch.copy(buffer, position ?? 0);
      await writeFile(path, buffer);
      return { bytesWritten: patch.length, buffer: data };
    },
    truncate: async (length: number) => {
      const prior = (await readFile(path)) as Buffer;
      const next = Buffer.alloc(length);
      prior.copy(next, 0, 0, length);
      await writeFile(path, next);
    },
  };
}) as typeof native.open;
