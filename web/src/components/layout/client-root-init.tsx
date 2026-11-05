import type { ReactNode } from "react";
import { useEffect } from "react";
import { usePromptSourceScheduler } from "@/hooks/use-prompt-source-scheduler";
import { AuthSession } from "./auth-session";
import { PlatformSession } from "./platform-session";

export function ClientRootInit({ children }: { children: ReactNode }) {
    usePromptSourceScheduler();
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const keys = ["baseUrl", "baseurl", "apiKey", "apikey"];
        if (!keys.some((key) => params.has(key))) return;
        keys.forEach((key) => params.delete(key));
        window.history.replaceState(null, "", `${window.location.pathname}${params.size ? `?${params}` : ""}${window.location.hash}`);
    }, []);
    return <><AuthSession /><PlatformSession />{children}</>;
}
