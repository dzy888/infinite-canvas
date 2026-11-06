import { lazy, Suspense, useEffect, useState } from "react";
import { Alert, Button, Spin } from "antd";
import { useUserStore } from "@/stores/use-user-store";
import { storyFetch } from "./transport";
import { closeStudioEventConnections } from "./inkos/lib/studio-events";
import { useTranslation } from "react-i18next";
import "./stories.css";
const loadWorkbench = () => import("./inkos/App").then((module) => ({ default: module.App }));
const Workbench = lazy(loadWorkbench);
export default function StoriesPage() {
    const token = useUserStore((s) => s.session?.access_token);
    const owner = useUserStore((s) => s.user?.id);
    const { i18n } = useTranslation();
    const [ready, setReady] = useState(false),
        [error, setError] = useState(""),
        [retry, setRetry] = useState(0);
    useEffect(() => {
        let active = true;
        if (!token || !owner) return;
        // Download the workbench while the server validates the session and starts its worker.
        void loadWorkbench().catch(() => undefined);
        async function connect() {
            try {
                const res = await storyFetch("/inkos-api/session", { method: "POST" });
                if (!res.ok) throw new Error();
                if (active) {
                    setReady(true);
                    setError("");
                }
            } catch {
                if (active) setError(i18n.language.startsWith("zh") ? "暂时无法连接故事服务，请确认故事服务已启动。" : "Story service unavailable. Please start it and retry.");
            }
        }
        void connect();
        return () => {
            active = false;
        };
    }, [token, owner, retry]);
    useEffect(() => () => closeStudioEventConnections(), []);
    return (
        <div className="relative h-full min-h-0">
            {error ? (
                <div className="mx-auto max-w-xl p-6">
                    <Alert type="error" title={error} action={<Button onClick={() => setRetry((v) => v + 1)}>{i18n.language.startsWith("zh") ? "重试" : "Retry"}</Button>} />
                </div>
            ) : ready ? (
                <Suspense
                    fallback={
                        <div className="flex h-full items-center justify-center">
                            <Spin />
                        </div>
                    }
                >
                    <Workbench key={owner} />
                </Suspense>
            ) : (
                <div className="flex h-full items-center justify-center">
                    <Spin />
                </div>
            )}
        </div>
    );
}
