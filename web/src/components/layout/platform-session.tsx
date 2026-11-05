import { useEffect } from "react";
import { Alert, Button } from "antd";
import { useTranslation } from "react-i18next";
import { useUserStore } from "@/stores/use-user-store";
import { usePlatformStore } from "@/stores/use-platform-store";

export function PlatformSession() {
    const owner = useUserStore((state) => state.user?.id);
    useEffect(() => {
        const store = usePlatformStore.getState();
        store.reset();
        if (!owner) return;
        void store.load(owner);
        const refresh = () => void usePlatformStore.getState().load(owner);
        window.addEventListener("focus", refresh);
        return () => {
            window.removeEventListener("focus", refresh);
            usePlatformStore.getState().reset();
        };
    }, [owner]);
    return null;
}

export function PlatformStatus() {
    const { t } = useTranslation();
    const owner = useUserStore((state) => state.user?.id);
    const { error, loading } = usePlatformStore();
    if (!owner || !error) return null;
    return (
        <Alert
            className="!rounded-none"
            type="warning"
            showIcon
            title={t(error)}
            action={
                <Button size="small" loading={loading} onClick={() => void usePlatformStore.getState().load(owner)}>
                    {t("platform.refresh")}
                </Button>
            }
        />
    );
}
