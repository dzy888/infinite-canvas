import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { useUserStore } from "@/stores/use-user-store";

let useChatStore: typeof import("./store").useChatStore;
let closeStudioEventConnections: typeof import("../../lib/studio-events").closeStudioEventConnections;

const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;
const originalEventSource = globalThis.EventSource;
const originalNow = Date.now;
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");

beforeEach(async () => {
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: () => null, setItem() {} } });
  ({ useChatStore } = await import("./store"));
  ({ closeStudioEventConnections } = await import("../../lib/studio-events"));
  let time = originalNow();
  // The user message lands in the same millisecond reserved for the assistant stream.
  Date.now = () => ++time;
  globalThis.window = { location: { origin: "http://localhost" } } as Window & typeof globalThis;
  globalThis.EventSource = class {
    readyState = 0;
    addEventListener() {}
    close() {}
  } as unknown as typeof EventSource;
  useUserStore.getState().setSession({
    access_token: "test-only", token_type: "Bearer", access_expires_at: time / 1000 + 3600,
    session: { sid: "test-session" }, user: { id: 1, username: "test", role: 1 },
  });
  useChatStore.setState({ sessions: {}, sessionIdsByBook: {}, activeSessionId: null, selectedModel: "test-model", selectedService: "dmx", input: "" });
});

afterEach(() => {
  closeStudioEventConnections?.();
  if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
  else Reflect.deleteProperty(globalThis, "localStorage");
  Date.now = originalNow;
  globalThis.fetch = originalFetch;
  globalThis.window = originalWindow;
  globalThis.EventSource = originalEventSource;
  useUserStore.getState().clearSession();
});

test("a text response survives when the user message shares the assistant stream timestamp", async () => {
  const id = useChatStore.getState().createDraftSession(null, "script");
  useChatStore.setState(state => ({ sessions: { ...state.sessions, [id]: { ...state.sessions[id]!, isDraft: false } } }));
  const streamTime = Date.now() + 2;
  const requests: Record<string, unknown>[] = [];
  globalThis.fetch = async (input, init) => {
    assert.equal(new URL(String(input), "http://localhost").pathname, "/inkos-api/v1/agent");
    requests.push(JSON.parse(String(init?.body)));
    return Response.json({ response: "剧本已经生成。" });
  };
  await useChatStore.getState().sendMessage(id, "创作一个悬疑短片");
  const session = useChatStore.getState().sessions[id]!;
  assert.equal(session.messages[0]?.timestamp, streamTime, "reproduce the timestamp collision");
  assert.deepEqual(session.messages.map(message => [message.role, message.content]), [
    ["user", "创作一个悬疑短片"], ["assistant", "剧本已经生成。"],
  ]);
  assert.equal(requests.length, 1);
  assert.equal(session.isChatStreaming, false);
  assert.equal(session.lastError, null);
});

for (const status of [200, 503]) {
  test('an error stays visible despite the stream timestamp collision (HTTP ' + status + ')', async () => {
    const id = useChatStore.getState().createDraftSession(null, "storyboard");
    useChatStore.setState(state => ({ sessions: { ...state.sessions, [id]: { ...state.sessions[id]!, isDraft: false } } }));
    const streamTime = Date.now() + 2;
    globalThis.fetch = async () => Response.json({ error: "测试服务暂时不可用" }, { status });
    await useChatStore.getState().sendMessage(id, "拆解开场分镜");
    const session = useChatStore.getState().sessions[id]!;
    assert.equal(session.messages[0]?.timestamp, streamTime);
    assert.deepEqual(session.messages.map(message => [message.role, message.kind, message.content]), [
      ["user", undefined, "拆解开场分镜"], ["assistant", "error", "测试服务暂时不可用"],
    ]);
    assert.equal(session.lastFailedSend?.text, "拆解开场分镜");
    assert.equal(session.isChatStreaming, false);
  });
}
