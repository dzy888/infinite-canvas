import { useMemo, useState } from "react";
import { Alert, Button, Empty, Input, Modal, Segmented, Skeleton, Tag } from "antd";
import { ArrowUpRight, RefreshCw, Search } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { usePlatformStore } from "@/stores/use-platform-store";
import { useUserStore } from "@/stores/use-user-store";
import { encodeChannelModel, useConfigStore, type ModelCapability } from "@/stores/use-config-store";
import { formatQuota, type PricingModel } from "@/services/api/new-api-platform";
import { pricingRows } from "@/lib/new-api-pricing";

export default function PricingPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { models, pricing, quotaSettings, loading, error } = usePlatformStore();
    const owner = useUserStore((state) => state.user?.id);
    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState("all");
    const [selected, setSelected] = useState<string | null>(null);
    const visible = useMemo(
        () => models.filter((model) => (filter === "all" || model.capabilities.includes(filter as ModelCapability)) && (model.name + " " + (model.description || "")).toLowerCase().includes(search.trim().toLowerCase())),
        [models, filter, search],
    );
    const detail = models.find((model) => model.name === selected);
    const details = pricing?.data.find((item) => item.model_name === selected);
    // Like New API, model prices use currency even when balances are shown as tokens.
    const pricingSettings = { ...quotaSettings, quota_per_unit: quotaSettings?.quota_per_unit || 500000, quota_display_type: quotaSettings?.quota_display_type === "TOKENS" ? "USD" : quotaSettings?.quota_display_type || "USD" };
    const price = (value: number, ratio: number) => (Number.isFinite(value) && Number.isFinite(ratio) ? formatQuota(value * ratio * pricingSettings.quota_per_unit, pricingSettings, 6) : "—");
    const useModel = (name: string, capability: ModelCapability) => {
        const store = useConfigStore.getState();
        store.updateConfig(({ image: "imageModel", video: "videoModel", text: "textModel", audio: "audioModel" } as const)[capability], encodeChannelModel("platform", name));
        navigate(capability === "image" ? "/image" : capability === "video" ? "/video" : "/canvas");
    };
    const renderPrices = (model: PricingModel, ratio: number) => {
        const parsed = pricingRows(model);
        return (
            <div className="space-y-5">
                {parsed.special ? (
                    <Alert type="info" showIcon title={t("market.dynamicPrice")} description={t("market.dynamicHint")} />
                ) : (
                    parsed.rows.map((row, index) => (
                        <div key={index} className="rounded-xl border border-border p-4">
                            <p className="mb-1 font-medium">{row.label || t("market.basePrice")}</p>
                            <p className="mb-4 break-words font-mono text-xs text-muted-foreground">{row.condition.replace(/\b(len|p|c)\b/g, (key) => t("market.fields." + key)) || t(index ? "market.otherConditions" : "market.defaultCondition")}</p>
                            <dl className="grid gap-3 sm:grid-cols-2">
                                {row.prices.map((item) => (
                                    <div key={item.key} className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-sm">
                                        <dt className="text-muted-foreground">{t("market.fields." + item.key, { defaultValue: item.key })}</dt>
                                        <dd className="font-mono tabular-nums">
                                            {price(item.value, ratio)}
                                            <span className="ml-1 text-xs text-muted-foreground">/ {t("market.units." + item.unit)}</span>
                                        </dd>
                                    </div>
                                ))}
                            </dl>
                        </div>
                    ))
                )}
                {parsed.rules.length ? (
                    <div>
                        <p className="mb-2 text-sm font-medium">{t("market.extraRules")}</p>
                        {parsed.rules.map((rule) => (
                            <p key={rule} className="break-words font-mono text-xs leading-6 text-muted-foreground">
                                {rule}
                            </p>
                        ))}
                    </div>
                ) : null}
            </div>
        );
    };
    return (
        <main className="h-full overflow-y-auto bg-background">
            <div className="mx-auto max-w-6xl space-y-7 px-5 py-8 md:px-10 md:py-12">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <p className="mb-2 font-mono text-xs tracking-[0.2em] text-muted-foreground">DMXVIDEO / MODELS</p>
                        <h1 className="text-3xl font-bold tracking-tight">{t("navigation.pricing")}</h1>
                        <p className="mt-3 text-sm text-muted-foreground">{t("market.description")}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Link to="/account?tab=wallet">
                            <Button type="text">{t("wallet.title")}</Button>
                        </Link>
                        <Button icon={<RefreshCw size={15} />} loading={loading} onClick={() => owner && void usePlatformStore.getState().load(owner)}>
                            {t("platform.refresh")}
                        </Button>
                    </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <Segmented
                        value={filter}
                        onChange={(value) => setFilter(String(value))}
                        options={["all", "text", "image", "video", "audio"].map((value) => ({ value, label: t(value === "all" ? "common.all" : "settingsPanels.model.capabilities." + value) }))}
                    />
                    <Input className="!w-72 max-w-full" prefix={<Search size={15} />} placeholder={t("market.search")} value={search} onChange={(event) => setSearch(event.target.value)} allowClear />
                </div>
                {error ? <Alert type="error" showIcon title={t(error)} /> : null}
                {loading && !pricing ? (
                    <Skeleton active />
                ) : visible.length ? (
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {visible.map((model) => {
                            const entry = pricing?.data.find((item) => item.model_name === model.name);
                            const variants = entry?.billing_plugin_variants;
                            const parsed = entry && !variants?.length ? pricingRows(entry) : null;
                            return (
                                <article key={model.name} className="flex min-w-0 flex-col rounded-2xl border border-border p-6 transition-colors hover:border-foreground/30">
                                    <div className="mb-4 flex flex-wrap gap-1">
                                        {model.capabilities.map((capability) => (
                                            <Tag key={capability}>{t("settingsPanels.model.capabilities." + capability)}</Tag>
                                        ))}
                                        {parsed && parsed.rows.length > 1 ? <Tag color="green">{t("market.tiered")}</Tag> : null}
                                    </div>
                                    <h2 className="break-all text-lg font-semibold tracking-tight">{model.name}</h2>
                                    <p className="mt-2 line-clamp-2 min-h-10 text-sm leading-5 text-muted-foreground">{model.description || t("market.ready")}</p>
                                    <div className="my-5 space-y-2 border-y border-border py-4">
                                        {parsed && !parsed.special ? (
                                            <>
                                                {parsed.rows[0]?.prices.slice(0, 2).map((item) => (
                                                    <div key={item.key} className="flex flex-wrap justify-between gap-2 text-sm">
                                                        <span className="text-muted-foreground">{t("market.fields." + item.key, { defaultValue: item.key })}</span>
                                                        <span className="font-mono tabular-nums">
                                                            {price(item.value, model.group_ratio)} <span className="text-xs text-muted-foreground">/ {t("market.units." + item.unit)}</span>
                                                        </span>
                                                    </div>
                                                ))}
                                                {parsed.rows.length > 1 ? <p className="text-xs text-muted-foreground">{t("market.tierHint")}</p> : null}
                                            </>
                                        ) : (
                                            <p className="text-sm text-muted-foreground">{t(variants?.length ? "market.providerPrice" : "market.dynamicPrice")}</p>
                                        )}
                                    </div>
                                    <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
                                        <Button type="text" onClick={() => setSelected(model.name)}>
                                            {t("market.details")}
                                        </Button>
                                        <div className="flex flex-wrap gap-1">
                                            {model.capabilities.map((capability) => (
                                                <Button key={capability} type="text" icon={<ArrowUpRight size={14} />} onClick={() => useModel(model.name, capability)}>
                                                    {t("market.use." + capability)}
                                                </Button>
                                            ))}
                                        </div>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                ) : (
                    <Empty description={t(models.length ? "market.noResults" : "platform.noModels")} />
                )}
                <p className="text-xs leading-6 text-muted-foreground">{t("market.settlementHint")}</p>
            </div>
            <Modal open={!!detail && !!details} title={detail?.name} onCancel={() => setSelected(null)} footer={null} width={760}>
                {detail && details ? (
                    <div className="max-h-[65vh] space-y-5 overflow-y-auto py-3">
                        {details.billing_plugin_variants?.length
                            ? details.billing_plugin_variants.map((variant) => (
                                  <section key={variant.plugin_key}>
                                      <p className="mb-3 font-medium">{variant.plugin_name}</p>
                                      {renderPrices({ ...details, ...variant, billing_mode: variant.billing_mode || details.billing_mode }, detail.group_ratio)}
                                  </section>
                              ))
                            : renderPrices(details, detail.group_ratio)}
                        <p className="text-xs leading-6 text-muted-foreground">{t("market.settlementHint")}</p>
                    </div>
                ) : null}
            </Modal>
        </main>
    );
}
