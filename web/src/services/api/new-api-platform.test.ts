import { beforeEach, afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { useUserStore } from "@/stores/use-user-store";
import { clearAuthentication } from "./new-api-auth";
import type { AuthBundle } from "@/types/auth";

const pricingReply = (name: string) =>
    new Response(JSON.stringify({ success: true, data: [{ model_name: name, enable_groups: ["default"], supported_endpoint_types: ["image-generation"] }], group_ratio: { default: 1 }, usable_group: { default: "Standard" }, auto_groups: [] }));
const originalFetch = globalThis.fetch;
const originalStorage = globalThis.localStorage;
const session = (id = 1): AuthBundle => ({ access_token: `session-secret-${id}`, token_type: "Bearer", access_expires_at: Math.floor(Date.now() / 1000) + 900, session: { sid: `sid-${id}` }, user: { id, username: `user-${id}`, role: 1 } });
const reply = (data: unknown, status = 200) => new Response(JSON.stringify({ success: status === 200, data }), { status, headers: { "Content-Type": "application/json" } });
beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: {
            getItem: () => null,
            setItem: () => {
                throw new Error("Unexpected persistence");
            },
        },
    });
    clearAuthentication();
    useUserStore.getState().setSession(session());
});
afterEach(() => {
    globalThis.fetch = originalFetch;
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: originalStorage });
    clearAuthentication();
});

test("catalog and account requests use the live session only on same-origin management paths", async () => {
    const { platformRequest, modelRequestHeaders } = await import("./new-api-platform");
    const requests: { url: string; auth: string }[] = [];
    globalThis.fetch = (async (url, init) => {
        requests.push({ url: String(url), auth: new Headers(init?.headers).get("Authorization") || "" });
        return reply([]);
    }) as typeof fetch;
    await platformRequest("/pricing");
    assert.deepEqual(requests, [{ url: "/api/pricing", auth: "Bearer session-secret-1" }]);
    assert.equal(modelRequestHeaders({ platformManaged: true, apiKey: "old-local-secret" }).Authorization, "Bearer session-secret-1");
    clearAuthentication();
    await assert.rejects(platformRequest("/pricing"));
    assert.equal(requests.length, 1);
});

test("catalog responses cannot cross account switches and refresh failures block stale models", async () => {
    const { usePlatformStore } = await import("@/stores/use-platform-store");
    const store = usePlatformStore.getState();
    store.reset();
    let release: ((response: Response) => void) | undefined;
    globalThis.fetch = ((url: string) =>
        url.endsWith("/pricing")
            ? new Promise<Response>((resolve) => {
                  release = resolve;
              })
            : Promise.resolve(reply({ quota: 10, used_quota: 0, request_count: 1 }))) as typeof fetch;
    const first = store.load(1);
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    store.reset();
    useUserStore.getState().setSession(session(2));
    globalThis.fetch = (async (url: string) => (url.endsWith("/pricing") ? pricingReply("second-model") : reply({ group: "default", quota: 20, used_quota: 0, request_count: 2 }))) as typeof fetch;
    await store.load(2);
    release?.(pricingReply("first-private-model"));
    await first;
    assert.equal(usePlatformStore.getState().owner, 2);
    assert.deepEqual(
        usePlatformStore.getState().models.map((model) => model.name),
        ["second-model"],
    );
    globalThis.fetch = (async () => reply(null, 503)) as typeof fetch;
    await store.load(2);
    assert.deepEqual(usePlatformStore.getState().models, []);
    assert.equal(usePlatformStore.getState().error, "platform.loadFailed");
    store.reset();
});

test("managed model choices survive persisted settings and removed models cannot fall back", async () => {
    const { defaultConfig, encodeChannelModel, normalizeModelOptionValue, resolveModelRequestConfig } = await import("@/stores/use-config-store");
    const selected = encodeChannelModel("platform", "chosen-image");
    assert.equal(normalizeModelOptionValue(selected, defaultConfig.channels), selected);
    const config = { ...defaultConfig, platformManaged: true, channels: [{ id: "platform", name: "DmxVideo", baseUrl: "/api/canvas/relay", apiKey: "", apiFormat: "openai" as const, models: [{ name: "chosen-image", capability: "image" as const }] }] };
    assert.equal(resolveModelRequestConfig(config, selected).model, "chosen-image");
    assert.throws(() => resolveModelRequestConfig(config, encodeChannelModel("platform", "removed-image")));
});

