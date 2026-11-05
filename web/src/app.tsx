import React from "react";
import { createRoot } from "react-dom/client";
import "antd/dist/reset.css";
import "streamdown/styles.css";
import "./styles/globals.css";
import { RouterProvider } from "react-router-dom";

import { AppProviders } from "@/components/layout/app-providers";
import "@/i18n";
import { initAnalytics } from "@/lib/analytics";
import { router } from "@/router";
import { useConfigStore } from "@/stores/use-config-store";
import { usePromptSourceStore } from "@/stores/use-prompt-source-store";

// These settings were synchronous before account storage moved to IndexedDB.
// Restore them before effects can save defaults or start scheduled source fetches.
export async function prepareApp() {
    await Promise.all(
        [useConfigStore, usePromptSourceStore].map((store) => {
            if (!store.persist.hasHydrated()) return store.persist.rehydrate();
        }),
    );
}

export function mountApp() {
    initAnalytics();

    document.body.style.fontFamily = '"SF Pro Display","SF Pro Text","PingFang SC","Microsoft YaHei","Helvetica Neue",sans-serif';

    const root = createRoot(document.getElementById("root")!);
    root.render(
        <React.StrictMode>
            <AppProviders>
                <RouterProvider router={router} />
            </AppProviders>
        </React.StrictMode>,
    );

    return () => root.unmount();
}
