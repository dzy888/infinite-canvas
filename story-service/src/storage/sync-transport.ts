import { workerData } from "node:worker_threads";
const { port, url, key } = workerData;
port.on(
  "message",
  async ({
    request,
    signal: shared,
  }: {
    request: string;
    signal: SharedArrayBuffer;
  }) => {
    const signal = new Int32Array(shared);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Dmx-Worker": key },
        body: request,
      });
      const result = await response.json();
      port.postMessage(result);
    } catch {
      port.postMessage({
        error: { message: "Story database is unavailable", code: "EIO" },
      });
    } finally {
      Atomics.store(signal, 0, 1);
      Atomics.notify(signal, 0);
    }
  },
);
