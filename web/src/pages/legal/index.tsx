import { useEffect, useState } from "react";
import { Alert, Button, Spin } from "antd";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Streamdown } from "streamdown";
import { publicDocument } from "@/services/api/new-api-auth";

export default function LegalPage() {
    const { t } = useTranslation();
    const privacy = useLocation().pathname === "/privacy-policy";
    const [content, setContent] = useState<string | null>(null);
    const [error, setError] = useState(false);
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        let active = true;
        setError(false);
        setContent(null);
        void publicDocument(privacy ? "privacy-policy" : "user-agreement")
            .then((value) => {
                if (active) setContent(value || "");
            })
            .catch(() => {
                if (active) setError(true);
            });
        return () => {
            active = false;
        };
    }, [privacy, attempt]);
    return (
        <main className="min-h-dvh bg-background px-5 py-12 text-foreground">
            <article className="mx-auto max-w-3xl">
                <Link to="/login" className="text-sm text-muted-foreground underline underline-offset-4">
                    {t("auth.restart")}
                </Link>
                <h1 className="mb-8 mt-6 text-3xl font-semibold">{t(privacy ? "auth.privacy" : "auth.terms")}</h1>
                {error ? (
                    <Alert type="error" showIcon title={t("auth.documentFailed")} action={<Button onClick={() => setAttempt((value) => value + 1)}>{t("auth.retry")}</Button>} />
                ) : content === null ? (
                    <Spin />
                ) : (
                    <div className="prose max-w-none dark:prose-invert">
                        <Streamdown mode="static">{content || t("auth.documentEmpty")}</Streamdown>
                    </div>
                )}
            </article>
        </main>
    );
}
