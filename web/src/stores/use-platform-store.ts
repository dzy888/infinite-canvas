import { create } from "zustand";
import { platformRequest, modelsFromPricing, type PricingCatalog, type PlatformModel, type AccountInfo, type QuotaSettings } from "@/services/api/new-api-platform";
import { AuthError } from "@/services/api/new-api-auth";

let version = 0;
type PlatformStore = {
    models: PlatformModel[];
    account: AccountInfo | null;
    quotaSettings?: QuotaSettings;
    owner: number | null;
    loading: boolean;
    loaded: boolean;
    error: string;
    load: (owner: number) => Promise<void>;
    reset: () => void;
};

// The catalog and account snapshot are scoped to the active account and never persisted.
export const usePlatformStore = create<PlatformStore>()((set) => ({
    models: [],
    account: null,
    owner: null,
    loading: false,
    loaded: false,
    error: "",
    reset: () => {
        version += 1;
        set({ models: [], account: null, quotaSettings: undefined, owner: null, loading: false, loaded: false, error: "" });
    },
    load: async (owner) => {
        const current = ++version;
        set((state) => ({ owner, loading: true, error: "", ...(state.owner !== owner ? { models: [], account: null, loaded: false } : {}) }));
        try {
            const [pricing, account, quotaSettings] = await Promise.all([platformRequest<PricingCatalog>("/pricing", true), platformRequest<AccountInfo>("/user/self"), platformRequest<QuotaSettings>("/status")]);
            if (!Array.isArray(pricing.data)) throw new Error("Invalid catalog");
            const models = modelsFromPricing(pricing, account.group);
            if (current === version) set({ models, account, quotaSettings, loading: false, loaded: true, error: "" });
        } catch (error) {
            if (current === version) set({ models: [], loading: false, loaded: true, error: error instanceof AuthError ? error.key : "platform.loadFailed" });
        }
    },
}));
