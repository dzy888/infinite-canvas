import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";

import { AuthError, clearAuthentication, restoreSession, safeReturnPath, registerAccount, sendRegistrationCode, signIn as authenticate, signOut, verifyLogin } from "./new-api-auth";
import { useUserStore } from "@/stores/use-user-store";
import type { AuthBundle, LoginChallenge, LoginSettings } from "@/types/auth";

const originalFetch = globalThis.fetch;
const proof = { id: "test-captcha", code: "123456" };
const signIn = (username: string, password: string, options: LoginSettings, token: string) => authenticate(username, password, options, token, proof);
const originalChannel = globalThis.BroadcastChannel;
const originalStorage = globalThis.localStorage;
const settings: LoginSettings = {
    login_captcha_mode: "image",
    initialized: true,
    password_login_enabled: true,
    password_login_encryption_enabled: false,
    passkey_login: false,
    turnstile_check: false,
};
const bundle = (sid = "session-a", username = "alice"): AuthBundle => ({
    access_token: `private-token-${sid}`,
    token_type: "Bearer",
    access_expires_at: Math.floor(Date.now() / 1000) + 900,
    user: { id: sid === "session-a" ? 1 : 2, username, role: 1 },
    session: { sid },
});
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
const challenge: LoginChallenge = { require_verification: true, flow_token: "one-time-flow", expires_at: Math.floor(Date.now() / 1000) + 300, methods: [{ method: "2fa", available: true }] };
let notifications: unknown[] = [];
let requests: { url: string; options?: RequestInit }[] = [];

beforeEach(() => {
    clearAuthentication();
    notifications = [];
    requests = [];
    // Storage access would expose credentials; tests fail if any login path tries to use it.
    Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: {
            setItem: () => {
                throw new Error("Unexpected credential persistence");
            },
        },
    });
    globalThis.BroadcastChannel = class {
        postMessage(value: unknown) {
            notifications.push(value);
        }
    } as unknown as typeof BroadcastChannel;
});

afterEach(() => {
    clearAuthentication();
    globalThis.fetch = originalFetch;
    globalThis.BroadcastChannel = originalChannel;
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: originalStorage });
});

function serve(handler: (url: string, options?: RequestInit) => Response | Promise<Response>) {
    globalThis.fetch = (async (url: string | URL | Request, options?: RequestInit) => {
        requests.push({ url: String(url), options });
        return handler(String(url), options);
    }) as typeof fetch;
}

test("password login sends credentials only to the same-origin endpoint and keeps tokens out of tab notifications", async () => {
    serve(() => response({ success: true, data: bundle() }));
    await signIn("alice", "example-password", settings, "captcha-token");
    assert.equal(useUserStore.getState().user?.username, "alice");
    assert.equal(requests[0].url, "/api/user/login");
    assert.equal(requests[0].options?.credentials, "same-origin");
    assert.deepEqual(JSON.parse(String(requests[0].options?.body)), { username: "alice", password: "example-password" });
    assert.ok(notifications.length > 0);
    assert.ok(!JSON.stringify(notifications).includes("private-token"));
    assert.ok(!JSON.stringify(notifications).includes("session-a"));
});

test("invalid credentials use a generic error and do not disclose backend error details", async () => {
    serve(() => response({ success: false, message: "private database or account details" }));
    await assert.rejects(signIn("alice", "wrong", settings, ""), (error: unknown) => error instanceof AuthError && error.key === "auth.loginFailed" && !error.message.includes("private"));
    assert.equal(useUserStore.getState().session, null);
});

test("a successful response without a valid identity cannot authenticate", async () => {
    serve(() => response({ success: true, data: { ...bundle(), user: { id: 0 } } }));
    await assert.rejects(signIn("alice", "password", settings, ""), (error: unknown) => error instanceof AuthError && error.key === "auth.invalidResponse");
    assert.equal(useUserStore.getState().session, null);
});

test("a 2FA challenge does not grant a session until the server verifies the code", async () => {
    serve((url) => response({ success: true, data: url.includes("/login/verify") ? bundle() : challenge }));
    assert.deepEqual(await signIn("alice", "password", settings, ""), challenge);
    assert.equal(useUserStore.getState().session, null);
    await verifyLogin(challenge, " 123456 ");
    assert.deepEqual(JSON.parse(String(requests[1].options?.body)), { flow_token: "one-time-flow", method: "2fa", code: "123456" });
    assert.equal(useUserStore.getState().phase, "authenticated");
});

test("expired or unavailable 2FA challenges are rejected before submitting", async () => {
    serve(() => {
        throw new Error("must not send");
    });
    await assert.rejects(verifyLogin({ ...challenge, expires_at: 1 }, "123456"));
    await assert.rejects(verifyLogin({ ...challenge, methods: [{ method: "2fa", available: false }] }, "123456"));
    assert.equal(requests.length, 0);
});

