import { useEffect } from "react";

import { restoreSession, watchAuthentication } from "@/services/api/new-api-auth";
import { useUserStore } from "@/stores/use-user-store";

export function AuthSession() {
    const expiresAt = useUserStore((state) => state.session?.access_expires_at);

    useEffect(() => watchAuthentication(), []);
    useEffect(() => {
        if (!expiresAt) return;
        const timer = window.setTimeout(
            () => {
                void restoreSession(true).catch(() => undefined);
            },
            Math.max(0, expiresAt * 1000 - Date.now()),
        );
        return () => window.clearTimeout(timer);
    }, [expiresAt]);

    return null;
}
