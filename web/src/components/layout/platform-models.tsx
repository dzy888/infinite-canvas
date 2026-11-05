import { Button, Empty, Spin, Tag } from "antd";
import { RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { useConfigStore } from "@/stores/use-config-store";
import { useTranslation } from "react-i18next";
import { usePlatformStore } from "@/stores/use-platform-store";
import { useUserStore } from "@/stores/use-user-store";

export function PlatformModels() {
    const { t } = useTranslation();
    const { models, loading, error } = usePlatformStore();
    const owner = useUserStore((state) => state.user?.id);
    return (
        <div>
            <div className="mb-5 flex items-center justify-between gap-4">
                <p className="text-sm text-muted-foreground">{t("platform.modelsDescription")}</p>
                <Link to="/pricing" onClick={() => useConfigStore.getState().setConfigDialogOpen(false)} className="shrink-0 text-sm text-foreground underline underline-offset-4">
                    {t("platform.viewPricing")}
                </Link>
                <Button icon={<RefreshCw size={14} />} loading={loading} onClick={() => owner && void usePlatformStore.getState().load(owner)}>
                    {t("platform.refresh")}
                </Button>
            </div>
            {error ? <p className="mb-4 text-red-500">{t(error)}</p> : null}
            {loading && !models.length ? (
                <div className="py-12 text-center">
                    <Spin />
                </div>
            ) : models.length ? (
                <div className="grid gap-3 sm:grid-cols-2">
                    {models.map((model) => (
                        <div key={model.name} className="rounded-xl border border-border bg-background p-4">
                            <div className="flex items-start justify-between gap-3">
                                <span className="min-w-0 break-words font-semibold">{model.name}</span>
                                <Tag title={t("platform.groupMultiplier")} className="!m-0 shrink-0" color="green">
                                    ×{model.group_ratio}
                                </Tag>
                            </div>
                            <div className="mt-3 flex gap-2">
                                {model.capabilities.map((capability) => (
                                    <span className="text-xs text-muted-foreground" key={capability}>
                                        {t(`settingsPanels.model.capabilities.${capability}`)}
                                    </span>
                                ))}
                            </div>
                            {model.description ? <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{model.description}</p> : null}
                        </div>
                    ))}
                </div>
            ) : (
                <Empty description={t("platform.noModels")} />
            )}
        </div>
    );
}
