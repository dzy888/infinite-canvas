import React, { Suspense } from "react";
import { createRoot } from "react-dom/client";
import "antd/dist/reset.css";
import "streamdown/styles.css";
import "./styles/globals.css";
import { RouterProvider } from "react-router-dom";

import i18n from "@/i18n";

// Import stores only after bootstrap has bound their account database.
export async function prepareApp() {
    const [{ AppProviders }, { router }, { useConfigStore }, { usePromptSourceStore }, { initAnalytics }] = await Promise.all([
        import("@/components/layout/app-providers"),
        import("@/router"),
        import("@/stores/use-config-store"),
        import("@/stores/use-prompt-source-store"),
        import("@/lib/analytics"),
    ]);
    await Promise.all(
        [useConfigStore, usePromptSourceStore].map((store) => {
            if (!store.persist.hasHydrated()) return store.persist.rehydrate();
        }),
    );
    return function mountApp() {
        initAnalytics();
        document.body.style.fontFamily = '"SF Pro Display","SF Pro Text","PingFang SC","Microsoft YaHei","Helvetica Neue",sans-serif';
        const root = createRoot(document.getElementById("root")!);
        root.render(
            <React.StrictMode>
                <AppProviders>
                    <Suspense
                        fallback={
                            <div role="status" className="flex h-full min-h-40 items-center justify-center text-sm text-muted-foreground">
                                {i18n.t("common.loading")}
                            </div>
                        }
                    >
                        <RouterProvider router={router} />
                    </Suspense>
                </AppProviders>
            </React.StrictMode>,
        );
        return () => root.unmount();
    };
}