test("existing pricing data selects authorized groups and effective multipliers", async () => {
    const { modelsFromPricing } = await import("./new-api-platform");
    const offers = modelsFromPricing(
        {
            data: [
                { model_name: "image", enable_groups: ["vip", "default"], supported_endpoint_types: ["image-generation"] },
                { model_name: "video", enable_groups: ["vip"], supported_endpoint_types: ["openai-video"] },
                { model_name: "private", enable_groups: ["secret"], supported_endpoint_types: ["image-generation"] },
            ],
            usable_group: { default: "Standard", vip: "Premium" },
            group_ratio: { default: 2, vip: 1.25 },
            auto_groups: ["vip"],
        },
        "default",
    );
    assert.deepEqual(
        offers.map(({ name, group, group_ratio }) => ({ name, group, group_ratio })),
        [
            { name: "image", group: "default", group_ratio: 2 },
            { name: "video", group: "vip", group_ratio: 1.25 },
        ],
    );
});

test("wallet mutations reuse native endpoints, legacy success envelopes and the current session", async () => {
    const { quotePayment, createPayment, paymentMethods, safeCheckoutUrl } = await import("./new-api-wallet");
    const { platformRequest } = await import("./new-api-platform");
    const calls: Array<{ path: string; method: string; body: unknown; auth: string }> = [];
    globalThis.fetch = (async (url, init) => {
        calls.push({ path: String(url), method: init?.method || "", body: init?.body ? JSON.parse(String(init.body)) : null, auth: new Headers(init?.headers).get("Authorization") || "" });
        if (String(url).endsWith("/stripe/amount")) return new Response(JSON.stringify({ message: "success", data: "7.50" }));
        if (String(url).endsWith("/stripe/pay")) return reply({ pay_link: "https://checkout.example.test/pay" });
        return reply(500000);
    }) as typeof fetch;
    assert.equal(await quotePayment(10, { name: "Card", type: "stripe" }), 7.5);
    assert.deepEqual(await createPayment(10, { name: "Card", type: "stripe" }), { url: "https://checkout.example.test/pay" });
    await platformRequest("/user/topup", false, { method: "POST", body: { key: "test-code" } });
    assert.deepEqual(
        calls.map((call) => [call.path, call.method, call.body]),
        [
            ["/api/user/stripe/amount", "POST", { amount: 10 }],
            ["/api/user/stripe/pay", "POST", { amount: 10, payment_method: "stripe" }],
            ["/api/user/topup", "POST", { key: "test-code" }],
        ],
    );
    assert.ok(calls.every((call) => call.auth === "Bearer session-secret-1"));
    for (const value of ["javascript:alert(1)", "data:text/html,test", "/relative", "file:///C:/test"]) assert.throws(() => safeCheckoutUrl(value));
    const methods = paymentMethods({
        enable_online_topup: false,
        enable_stripe_topup: true,
        enable_redemption: false,
        enable_waffo_topup: true,
        pay_methods: [
            { name: "Alipay", type: "alipay" },
            { name: "Card", type: "stripe" },
            { name: "Global", type: "waffo" },
        ],
        waffo_pay_methods: [{ name: "Local bank" }],
        min_topup: 1,
        stripe_min_topup: 5,
        waffo_min_topup: 3,
        amount_options: [],
    });
    assert.deepEqual(
        methods.map((method) => [method.type, method.min_topup, method.pay_method_index]),
        [
            ["stripe", 5, undefined],
            ["waffo", 3, 0],
        ],
    );
});

test("wallet errors never become a successful quote or checkout", async () => {
    const { quotePayment, createPayment } = await import("./new-api-wallet");
    globalThis.fetch = (async () => new Response(JSON.stringify({ success: false, message: "success", data: "10" }))) as typeof fetch;
    await assert.rejects(quotePayment(10, { name: "Card", type: "stripe" }));
    globalThis.fetch = (async () => reply({ pay_link: "javascript:alert(1)" })) as typeof fetch;
    await assert.rejects(createPayment(10, { name: "Card", type: "stripe" }));
});

test("a response body arriving after an account switch is discarded", async () => {
    const { platformRequest } = await import("./new-api-platform");
    globalThis.fetch = (async () => {
        const response = new Response();
        response.json = async () => {
            useUserStore.getState().setSession(session(2));
            return { success: true, data: { quota: 999 } };
        };
        return response;
    }) as typeof fetch;
    await assert.rejects(platformRequest("/user/self"));
});

test("a revoked session cannot remain logged in after a management request", async () => {
    const { platformRequest } = await import("./new-api-platform");
    globalThis.fetch = (async () => reply(null, 401)) as typeof fetch;
    await assert.rejects(platformRequest("/user/self"));
    assert.equal(useUserStore.getState().phase, "anonymous");
});
