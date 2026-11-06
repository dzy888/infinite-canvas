import {
  commitAtomicFileSet as fileCommit,
  recoverAtomicFileSets as fileRecover,
} from "../../vendor/core/src/utils/atomic-file-set.js";
import { resolve } from "node:path";
import { enabled, databasePath, storageRequest } from "./client.js";
export type {
  AtomicFileWrite,
  AtomicFileSet,
} from "../../vendor/core/src/utils/atomic-file-set.js";
import type { AtomicFileSet } from "../../vendor/core/src/utils/atomic-file-set.js";
export async function recoverAtomicFileSets(root: string, recursive = false) {
  return enabled ? 0 : fileRecover(root, recursive);
}
export async function commitAtomicFileSet(input: AtomicFileSet) {
  if (!enabled) return fileCommit(input);
  const path = (value: string) => {
    const key = databasePath(resolve(input.rootDir, value));
    if (!key || key === ".") throw new Error("Invalid atomic story path");
    return key;
  };
  await storageRequest("files.commit", {
    writes: input.writes.map((write) => ({
      path: path(write.relativePath),
      content: Buffer.from(write.content).toString("base64"),
    })),
    deletes: input.deletes?.map(path),
  });
}
