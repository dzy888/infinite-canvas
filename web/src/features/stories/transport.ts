import { assertAccountOwner } from "@/lib/account-storage";
import { restoreSession, AuthError } from "@/services/api/new-api-auth";
import { useUserStore } from "@/stores/use-user-store";
export function storyUrl(path: string): string {
    if (!path.startsWith("/inkos-api/")) return path;
    const owner = useUserStore.getState().user?.id;
    assertAccountOwner(owner);
    const url = new URL(path, window.location.origin);
    url.searchParams.set("_owner", String(owner));
    return url.pathname + url.search;
}
export const storyFetch: typeof fetch = async (input, init) => {
    const path = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const url = new URL(path, window.location.origin);
    if (url.origin !== window.location.origin || !url.pathname.startsWith("/inkos-api/")) return fetch(input, init);
    const session = await restoreSession();
    if (!session) throw new AuthError("auth.flowExpired", 401);
    assertAccountOwner(session.user.id);
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init?.headers).forEach((v, k) => headers.set(k, v));
    headers.set("Authorization", "Bearer " + session.access_token);
    headers.set("X-Dmx-Owner", String(session.user.id));
    const result = await fetch(input instanceof Request ? new Request(input, { ...init, headers }) : storyUrl(url.pathname + url.search), { ...init, headers, credentials: "same-origin" });
    assertAccountOwner(session.user.id);
    if (useUserStore.getState().user?.id !== session.user.id) throw new AuthError("auth.sessionChanged", 409);
    return result;
};
export function storyPreferenceKey(key: string) {
    return `dmxvideo:user:${useUserStore.getState().user?.id}:story:${key}`;
}
