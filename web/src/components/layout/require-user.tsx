import { useEffect } from "react";
import { Button, Result, Spin } from "antd";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { restoreSession } from "@/services/api/new-api-auth";
import { useUserStore } from "@/stores/use-user-store";

export function RequireUser() {
    const { t } = useTranslation();
    const location = useLocation();
    const phase = useUserStore((state) => state.phase);
    const session = useUserStore((state) => state.session);
    const valid = session && session.access_expires_at * 1000 > Date.now();

    useEffect(() => {
        if (phase === "idle" || (phase === "authenticated" && !valid)) void restoreSession().catch(() => undefined);
    }, [phase, valid, location.key]);

    // Background refresh must not unmount an in-progress workbench. Server requests
    // still await restoreSession; only a confirmed anonymous identity leaves this route.
    if (session && phase !== "anonymous") return <Outlet />;
    if (phase === "anonymous") return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}${location.hash}` }} />;
    if (phase === "error") return <Result status="warning" title={t("auth.unavailable")} extra={<Button onClick={() => void restoreSession(true).catch(() => undefined)}>{t("auth.retry")}</Button>} />;
    return (
        <div className="grid h-full place-items-center" role="status" aria-label={t("auth.checking")}>
            <Spin size="large" />
        </div>
    );
}
