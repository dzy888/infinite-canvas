import { Alert, Button } from "antd";
import { ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NEW_API_CONSOLE_URL } from "@/constant/runtime-config";
import { useThemeStore } from "@/stores/use-theme-store";

export default function PricingPage() {
    const { t, i18n } = useTranslation();
    const theme = useThemeStore((state) => state.theme);
    const query = new URLSearchParams({ embed: "dmxvideo", theme, lang: i18n.language.startsWith("zh") ? "zhCN" : "en" });
    if (!NEW_API_CONSOLE_URL)
        return (
            <div className="mx-auto max-w-3xl p-8">
                <Alert type="info" showIcon title={t("platform.consoleNotConfigured")} />
            </div>
        );
    const url = `${NEW_API_CONSOLE_URL}/pricing?${query}`;
    return (
        <section className="flex h-full min-h-0 flex-col bg-background">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-2 text-xs text-muted-foreground sm:px-8">
                <span>{t("platform.pricingSource")}</span>
                <Button type="text" size="small" href={url} target="_blank" rel="noopener noreferrer" icon={<ExternalLink size={13} />}>
                    {t("platform.openPricing")}
                </Button>
            </div>
            <iframe key={`${theme}:${i18n.language}`} src={url} title={t("navigation.pricing")} className="min-h-0 w-full flex-1 border-0" referrerPolicy="strict-origin-when-cross-origin" />
        </section>
    );
}
