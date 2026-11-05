import { nanoid } from "nanoid";
import { useUserStore } from "@/stores/use-user-store";
import type { AuthBundle, ImageVerification, LoginChallenge, LoginSettings } from "@/types/auth";

type ApiResponse<T> = { success: boolean; data?: T; code?: string };

export class AuthError extends Error {
    constructor(
        public key: string,
        public status = 0,
        public code = "",
    ) {
        super(key);
        this.name = "AuthError";
    }
}

export function isAuthBundle(value: unknown): value is AuthBundle {
    if (!value || typeof value !== "object") return false;
    const bundle = value as Partial<AuthBundle>;
    return (
        typeof bundle.access_token === "string" &&
        !!bundle.access_token &&
        bundle.token_type === "Bearer" &&
        typeof bundle.access_expires_at === "number" &&
        Number.isFinite(bundle.access_expires_at) &&
        bundle.access_expires_at > 0 &&
        typeof bundle.session?.sid === "string" &&
        !!bundle.session.sid &&
        Number.isInteger(bundle.user?.id) &&
        Number(bundle.user?.id) > 0 &&
        typeof bundle.user?.username === "string" &&
        typeof bundle.user?.role === "number"
    );
}

function isLoginChallenge(value: unknown): value is LoginChallenge {
    if (!value || typeof value !== "object") return false;
    const challenge = value as Partial<LoginChallenge>;
    return (
        challenge.require_verification === true &&
        typeof challenge.flow_token === "string" &&
        !!challenge.flow_token &&
        typeof challenge.expires_at === "number" &&
        Array.isArray(challenge.methods) &&
        challenge.methods.every((item) => item && typeof item.method === "string" && typeof item.available === "boolean")
    );
}

