import * as native from "node:fs";
import { enabled, storagePath, storageSync } from "./client.js";
import { fileStat } from "./fs-promises.js";
export * from "node:fs";
export const existsSync: typeof native.existsSync = (path) => {
  if (!enabled || storagePath(path) === null) return native.existsSync(path);
  try {
    storageSync("files.stat", { path: storagePath(path) });
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
};
export const mkdirSync = ((path: any, options?: any) => {
  if (!enabled || storagePath(path) === null)
    return native.mkdirSync(path, options);
  storageSync("files.mkdir", {
    path: storagePath(path),
    recursive: options?.recursive,
  });
}) as typeof native.mkdirSync;
export const readFileSync = ((path: any, options?: any) => {
  if (!enabled || storagePath(path) === null)
    return native.readFileSync(path, options);
  const buffer = Buffer.from(
    storageSync("files.read", { path: storagePath(path) }),
    "base64",
  );
  const encoding = typeof options === "string" ? options : options?.encoding;
  return encoding ? buffer.toString(encoding) : buffer;
}) as typeof native.readFileSync;
export const readdirSync = ((path: any, options?: any) => {
  if (!enabled || storagePath(path) === null)
    return native.readdirSync(path, options);
  return storageSync<any[]>("files.list", { path: storagePath(path) }).map(
    (row) =>
      options?.withFileTypes ? { ...fileStat(row), name: row.name } : row.name,
  );
}) as typeof native.readdirSync;
export const lstatSync = ((path: any, options?: any) => {
  if (!enabled || storagePath(path) === null)
    return native.lstatSync(path, options);
  return fileStat(storageSync("files.stat", { path: storagePath(path) }));
}) as typeof native.lstatSync;
