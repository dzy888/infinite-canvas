import { PostgresStoryStorage } from "./storage/postgres.js";
import { importLegacyStories } from "./storage/migrate.js";
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { ProjectConfigSchema } from "@actalk/inkos-core";
import {
  modelsFromPricing,
  type PricingCatalog,
} from "../../shared/new-api-models.ts";

const serviceDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cookieName = "dmx_story_session";
type User = { id: number; group: string };
type Worker = {
  port: number;
  key: string;
  process: ChildProcess;
  root: string;
};
type Session = { token: string; user: User; sid: string; expires: number };
export type GatewayOptions = {
  newApiUrl: string;
  dataDir: string;
  publicOrigins: string[];
  fetchImpl?: typeof fetch;
  storage?: PostgresStoryStorage;
};

export function encodeModel(model: string, format: "chat" | "responses") {
  return (
    "dmx_" +
    Buffer.from(JSON.stringify({ model, format })).toString("base64url")
  );
}
export function decodeModel(
  value: string,
): { model: string; format: "chat" | "responses" } | null {
  if (!value.startsWith("dmx_")) return null;
  try {
    const data = JSON.parse(
      Buffer.from(value.slice(4), "base64url").toString(),
    );
    return typeof data.model === "string" &&
      ["chat", "responses"].includes(data.format)
      ? data
      : null;
  } catch {
    return null;
  }
}
export function createStoryGateway(options: GatewayOptions) {
  const app = new Hono();
  const request = options.fetchImpl ?? fetch;
  const sessions = new Map<string, Session>();
  const workers = new Map<number, Promise<Worker>>();
  const liveWorkers = new Set<Worker>();
  const relaySessions = new Map<string, Session>();
  let internalOrigin = "";
  const base = options.newApiUrl.replace(/\/$/, "");
  const error = (message: string, status = 400) =>
    new Response(JSON.stringify({ error: { message } }), {
      status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });

  async function identity(token: string): Promise<Session | null> {
    // JWT fields are only hints until New API validates the live session below.
    let claims: { sid?: string; exp?: number };
    try {
      claims = JSON.parse(
        Buffer.from(token.split(".")[1]!, "base64url").toString(),
      );
    } catch {
      return null;
    }
    if (!claims.sid || !claims.exp || claims.exp * 1000 <= Date.now())
      return null;
    const res = await request(base + "/api/user/self", {
      headers: { Authorization: "Bearer " + token },
    });
    const json = (await res.json()) as { success?: boolean; data?: User };
    if (
      !res.ok ||
      json.success !== true ||
      !Number.isSafeInteger(json.data?.id) ||
      json.data!.id <= 0
    )
      return null;
    return {
      token,
      user: json.data!,
      sid: claims.sid,
      expires: claims.exp * 1000,
    };
  }
  async function catalog(session: Session) {
    const res = await request(base + "/api/pricing", {
      headers: { Authorization: "Bearer " + session.token },
    });
    if (!res.ok) throw new Error("无法加载模型列表，请稍后重试。");
    const json = (await res.json()) as PricingCatalog;
    if (!Array.isArray(json.data)) throw new Error("模型列表格式错误。");
    return modelsFromPricing(json, session.user.group);
  }
  async function readAccountConfig(user: number, root: string) {
    const bytes = options.storage
      ? Buffer.from(
          await options.storage.operate(user, "files.read", {
            path: "inkos.json",
          }),
          "base64",
        )
      : await readFile(join(root, "inkos.json"));
    return JSON.parse(bytes.toString("utf8"));
  }
  async function startWorker(session: Session): Promise<Worker> {
    const root = resolve(options.dataDir, String(session.user.id));
    const codeRelative = relative(serviceDir, root);
    if (!codeRelative.startsWith("..") && !isAbsolute(codeRelative))
      throw new Error(
        "STORY_DATA_DIR must be outside story-service source directory",
      );
    await mkdir(join(root, ".inkos"), { recursive: true });
    if (options.storage)
      await importLegacyStories(options.storage, session.user.id, root);
    const configPath = join(root, "inkos.json");
    try {
      if (options.storage)
        await options.storage.operate(session.user.id, "files.read", {
          path: "inkos.json",
        });
      else await readFile(configPath);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      const models = await catalog(session);
      const first = models.find(
        (m) => m.capabilities.includes("text") && m.api_format === "openai",
      );
      const config = ProjectConfigSchema.parse({
        name: "故事创作",
        version: "0.1.0",
        language: "zh",
        llm: {
          provider: "custom",
          service: "custom",
          configSource: "studio",
          baseUrl: "http://127.0.0.1",
          model: first
            ? encodeModel(first.name, first.text_endpoint)
            : "unconfigured",
        },
      });
      if (options.storage)
        await options.storage.operate(session.user.id, "files.write", {
          path: "inkos.json",
          content: Buffer.from(JSON.stringify(config)).toString("base64"),
          exclusive: true,
        });
      else
        await writeFile(configPath, JSON.stringify(config, null, 2), {
          flag: "wx",
        });
    }
    const key = randomBytes(32).toString("hex");
    relaySessions.set(key, session);
    const permissions = [
      "--permission",
      "--allow-worker",
      ...[root, serviceDir].map((path) => "--allow-fs-read=" + path),
      "--allow-fs-write=" + root,
    ];
    const child = spawn(
      process.execPath,
      [...permissions, join(serviceDir, "dist/worker.mjs")],
      {
        cwd: serviceDir,
        stdio: ["ignore", "pipe", "pipe", "ipc"],
        env: {
          PATH: process.env.PATH,
          SystemRoot: process.env.SystemRoot,
          TEMP: root,
          TMP: root,
          TSX_DISABLE_CACHE: "1",
          DMX_BUILTIN_SKILLS: join(serviceDir, "vendor/core/skills"),
          DMX_STORY_ROOT: root,
          DMX_STORY_STORAGE: options.storage ? "postgres" : "filesystem",
          DMX_STORY_STORAGE_URL: internalOrigin + "/internal/storage",
          DMX_STORY_KEY: key,
          DMX_STORY_RELAY: internalOrigin + "/internal/relay",
        },
      },
    );
    // Do not echo model responses or credentials into the parent process logs.
    child.stderr?.on("data", (chunk) => {
      const text = String(chunk);
      if (/Error|ERR_|Cannot find/.test(text))
        process.stderr.write("[story worker] " + text);
    });
    child.stdout?.resume();
    return await new Promise<Worker>((accept, reject) => {
      child.once("error", reject);
      child.once("message", (message: { port?: number }) => {
        if (!message.port) return;
        const worker = { port: message.port, key, process: child, root };
        liveWorkers.add(worker);
        accept(worker);
      });
      child.once("exit", () => {
        relaySessions.delete(key);
        workers.delete(session.user.id);
        for (const worker of liveWorkers)
          if (worker.process === child) liveWorkers.delete(worker);
        reject(new Error("创作服务未能启动，请检查服务日志。"));
      });
    });
  }
  async function workerFor(session: Session) {
    let pending = workers.get(session.user.id);
    if (!pending) {
      pending = startWorker(session);
      workers.set(session.user.id, pending);
      pending.catch(() => workers.delete(session.user.id));
    }
    const worker = await pending;
    relaySessions.set(worker.key, session);
    return worker;
  }

  app.onError((err, c) => {
    console.error("[stories]", err.message);
    return c.json({ error: { message: "创作服务暂时不可用，请重试。" } }, 503);
  });
  app.post("/internal/storage", async (c) => {
    const key = c.req.header("X-Dmx-Worker") ?? "";
    const session = relaySessions.get(key);
    if (!session || !options.storage)
      return c.json(
        { error: { message: "Unauthorized", code: "EACCES" } },
        401,
      );
    try {
      const { op, args } = await c.req.json();
      const data = await options.storage.operate(session.user.id, op, args);
      return c.json({ data: data ?? null });
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      const known = [
        "ENOENT",
        "EEXIST",
        "EISDIR",
        "ENOTDIR",
        "ENOTEMPTY",
        "EINVAL",
        "EACCES",
      ];
      return c.json(
        {
          error: {
            message: known.includes(code ?? "")
              ? (err as Error).message
              : "Story database operation failed",
            code: code ?? "EIO",
          },
        },
        known.includes(code ?? "") ? 400 : 500,
      );
    }
  });
  app.all("/internal/relay/*", async (c) => {
    const key = c.req.header("Authorization")?.replace(/^Bearer /, "") ?? "";
    const session = relaySessions.get(key);
    if (!session || session.expires <= Date.now())
      return error("登录已过期，请刷新页面后继续。", 401);
    const suffix = c.req.path.slice("/internal/relay".length);
    if (
      ![
        "/v1/chat/completions",
        "/v1/responses",
        "/v1/images/generations",
        "/v1/images/edits",
      ].includes(suffix) ||
      c.req.method !== "POST"
    )
      return error("Unsupported model operation", 404);
    const models = await catalog(session);
    const headers = new Headers({ Authorization: "Bearer " + session.token });
    let body: BodyInit;
    let rawModel: string;
    let form: FormData | undefined;
    let payload: Record<string, unknown> | undefined;
    if ((c.req.header("Content-Type") ?? "").startsWith("multipart/")) {
      form = await c.req.formData();
      rawModel = String(form.get("model") ?? "");
    } else {
      payload = await c.req.json<Record<string, unknown>>();
      rawModel = String(payload.model ?? "");
    }
    const decoded = decodeModel(rawModel);
    const image = rawModel === "dmx-image";
    const worker = workers.get(session.user.id)
      ? await workers.get(session.user.id)!
      : null;
    let imageModel: string | undefined;
    if (image && worker) {
      const config = await readAccountConfig(session.user.id, worker.root);
      imageModel = config.llm.cover?.model;
    }
    const model = image
      ? models.find(
          (m) =>
            m.name === imageModel &&
            m.capabilities.includes("image") &&
            m.api_format === "openai",
        )
      : models.find(
          (m) =>
            m.name === (decoded?.model ?? rawModel) &&
            m.capabilities.includes("text") &&
            m.api_format === "openai",
        );
    if (!model)
      return error(
        image
          ? "请先在创作设置中选择图片模型。"
          : "请选择当前账号可用的文本模型。",
        403,
      );
    if (form) {
      form.set("model", model.name);
      body = form;
    } else {
      payload!.model = model.name;
      body = JSON.stringify(payload);
      headers.set("Content-Type", "application/json");
    }
    const upstream = await request(base + "/api/canvas/relay" + suffix, {
      method: "POST",
      headers,
      body,
      signal: c.req.raw.signal,
    });
    const responseHeaders = new Headers(upstream.headers);
    responseHeaders.delete("set-cookie");
    responseHeaders.set("Cache-Control", "no-store");
    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  });

  app.use("/inkos-api/*", async (c, next) => {
    c.header("Cache-Control", "private, no-store");
    const origin = c.req.header("Origin");
    const allowed =
      options.publicOrigins.includes(origin ?? "") ||
      origin === new URL(c.req.url).origin;
    if ((origin && !allowed) || c.req.header("Sec-Fetch-Site") === "cross-site")
      return error("请求来源不允许。", 403);
    const bearer = c.req.header("Authorization")?.replace(/^Bearer /, "");
    const cookie = getCookie(c, cookieName);
    const saved = cookie ? sessions.get(cookie) : undefined;
    const session = await identity(bearer ?? saved?.token ?? "");
    if (!session) {
      if (cookie) sessions.delete(cookie);
      return error("请先登录 DmxVideo。", 401);
    }
    // An old image/download request must never attach to a different account.
    const owner = c.req.header("X-Dmx-Owner") ?? c.req.query("_owner");
    if (!bearer && !owner) return error("账号信息缺失，请重新打开作品。", 401);
    if (owner && owner !== String(session.user.id))
      return error("账号已切换，请重新打开作品。", 409);
    c.set("storySession" as never, session as never);
    await next();
  });
  app.post("/inkos-api/session", async (c) => {
    const session = c.get("storySession" as never) as Session;
    const previous = getCookie(c, cookieName);
    if (previous) sessions.delete(previous);
    for (const [id, item] of sessions)
      if (item.expires <= Date.now()) sessions.delete(id);
    const id = randomBytes(32).toString("hex");
    sessions.set(id, session);
    setCookie(c, cookieName, id, {
      httpOnly: true,
      sameSite: "Strict",
      secure:
        c.req.header("X-Forwarded-Proto") === "https" ||
        new URL(c.req.url).protocol === "https:",
      path: "/inkos-api",
    });
    const worker = await workerFor(session);
    return c.json({
      ok: true,
      owner: session.user.id,
      available: Boolean(worker.port),
    });
  });
  app.delete("/inkos-api/session", (c) => {
    const id = getCookie(c, cookieName);
    if (id) sessions.delete(id);
    deleteCookie(c, cookieName, { path: "/inkos-api" });
    return c.json({ ok: true });
  });

  app.all("/inkos-api/v1/*", async (c) => {
    const session = c.get("storySession" as never) as Session;
    const path = c.req.path.slice("/inkos-api/v1".length);
    const worker = await workerFor(session);
    const configPath = join(worker.root, "inkos.json");
    const config = await readAccountConfig(session.user.id, worker.root);
    const modelData = async () =>
      (await catalog(session)).filter((m) => m.api_format === "openai");
    if (c.req.method === "GET" && path.startsWith("/services")) {
      const models = (await modelData())
        .filter((m) => m.capabilities.includes("text"))
        .map((m) => ({
          id: encodeModel(m.name, m.text_endpoint),
          name: m.name,
        }));
      if (path === "/services")
        return c.json({
          services: [
            {
              service: "custom",
              label: "创作模型",
              connected: models.length > 0,
              apiKeyOptional: true,
            },
          ],
        });
      if (path === "/services/config")
        return c.json({
          service: "custom",
          defaultModel: config.llm.defaultModel ?? config.llm.model,
          services: [
            {
              service: "custom",
              name: "创作模型",
              models: models.map((m) => m.id),
            },
          ],
          configSource: "studio",
          storedConfigSource: "studio",
          envConfig: { detected: false },
        });
      if (["/services/models", "/services/models/custom"].includes(path))
        return c.json({
          groups: [{ service: "custom", label: "创作模型", models }],
        });
      if (path === "/services/custom/models") return c.json({ models });
      return error("服务商由管理员管理。", 403);
    }
    if (path === "/managed-models") {
      if (c.req.method === "GET")
        return c.json({
          textModel: config.llm.defaultModel ?? config.llm.model,
          imageModel: config.llm.cover?.model ?? "",
          models: await modelData(),
        });
      if (c.req.method === "PUT") {
        const body = await c.req.json<{
          textModel: string;
          imageModel?: string;
        }>();
        const models = await modelData();
        const decoded = decodeModel(body.textModel);
        if (
          !models.some(
            (m) => m.name === decoded?.model && m.capabilities.includes("text"),
          )
        )
          return error("请选择可用的文本模型。");
        if (
          body.imageModel &&
          !models.some(
            (m) =>
              m.name === body.imageModel && m.capabilities.includes("image"),
          )
        )
          return error("请选择可用的图片模型。");
        config.llm.model = body.textModel;
        config.llm.defaultModel = body.textModel;
        config.llm.service = "custom";
        config.llm.cover = body.imageModel
          ? { service: "openai", model: body.imageModel }
          : undefined;
        if (options.storage)
          await options.storage.operate(session.user.id, "files.write", {
            path: "inkos.json",
            content: Buffer.from(JSON.stringify(config)).toString("base64"),
          });
        else await writeFile(configPath, JSON.stringify(config, null, 2));
        return c.json({ ok: true });
      }
    }
    // Provider credentials, host environment, outbound webhooks and unattended scheduling belong to administrators.
    if (
      path.startsWith("/services") ||
      path.startsWith("/cover") ||
      /^(\/project\/(research-search|notify|detection|model-overrides)|\/daemon\/(start|stop))/.test(
        path,
      )
    )
      return error("此设置由管理员统一管理。", 403);
    if (path === "/project/default-model" && c.req.method === "PUT") {
      const body = await c.req.raw.clone().json();
      const decoded = decodeModel(body.defaultModel ?? "");
      if (
        !decoded ||
        !(await modelData()).some(
          (m) => m.name === decoded.model && m.capabilities.includes("text"),
        )
      )
        return error("请选择可用的文本模型。");
    }
    // Credentials are sent only to New API; each isolated worker receives an opaque internal relay key.
    const url = new URL(c.req.url);
    url.host = "127.0.0.1:" + worker.port;
    url.protocol = "http:";
    const headers = new Headers(c.req.raw.headers);
    headers.delete("Authorization");
    headers.delete("Cookie");
    headers.delete("Origin");
    headers.delete("Host");
    headers.set("X-Dmx-Worker", worker.key);
    const response = await fetch(url, {
      method: c.req.method,
      headers,
      body: ["GET", "HEAD"].includes(c.req.method) ? undefined : c.req.raw.body,
      duplex: "half",
      signal: c.req.raw.signal,
    } as RequestInit);
    const responseHeaders = new Headers(response.headers);
    responseHeaders.delete("set-cookie");
    responseHeaders.delete("access-control-allow-origin");
    responseHeaders.set("Cache-Control", "private, no-store");
    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  });
  return {
    app,
    setInternalOrigin(origin: string) {
      internalOrigin = origin;
    },
    async close() {
      const exits = [...liveWorkers].map(
        (worker) =>
          new Promise<void>((done) => {
            if (
              worker.process.exitCode !== null ||
              worker.process.signalCode !== null
            )
              return done();
            worker.process.once("exit", () => done());
            worker.process.kill();
          }),
      );
      await Promise.all(exits);
      liveWorkers.clear();
      sessions.clear();
      relaySessions.clear();
    },
  };
}