test("concurrent refresh requests share one response and restore a session even with no session hint", async () => {
    let resolve!: (value: Response) => void;
    serve(
        () =>
            new Promise<Response>((done) => {
                resolve = done;
            }),
    );
    useUserStore.getState().setPhase("idle");
    const first = restoreSession();
    const second = restoreSession();
    assert.equal(requests.length, 1);
    resolve(response({ success: true, data: bundle() }));
    assert.equal((await first)?.user.id, 1);
    assert.equal((await second)?.user.id, 1);
});

test("network failure remains retryable instead of being treated as signed out", async () => {
    serve(() => {
        throw new TypeError("offline");
    });
    await assert.rejects(restoreSession(true));
    assert.equal(useUserStore.getState().phase, "error");
    serve(() => response({ success: true, data: bundle() }));
    await restoreSession();
    assert.equal(useUserStore.getState().phase, "authenticated");
});

test("server rejection of a revoked session removes the previous user", async () => {
    useUserStore.getState().setSession(bundle());
    serve(() => response({ success: false, code: "AUTH_SESSION_REVOKED" }, 401));
    assert.equal(await restoreSession(true), null);
    assert.equal(useUserStore.getState().phase, "anonymous");
    assert.equal(useUserStore.getState().user, null);
});

test("a cookie session mismatch reconciles without sending the old SID again", async () => {
    useUserStore.getState().setSession(bundle());
    serve(() => (requests.length === 1 ? response({ success: false, code: "AUTH_SESSION_MISMATCH" }, 409) : response({ success: true, data: bundle("session-b", "bob") })));
    await restoreSession(true);
    assert.equal((requests[0].options?.headers as Record<string, string>)["X-Auth-Session"], "session-a");
    assert.equal((requests[1].options?.headers as Record<string, string>)["X-Auth-Session"], undefined);
    assert.equal(useUserStore.getState().user?.username, "bob");
});

test("late refresh results cannot replace a more recent login", async () => {
    let resolve!: (value: Response) => void;
    serve((url) =>
        url.endsWith("/refresh")
            ? new Promise<Response>((done) => {
                  resolve = done;
              })
            : response({ success: true, data: bundle("session-b", "bob") }),
    );
    const refresh = restoreSession(true);
    await signIn("bob", "password", settings, "");
    resolve(response({ success: true, data: bundle() }));
    await refresh;
    assert.equal(useUserStore.getState().user?.username, "bob");
});

test("logout revokes the server session before clearing identity and notifies other tabs", async () => {
    useUserStore.getState().setSession(bundle());
    serve(() => response({ success: true }));
    await signOut();
    assert.equal(requests[0].url, "/api/user/auth/logout");
    assert.equal(requests[0].options?.method, "POST");
    assert.equal((requests[0].options?.headers as Record<string, string>)["X-Auth-Session"], "session-a");
    assert.equal(useUserStore.getState().user, null);
    assert.ok(notifications.length > 0);
});

test("failed logout preserves identity so a user can retry server-side revocation", async () => {
    useUserStore.getState().setSession(bundle());
    serve(() => {
        throw new TypeError("offline");
    });
    await assert.rejects(signOut());
    assert.equal(useUserStore.getState().user?.username, "alice");
});

test("logout also clears local identity when the cookie changed and the replacement session is already invalid", async () => {
    useUserStore.getState().setSession(bundle());
    serve((url) => response({ success: false, code: url.endsWith("/logout") ? "AUTH_SESSION_MISMATCH" : "AUTH_UNAUTHORIZED" }, url.endsWith("/logout") ? 409 : 401));
    await signOut();
    assert.equal(useUserStore.getState().user, null);
    assert.equal(useUserStore.getState().phase, "anonymous");
});

test("return paths reject external URLs, protocol-relative URLs and backslash redirects", () => {
    for (const path of ["https://evil.example", "//evil.example", "/\\evil.example", "/login?from=/login", "/\n/evil", null]) assert.equal(safeReturnPath(path), "/canvas");
    assert.equal(safeReturnPath("/canvas/project?mode=recent#node"), "/canvas/project?mode=recent#node");
});