async function request<T>(path: string, body?: unknown, headers?: Record<string, string>, failureKey = "auth.loginFailed"): Promise<T> {
    let response: Response;
    try {
        response = await fetch(`/api${path}`, {
            method: body === undefined ? "GET" : "POST",
            credentials: "same-origin",
            cache: "no-store",
            headers: { "Content-Type": "application/json", Accept: "application/json", ...headers },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
    } catch {
        throw new AuthError("auth.unavailable");
    }
    if (response.status === 429) throw new AuthError("auth.rateLimited", 429);
    let result: ApiResponse<T>;
    try {
        result = await response.json();
    } catch {
        throw new AuthError("auth.unavailable", response.status);
    }
    if (!response.ok || result.success !== true) {
        let key = failureKey;
        if (response.status === 429) key = "auth.rateLimited";
        else if (response.status >= 500) key = "auth.unavailable";
        else if (result.code === "AUTH_FLOW_INVALID") key = "auth.flowExpired";
        else if (response.status === 409) key = "auth.sessionChanged";
        if (result.code?.startsWith("LOGIN_CAPTCHA_")) key = result.code === "LOGIN_CAPTCHA_UNAVAILABLE" ? "auth.captchaUnavailable" : "auth.captchaFailed";
        throw new AuthError(key, response.status, result.code);
    }
    return result.data as T;
}

export async function getLoginSettings(): Promise<LoginSettings> {
    const [settings, setup] = await Promise.all([request<Omit<LoginSettings, "initialized">>("/status"), request<{ status: boolean }>("/setup")]);
    if (!settings || typeof setup?.status !== "boolean" || !["image", "turnstile"].includes(settings.login_captcha_mode)) throw new AuthError("auth.unavailable");
    return { ...settings, initialized: setup.status };
}

let epoch = 0;
let refreshPending: Promise<AuthBundle | null> | null = null;
const syncKey = "dmxvideo:new-api-auth";
const source = nanoid();
let syncChannel: BroadcastChannel | null = null;

function announceChange() {
    // Only a change notification is shared. Tokens, users and session IDs are never persisted or broadcast.
    const event = { kind: "changed", source, nonce: nanoid() };
    if (typeof BroadcastChannel !== "undefined") {
        syncChannel ??= new BroadcastChannel(syncKey);
        syncChannel.postMessage(event);
    } else {
        try {
            localStorage.setItem(syncKey, JSON.stringify(event));
            localStorage.removeItem(syncKey);
        } catch {
            /* optional tab synchronization */
        }
    }
}

function acceptSession(bundle: AuthBundle, notify = false) {
    if (!isAuthBundle(bundle)) throw new AuthError("auth.invalidResponse");
    epoch += 1;
    useUserStore.getState().setSession(bundle);
    if (notify) announceChange();
    return bundle;
}

export function clearAuthentication() {
    epoch += 1;
    useUserStore.getState().clearSession();
}

async function lockSession<T>(action: () => Promise<T>): Promise<T> {
    if (typeof navigator !== "undefined" && navigator.locks) return await navigator.locks.request("new-api:auth-refresh", action);
    return action();
}

export function restoreSession(force = false): Promise<AuthBundle | null> {
    const state = useUserStore.getState();
    if (!force && state.session && state.session.access_expires_at * 1000 > Date.now()) return Promise.resolve(state.session);
    if (!force && state.phase === "anonymous") return Promise.resolve(null);
    if (refreshPending) return refreshPending;
    const version = epoch;
    state.setPhase("checking");
    refreshPending = lockSession(async () => {
        if (version !== epoch) return useUserStore.getState().session;
        let sid = useUserStore.getState().session?.session.sid;
        try {
            let bundle: AuthBundle;
            try {
                bundle = await request<AuthBundle>("/user/auth/refresh", {}, sid ? { "X-Auth-Session": sid } : undefined);
            } catch (error) {
                // The cookie may have been replaced by another login. Reconcile once without the stale SID.
                if (!(error instanceof AuthError) || error.code !== "AUTH_SESSION_MISMATCH" || version !== epoch) throw error;
                useUserStore.setState({ user: null, session: null, phase: "checking" });
                sid = undefined;
                bundle = await request<AuthBundle>("/user/auth/refresh", {});
            }
            if (version !== epoch) return useUserStore.getState().session;
            return acceptSession(bundle);
        } catch (error) {
            if (version !== epoch) return useUserStore.getState().session;
            if (error instanceof AuthError && error.status === 401) {
                clearAuthentication();
                return null;
            }
            useUserStore.getState().setPhase("error");
            throw error;
        }
    }).finally(() => {
        refreshPending = null;
    });
    return refreshPending;
}

export function watchAuthentication(): () => void {
    const reconcile = () => {
        void restoreSession(true).catch(() => undefined);
    };
    const receive = (value: unknown) => {
        if (!value || typeof value !== "object") return;
        const event = value as { kind?: string; source?: string };
        if (event.kind !== "changed" || typeof event.source !== "string" || event.source === source) return;
        clearAuthentication();
        reconcile();
    };
    const storage = (event: StorageEvent) => {
        if (event.key !== syncKey || !event.newValue) return;
        try {
            receive(JSON.parse(event.newValue));
        } catch {
            /* ignore malformed notifications */
        }
    };
    let listener: BroadcastChannel | undefined;
    if (typeof BroadcastChannel !== "undefined") {
        listener = new BroadcastChannel(syncKey);
        listener.onmessage = (event) => receive(event.data);
    } else window.addEventListener("storage", storage);
    window.addEventListener("focus", reconcile);
    if (document.cookie.split(";").some((part) => part.trim() === "new_api_has_session=1")) reconcile();
    return () => {
        listener?.close();
        window.removeEventListener("focus", reconcile);
        window.removeEventListener("storage", storage);
    };
}

export function getImageCaptcha() {
    return request<{ id: string; image: string }>("/user/login/captcha");
}

export type Registration = { username: string; password: string; email?: string; verification_code?: string };

export async function registerAccount(values: Registration, settings: LoginSettings, turnstile: string): Promise<void> {
    if (!settings.register_enabled || !settings.password_register_enabled) throw new AuthError("auth.registrationDisabled");
    if (settings.turnstile_check && !turnstile) throw new AuthError("auth.captchaFailed");
    await request("/user/register", {
        username: values.username.trim(),
        password: values.password,
        ...(settings.email_verification ? { email: values.email?.trim(), verification_code: values.verification_code?.trim() } : {}),
    }, { "X-Turnstile-Token": turnstile }, "auth.registrationFailed");
}

export async function sendRegistrationCode(email: string, settings: LoginSettings, turnstile: string): Promise<void> {
    if (!settings.register_enabled || !settings.password_register_enabled) throw new AuthError("auth.registrationDisabled");
    if (settings.turnstile_check && !turnstile) throw new AuthError("auth.captchaFailed");
    await request("/verification?" + new URLSearchParams({ email: email.trim() }), undefined, { "X-Turnstile-Token": turnstile }, "auth.emailCodeFailed");
}

export async function signIn(username: string, password: string, settings: LoginSettings, turnstile: string, image?: ImageVerification): Promise<AuthBundle | LoginChallenge> {
    if (settings.login_captcha_mode === "image" && (!image?.id || !image.code.trim())) throw new AuthError("auth.captchaFailed");
    if (settings.login_captcha_mode === "turnstile" && !turnstile) throw new AuthError("auth.captchaFailed");
    const version = ++epoch;
    const passwordFields = settings.password_login_encryption_enabled ? await encryptedPassword(password) : { password };
    const headers: Record<string, string> = settings.login_captcha_mode === "image" ? { "X-Login-Captcha-Id": image!.id, "X-Login-Captcha-Code": image!.code.trim() } : { "X-Turnstile-Token": turnstile };
    const result = await lockSession(() => request<unknown>("/user/login", { username, ...passwordFields }, headers));
    if (version !== epoch) throw new AuthError("auth.sessionChanged");
    if (isLoginChallenge(result)) return result;
    if (!isAuthBundle(result)) throw new AuthError("auth.invalidResponse");
    return acceptSession(result, true);
}

export async function verifyLogin(challenge: LoginChallenge, code: string): Promise<AuthBundle> {
    if (challenge.expires_at * 1000 <= Date.now()) throw new AuthError("auth.flowExpired");
    if (!challenge.methods.some((item) => item.method === "2fa" && item.available)) throw new AuthError("auth.verificationFailed");
    const version = epoch;
    const result = await lockSession(() => request<AuthBundle>("/user/login/verify", { flow_token: challenge.flow_token, method: "2fa", code: code.trim() }));
    if (version !== epoch) throw new AuthError("auth.sessionChanged");
    return acceptSession(result, true);
}

export async function signInWithPasskey(challenge?: LoginChallenge): Promise<AuthBundle> {
    if (challenge && (challenge.expires_at * 1000 <= Date.now() || !challenge.methods.some((item) => item.method === "passkey" && item.available))) throw new AuthError("auth.flowExpired");
    const version = ++epoch;
    const { startAuthentication } = await import("@simplewebauthn/browser");
    type Options = Parameters<typeof startAuthentication>[0]["optionsJSON"];
    const path = challenge ? "/user/login/passkey" : "/user/passkey/login";
    const start = await request<{ flow_token: string; options: { publicKey: Options } }>(`${path}/begin`, challenge ? { flow_token: challenge.flow_token } : {});
    const credential = await startAuthentication({ optionsJSON: start.options.publicKey });
    const result = await lockSession(() => request<AuthBundle>(`${path}/finish`, challenge ? { flow_token: challenge.flow_token, passkey_flow_token: start.flow_token, credential } : { flow_token: start.flow_token, credential }));
    if (version !== epoch) throw new AuthError("auth.sessionChanged");
    return acceptSession(result, true);
}

export async function signOut(): Promise<void> {
    epoch += 1;
    await refreshPending?.catch(() => undefined);
    await lockSession(async () => {
        const session = useUserStore.getState().session;
        const headers: Record<string, string> = {};
        if (session) {
            headers["X-Auth-Session"] = session.session.sid;
            headers.Authorization = `Bearer ${session.access_token}`;
        }
        try {
            await request("/user/auth/logout", {}, headers);
        } catch (error) {
            if (!(error instanceof AuthError) || error.code !== "AUTH_SESSION_MISMATCH") throw error;
            let current: AuthBundle | null = null;
            try {
                current = await request<AuthBundle>("/user/auth/refresh", {});
            } catch (refreshError) {
                if (!(refreshError instanceof AuthError) || refreshError.status !== 401) throw refreshError;
            }
            if (current !== null) {
                if (!isAuthBundle(current)) throw new AuthError("auth.invalidResponse");
                await request("/user/auth/logout", {}, { "X-Auth-Session": current.session.sid, Authorization: `Bearer ${current.access_token}` });
            }
        }
        clearAuthentication();
        announceChange();
    });
}

export function safeReturnPath(value: unknown): string {
    if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || /[\\\x00-\x1f]/.test(value)) return "/canvas";
    const path = new URL(value, "https://canvas.invalid");
    if (path.origin !== "https://canvas.invalid" || ["/login", "/register"].includes(path.pathname)) return "/canvas";
    return `${path.pathname}${path.search}${path.hash}`;
}

async function encryptedPassword(password: string) {
    if (!crypto.subtle) throw new AuthError("auth.secureContextRequired");
    const { kid, public_key: pem } = await request<{ kid: string; public_key: string }>("/user/login/encryption-key");
    const der = Uint8Array.from(atob(pem.replace(/-----[^-]+-----|\s/g, "")), (char) => char.charCodeAt(0));
    const key = await crypto.subtle.importKey("spki", der, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]);
    const plain = new TextEncoder().encode(password);
    const base64 = (bytes: ArrayBuffer) => btoa(Array.from(new Uint8Array(bytes), (byte) => String.fromCharCode(byte)).join(""));
    let ciphertext: string;
    if (plain.length <= (key.algorithm as RsaHashedKeyAlgorithm).modulusLength / 8 - 66) {
        ciphertext = base64(await crypto.subtle.encrypt({ name: "RSA-OAEP" }, key, plain));
    } else {
        // New API's password-v2 envelope uses standard RSA-OAEP and AES-GCM via Web Crypto.
        const secret = crypto.getRandomValues(new Uint8Array(32));
        const nonce = crypto.getRandomValues(new Uint8Array(12));
        const aes = await crypto.subtle.importKey("raw", secret, "AES-GCM", false, ["encrypt"]);
        const wrapped = await crypto.subtle.encrypt({ name: "RSA-OAEP", label: new TextEncoder().encode("password-v2") }, key, secret);
        const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, additionalData: new TextEncoder().encode(`password-v2:${kid}`) }, aes, plain);
        ciphertext = ["v2", base64(wrapped), base64(nonce.buffer), base64(encrypted)].join(".");
    }
    return { password_encrypted: ciphertext, encryption_key_id: kid };
}
