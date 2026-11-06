import { initializeAccountStorage, flushAccountStorage } from "@/lib/account-storage";
import { restoreSession } from "@/services/api/new-api-auth";
import { useUserStore } from "@/stores/use-user-store";

// Persisted stores must not hydrate before the refresh cookie identifies the user.
async function bootstrap() {
    // Only React and styles preload here; account stores are imported after identity is bound.
    const app = import("./app");
    await restoreSession().catch(() => undefined);
    const owner = useUserStore.getState().user?.id ?? null;
    initializeAccountStorage(owner);
    let unmount: (() => void) | undefined;
    let switching = false;
    useUserStore.subscribe((state) => {
        if (switching || !["authenticated", "anonymous"].includes(state.phase) || (state.user?.id ?? null) === owner) return;
        switching = true;
        // Hide synchronously, before React can render the next account in the old stores.
        document.getElementById("root")!.style.visibility = "hidden";
        unmount?.();
        void flushAccountStorage().finally(() => window.location.reload());
    });
    window.addEventListener("pagehide", () => {
        void flushAccountStorage();
    });
    const { prepareApp } = await app;
    const mountApp = await prepareApp();
    if (!switching) unmount = mountApp();
}

void bootstrap();
