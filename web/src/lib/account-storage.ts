import localforage from "localforage";

// A document keeps its original owner for its entire lifetime. In-flight work can
// finish in that owner's database, but can never write into the next account.
let owner: number | null = null;
let initialized = false;
const pending = new Set<Promise<unknown>>();
const flushers = new Set<() => unknown>();

export function initializeAccountStorage(userId: number | null) {
    if (initialized) throw new Error("Account storage is already bound");
    owner = userId;
    initialized = true;
}

export function accountStorageKey(key: string) {
    return `dmxvideo:${owner === null ? "guest" : `user:${owner}`}:${key}`;
}

export function accountSyncDirectory() {
    return `users/${owner ?? "guest"}`;
}

export function accountDatabaseName() {
    return accountStorageKey("data");
}

export function assertAccountOwner(userId: number | null | undefined) {
    if (initialized && (userId ?? null) !== owner) throw new Error("Account changed; reload required");
}

export const accountLocalStorage = {
    getItem: (key: string) => localStorage.getItem(accountStorageKey(key)),
    setItem: (key: string, value: string) => localStorage.setItem(accountStorageKey(key), value),
    removeItem: (key: string) => localStorage.removeItem(accountStorageKey(key)),
};

export function createAccountStorage(storeName: string): LocalForage {
    const storage = localforage.createInstance({ name: accountDatabaseName(), storeName });
    // Track writes so switching accounts also flushes the debounced canvas save.
    return new Proxy(storage, {
        get(target, property) {
            const value = Reflect.get(target, property);
            if (typeof value !== "function") return value;
            if (!["setItem", "removeItem", "clear"].includes(String(property))) return value.bind(target);
            return (...args: unknown[]) => {
                const result = Promise.resolve(value.apply(target, args));
                pending.add(result);
                void result.then(
                    () => pending.delete(result),
                    () => pending.delete(result),
                );
                return result;
            };
        },
    });
}

export function registerAccountFlush(flush: () => unknown) {
    flushers.add(flush);
    return () => {
        flushers.delete(flush);
    };
}

export async function flushAccountStorage() {
    await Promise.allSettled([...flushers].map(async (flush) => flush()));
    while (pending.size) await Promise.allSettled([...pending]);
}
