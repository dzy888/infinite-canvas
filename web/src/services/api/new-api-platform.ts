import { assertAccountOwner } from "@/lib/account-storage";
import i18n from "@/i18n";
import { restoreSession, AuthError } from "./new-api-auth";
import { useUserStore } from "@/stores/use-user-store";
import type { AiConfig, ModelCapability } from "@/stores/use-config-store";

export type PlatformModel = { name: string; capabilities: ModelCapability[]; api_format: "openai" | "gemini"; text_endpoint: "chat" | "responses"; group: string; group_ratio: number; description?: string };
export type AccountInfo = { quota: number; used_quota: number; request_count: number; group: string };
export type QuotaSettings = { quota_per_unit: number; quota_display_type: string; usd_exchange_rate?: number; custom_currency_symbol?: string; custom_currency_exchange_rate?: number };
export type UsageLog = { id: number; created_at: number; type: number; model_name: string; quota: number; use_time: number; prompt_tokens: number; completion_tokens: number; request_id?: string };

export async function platformRequest<T>(path: string, fullResponse = false): Promise<T> {
    const session = await restoreSession();
    if (!session) throw new AuthError("auth.flowExpired", 401);
    assertAccountOwner(session.user.id);
    const response = await fetch(`/api${path}`, { cache: "no-store", credentials: "same-origin", headers: { Authorization: `Bearer ${session.access_token}`, Accept: "application/json" } });
    if (response.status === 401) throw new AuthError("auth.flowExpired", 401);
    if (response.status === 429) throw new AuthError("auth.rateLimited", 429);
    const result = await response.json();
    if (!response.ok || result.success !== true) throw new Error(i18n.t("platform.loadFailed"));
    assertAccountOwner(useUserStore.getState().user?.id);
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

export function formatQuota(quota: number, settings?: QuotaSettings) {
    if (!settings || settings.quota_display_type === "TOKENS") return `${quota.toLocaleString()} ${i18n.t("platform.credits")}`;
    const value = quota / (settings.quota_per_unit || 500000);
    if (settings.quota_display_type === "CNY") return `¥${(value * (settings.usd_exchange_rate || 1)).toFixed(4)}`;
    if (settings.quota_display_type === "CUSTOM") return `${settings.custom_currency_symbol || ""}${(value * (settings.custom_currency_exchange_rate || 1)).toFixed(4)}`;
    return `$${value.toFixed(4)}`;
}

// Adapt the existing pricing response for model pickers; no canvas catalog API is needed.
export type PricingCatalog = {
    data: Array<{ model_name: string; enable_groups: string[]; supported_endpoint_types: string[]; description?: string }>;
    group_ratio: Record<string, number>;
    usable_group: Record<string, string>;
    auto_groups: string[];
};
export function modelsFromPricing(pricing: PricingCatalog, userGroup: string): PlatformModel[] {
    const priority = [...new Set([userGroup, ...pricing.auto_groups, ...Object.keys(pricing.usable_group).sort()])];
    return pricing.data
        .flatMap((item): PlatformModel[] => {
            const group = priority.find((candidate) => candidate !== "auto" && candidate in pricing.usable_group && (item.enable_groups.includes(candidate) || item.enable_groups.includes("all")));
            if (!group) return [];
            const name = item.model_name.toLowerCase(),
                endpoints = item.supported_endpoint_types;
            const offer: PlatformModel = { name: item.model_name, capabilities: [], api_format: "openai", text_endpoint: "chat", group, group_ratio: pricing.group_ratio[group], description: item.description };
            if (name.includes("tts") || name.includes("speech")) offer.capabilities = ["audio"];
            else if (endpoints.includes("openai-video")) offer.capabilities = ["video"];
            else if (endpoints.includes("image-generation")) offer.capabilities = ["image"];
            else if (endpoints.includes("openai-response")) {
                offer.capabilities = ["text"];
                offer.text_endpoint = "responses";
            } else if (endpoints.includes("openai") || endpoints.includes("anthropic")) offer.capabilities = ["text"];
            else if (endpoints.includes("gemini")) {
                offer.capabilities = ["text"];
                offer.api_format = "gemini";
            }
            if (endpoints.includes("gemini") && (name.includes("image") || name.includes("nano-banana"))) {
                offer.capabilities = ["image", "text"];
                offer.api_format = "gemini";
            }
            return offer.capabilities.length ? [offer] : [];
        })
        .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}