test("encrypted login uses the server public key, including the long-password envelope", async () => {
    const keys = await crypto.subtle.generateKey({ name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["encrypt", "decrypt"]);
    const publicKey = await crypto.subtle.exportKey("spki", keys.publicKey);
    const pem = `-----BEGIN PUBLIC KEY-----\n${Buffer.from(publicKey).toString("base64")}\n-----END PUBLIC KEY-----`;
    for (const password of ["short-password", "long-password-".repeat(30)]) {
        serve((url) => response({ success: true, data: url.endsWith("encryption-key") ? { kid: "key-one", public_key: pem } : bundle() }));
        await signIn("alice", password, { ...settings, password_login_encryption_enabled: true }, "");
        const fields = JSON.parse(String(requests.at(-1)?.options?.body));
        assert.equal(fields.password, undefined);
        assert.equal(fields.encryption_key_id, "key-one");
        let clear: ArrayBuffer;
        if (fields.password_encrypted.startsWith("v2.")) {
            const [, wrapped, nonce, ciphertext] = fields.password_encrypted.split(".");
            const secret = await crypto.subtle.decrypt({ name: "RSA-OAEP", label: new TextEncoder().encode("password-v2") }, keys.privateKey, Buffer.from(wrapped, "base64"));
            const aes = await crypto.subtle.importKey("raw", secret, "AES-GCM", false, ["decrypt"]);
            clear = await crypto.subtle.decrypt({ name: "AES-GCM", iv: Buffer.from(nonce, "base64"), additionalData: new TextEncoder().encode("password-v2:key-one") }, aes, Buffer.from(ciphertext, "base64"));
        } else clear = await crypto.subtle.decrypt({ name: "RSA-OAEP" }, keys.privateKey, Buffer.from(fields.password_encrypted, "base64"));
        assert.equal(new TextDecoder().decode(clear), password);
    }
});

test("missing image or Turnstile verification blocks password submission", async () => {
    serve(() => {
        throw new Error("must not send");
    });
    await assert.rejects(authenticate("alice", "password", settings, ""));
    await assert.rejects(authenticate("alice", "password", { ...settings, login_captcha_mode: "turnstile" }, ""));
    assert.equal(requests.length, 0);
});

test("Turnstile mode sends its token in a header and does not require an image challenge", async () => {
    serve(() => response({ success: true, data: bundle() }));
    await authenticate("alice", "password", { ...settings, login_captcha_mode: "turnstile" }, "verified-turnstile");
    assert.equal(requests[0].url, "/api/user/login");
    assert.equal((requests[0].options?.headers as Record<string, string>)["X-Turnstile-Token"], "verified-turnstile");
    assert.equal((requests[0].options?.headers as Record<string, string>)["X-Login-Captcha-Id"], undefined);
});

test("an empty 429 response is reported as rate limited", async () => {
    serve(() => new Response(null, { status: 429 }));
    await assert.rejects(signIn("alice", "password", settings, ""), (error: unknown) => error instanceof AuthError && error.key === "auth.rateLimited");
});

const registrationSettings: LoginSettings = { ...settings, register_enabled: true, password_register_enabled: true };

test("registration sends only account fields and never creates a login session", async () => {
    serve(() => response({ success: true }));
    await registerAccount({ username: " alice ", password: "example-password", email: "ignored@example.com" }, registrationSettings, "");
    assert.equal(requests[0].url, "/api/user/register");
    assert.equal(requests[0].options?.credentials, "same-origin");
    assert.deepEqual(JSON.parse(String(requests[0].options?.body)), { username: "alice", password: "example-password" });
    assert.equal(useUserStore.getState().session, null);
    assert.equal(notifications.length, 0);
});

test("registration gates and missing Turnstile proof prevent account and email submissions", async () => {
    serve(() => response({ success: true }));
    for (const options of [
        { ...registrationSettings, register_enabled: false },
        { ...registrationSettings, password_register_enabled: false },
        { ...registrationSettings, turnstile_check: true },
    ]) {
        await assert.rejects(registerAccount({ username: "alice", password: "example-password" }, options, ""));
        await assert.rejects(sendRegistrationCode("alice@example.com", options, ""));
    }
    assert.equal(requests.length, 0);
});

test("email verification uses encoded email and a separate Turnstile proof per request", async () => {
    serve(() => response({ success: true }));
    const options = { ...registrationSettings, turnstile_check: true, email_verification: true };
    await sendRegistrationCode(" alice+canvas@example.com ", options, "email-proof");
    await registerAccount({ username: "alice", password: "example-password", email: " alice+canvas@example.com ", verification_code: " 123456 " }, options, "register-proof");
    assert.equal(new URL(requests[0].url, "http://localhost").searchParams.get("email"), "alice+canvas@example.com");
    assert.equal(requests[0].options?.method, "GET");
    assert.equal((requests[0].options?.headers as Record<string, string>)["X-Turnstile-Token"], "email-proof");
    assert.equal((requests[1].options?.headers as Record<string, string>)["X-Turnstile-Token"], "register-proof");
    assert.deepEqual(JSON.parse(String(requests[1].options?.body)), { username: "alice", password: "example-password", email: "alice+canvas@example.com", verification_code: "123456" });
});

test("registration and email failures are generic and rate limits remain visible", async () => {
    serve(() => response({ success: false, message: "private account or SMTP details" }));
    await assert.rejects(registerAccount({ username: "alice", password: "example-password" }, registrationSettings, ""), (error: unknown) => error instanceof AuthError && error.key === "auth.registrationFailed");
    await assert.rejects(sendRegistrationCode("alice@example.com", registrationSettings, ""), (error: unknown) => error instanceof AuthError && error.key === "auth.emailCodeFailed");
    serve(() => response({ success: false }, 429));
    await assert.rejects(sendRegistrationCode("alice@example.com", registrationSettings, ""), (error: unknown) => error instanceof AuthError && error.key === "auth.rateLimited");
    assert.equal(useUserStore.getState().session, null);
});

test("authentication routes are never accepted as login return destinations", () => {
    assert.equal(safeReturnPath("/register?next=/canvas"), "/canvas");
    assert.equal(safeReturnPath("/login"), "/canvas");
});
