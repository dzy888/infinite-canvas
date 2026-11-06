import { assertAccountOwner } from "@/lib/account-storage";
import i18n from "@/i18n";
import { restoreSession, clearAuthentication, AuthError } from "./new-api-auth";
import { useUserStore } from "@/stores/use-user-store";
import type { BillingUsageSchema } from "@/lib/new-api-pricing/types";
import type { AiConfig, ModelCapability } from "@/stores/use-config-store";

export type { PlatformModel } from "../../../../shared/new-api-models";
export type AccountInfo = { id: number; username: string; display_name: string; email: string; quota: number; used_quota: number; request_count: number; group: string };
export type QuotaSettings = { quota_per_unit: number; quota_display_type: string; usd_exchange_rate?: number; custom_currency_symbol?: string; custom_currency_exchange_rate?: number };
export type UsageLog = { id: number; created_at: number; type: number; model_name: string; quota: number; use_time: number; prompt_tokens: number; completion_tokens: number; request_id?: string };

export async function platformRequest<T>(path: string, fullResponse = false, init: { method?: "GET" | "POST" | "PUT" | "DELETE"; body?: unknown } = {}): Promise<T> {
    const session = await restoreSession();
    if (!session) throw new AuthError("auth.flowExpired", 401);
    assertAccountOwner(session.user.id);
    const response = await fetch("/api" + path, {
        cache: "no-store",
        credentials: "same-origin",
        method: init.method || "GET",
        headers: { Authorization: "Bearer " + session.access_token, Accept: "application/json", "Accept-Language": i18n.language, ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}) },
        ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    });
    if (session.user.id !== useUserStore.getState().user?.id) throw new AuthError("auth.sessionChanged", 409);
    assertAccountOwner(session.user.id);
    if (response.status === 401) {
        clearAuthentication();
        throw new AuthError("auth.flowExpired", 401);
    }
    if (response.status === 429) throw new AuthError("auth.rateLimited", 429);
    const result = await response.json();
    if (session.user.id !== useUserStore.getState().user?.id) throw new AuthError("auth.sessionChanged", 409);
    assertAccountOwner(session.user.id);
    if (!response.ok || (result.success !== true && !(result.success !== false && result.message === "success"))) throw new Error(i18n.t("platform.operationFailed"));
    return (fullResponse ? result : result.data) as T;
}

export async function preparePlatformRequest(config: AiConfig) {
    if (config.platformManaged) {
        const session = await restoreSession();
        if (!session) throw new AuthError("auth.flowExpired", 401);
        assertAccountOwner(session.user.id);
    }
}

export function modelRequestHeaders(config: Pick<AiConfig, "apiKey" | "platformManaged">, contentType?: string): Record<string, string> {
    if (config.platformManaged) assertAccountOwner(useUserStore.getState().user?.id);
    const token = config.platformManaged ? useUserStore.getState().session?.access_token : config.apiKey;
    if (config.platformManaged && !token) throw new AuthError("auth.flowExpired", 401);
    return { Authorization: `Bearer ${token || ""}`, ...(contentType ? { "Content-Type": contentType } : {}) };
}

export function formatQuota(quota: number, settings?: QuotaSettings, digits = 4) {
    if (!settings || settings.quota_display_type === "TOKENS") return `${quota.toLocaleString()} ${i18n.t("platform.credits")}`;
    const value = quota / (settings.quota_per_unit || 500000);
    if (settings.quota_display_type === "CNY") return `¥${(value * (settings.usd_exchange_rate || 1)).toFixed(digits)}`;
    if (settings.quota_display_type === "CUSTOM") return `${settings.custom_currency_symbol || ""}${(value * (settings.custom_currency_exchange_rate || 1)).toFixed(digits)}`;
    return `$${value.toFixed(digits)}`;
}

// Adapt the existing pricing response for model pickers; no canvas catalog API is needed.
export { modelsFromPricing, type PricingModel, type PricingCatalog } from "../../../../shared/new-api-models";

// A completed or failed generation may settle or refund quota. Never hide its result if this refresh fails.
export async function refreshPlatformAccount(config: Pick<AiConfig, "platformManaged">) {
    if (!config.platformManaged) return;
    const owner = useUserStore.getState().user?.id;
    if (!owner) return;
    try {
        const account = await platformRequest<AccountInfo>("/user/self");
        const { usePlatformStore } = await import("@/stores/use-platform-store");
        if (usePlatformStore.getState().owner === owner && useUserStore.getState().user?.id === owner) usePlatformStore.setState({ account });
    } catch {
        /* Account center provides an explicit refresh when offline. */
    }
}
