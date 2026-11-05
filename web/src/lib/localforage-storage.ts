import type { StateStorage } from "zustand/middleware";
import { accountLocalStorage, createAccountStorage } from "./account-storage";

const storage = createAccountStorage("app_state");

export const localForageStorage: StateStorage = {
    getItem: async (name) => {
        if (typeof window === "undefined") return null;
        try {
            return (await storage.getItem<string>(name)) ?? accountLocalStorage.getItem(name);
        } catch {
            return accountLocalStorage.getItem(name);
        }
    },
    setItem: async (name, value) => {
        if (typeof window === "undefined") return;
        try {
            await storage.setItem(name, value);
            accountLocalStorage.removeItem(name);
        } catch {
            accountLocalStorage.setItem(name, value);
        }
    },
    removeItem: async (name) => {
        if (typeof window === "undefined") return;
        accountLocalStorage.removeItem(name);
        await storage.removeItem(name);
    },
};
