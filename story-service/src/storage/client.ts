import {
  Worker,
  MessageChannel,
  receiveMessageOnPort,
  type MessagePort,
} from "node:worker_threads";
import { relative, resolve, isAbsolute, sep } from "node:path";

export const enabled = process.env.DMX_STORY_STORAGE === "postgres";
export function storagePath(path: string | Buffer | URL) {
  const absolute =
    path instanceof URL
      ? decodeURIComponent(path.pathname).replace(/^\/([A-Za-z]:)/, "$1")
      : String(path);
  const key = relative(process.env.DMX_STORY_ROOT!, resolve(absolute));
  return key.startsWith(".." + sep) || key === ".." || isAbsolute(key)
    ? null
    : key.split(sep).join("/") || ".";
}
export async function storageRequest<T = any>(
  op: string,
  args: Record<string, any>,
): Promise<T> {
  const response = await fetch(process.env.DMX_STORY_STORAGE_URL!, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Dmx-Worker": process.env.DMX_STORY_KEY!,
    },
    body: JSON.stringify({ op, args }),
  });
  const result = (await response.json()) as {
    data: T;
    error?: { message: string; code?: string };
  };
  if (!response.ok || result.error)
    throw Object.assign(
      new Error(result.error?.message ?? "Story database is unavailable"),
      { code: result.error?.code },
    );
  return result.data;
}
let transport: { worker: Worker; port: MessagePort } | undefined;
export function storageSync<T = any>(op: string, args: Record<string, any>): T {
  if (!transport) {
    const { port1, port2 } = new MessageChannel();
    const worker = new Worker(
      new URL(
        import.meta.url.endsWith(".ts")
          ? "../../dist/storage-sync.mjs"
          : "./storage-sync.mjs",
        import.meta.url,
      ),
      {
        workerData: {
          port: port2,
          url: process.env.DMX_STORY_STORAGE_URL,
          key: process.env.DMX_STORY_KEY,
        },
        transferList: [port2],
      },
    );
    transport = { worker, port: port1 };
    worker.unref();
    port1.unref();
  }
  const signal = new Int32Array(new SharedArrayBuffer(4));
  transport.port.postMessage({
    request: JSON.stringify({ op, args }),
    signal: signal.buffer,
  });
  Atomics.wait(signal, 0, 0);
  const result = receiveMessageOnPort(transport.port)?.message;
  if (!result)
    throw new Error(
      "Story storage bridge stopped before completing the operation",
    );
  if (result.error)
    throw Object.assign(new Error(result.error.message), {
      code: result.error.code,
    });
  return result.data as T;
}
export function databasePath(path: string) {
  const key = storagePath(path);
  if (key === null) throw new Error("Database path is outside this account");
  return key;
}
