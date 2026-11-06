import { useEffect, useRef, useState } from "react";
import { Alert, Button, Form, Input, Spin } from "antd";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { AuthError, completePasswordReset, getLoginSettings, sendPasswordReset } from "@/services/api/new-api-auth";
import type { LoginSettings } from "@/types/auth";

export default function RecoveryPage({ resetting = false }: { resetting?: boolean }) {
    const { t } = useTranslation();
    const [settings, setSettings] = useState<LoginSettings | null>(null);
    const [error, setError] = useState("");
    const [sent, setSent] = useState(false);
    const [busy, setBusy] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const [turnstile, setTurnstile] = useState("");
    const [password, setPassword] = useState("");
    const [link] = useState(() => {
        const query = new URLSearchParams(window.location.search);
        return { email: query.get("email") || "", token: query.get("token") || "" };
    });
    const widget = useRef<TurnstileInstance>(null);
    useEffect(() => {
        if (resetting) {
            window.history.replaceState(window.history.state, "", window.location.pathname);
            return;
        }
        let active = true;
        void getLoginSettings()
            .then((value) => {
                if (active) {
                    setSettings(value);
                    setError("");
                }
            })
            .catch(() => {
                if (active) setError("auth.unavailable");
            });
        return () => {
            active = false;
        };
    }, [resetting, attempt]);
    const submit = async (values: { email?: string }) => {
        if (busy || (!resetting && (!settings || (settings.turnstile_check && !turnstile)))) return;
        setBusy(true);
        setError("");
        try {
            if (resetting) setPassword(await completePasswordReset(link.email, link.token));
            else {
                await sendPasswordReset(values.email || "", settings!, turnstile);
                setSent(true);
            }
        } catch (failure) {
            setError(failure instanceof AuthError ? failure.key : "auth.resetFailed");
        } finally {
            setBusy(false);
            setTurnstile("");
            widget.current?.reset();
        }
    };
    return (
        <main className="flex min-h-dvh items-center justify-center bg-background px-5 py-12 text-foreground">
            <section className="w-full max-w-md space-y-6">
                <Link to="/" className="inline-flex items-center gap-3 text-xl font-semibold">
                    <img src="/dmxvideo-logo.png" className="size-10 rounded-xl" alt="" />
                    DmxVideo
                </Link>
                <div>
                    <h1 className="text-3xl font-semibold tracking-tight">{t(resetting ? "auth.resetTitle" : "auth.forgotPassword")}</h1>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">{t(resetting ? "auth.resetDescription" : "auth.recoveryDescription")}</p>
                </div>
                {error ? <Alert type="error" showIcon title={t(error)} /> : null}
                {password ? (
                    <div className="space-y-4">
                        <Alert type="success" showIcon title={t("auth.resetComplete")} description={t("auth.resetSavePassword")} />
                        <Input.Password aria-label={t("auth.newPassword")} value={password} readOnly autoComplete="off" />
                        <Link to="/login">
                            <Button block type="primary" className="!mt-4">
                                {t("auth.signIn")}
                            </Button>
                        </Link>
                    </div>
                ) : resetting ? (
                    <Button type="primary" block loading={busy} disabled={!link.email || !link.token} onClick={() => void submit({})}>
                        {t("auth.confirmReset")}
                    </Button>
                ) : !settings ? (
                    error ? (
                        <Button onClick={() => setAttempt((value) => value + 1)}>{t("auth.retry")}</Button>
                    ) : (
                        <Spin />
                    )
                ) : (
                    <Form layout="vertical" onFinish={(values) => void submit(values)}>
                        {sent ? <Alert className="!mb-5" type="success" showIcon title={t("auth.resetSent")} /> : null}
                        <Form.Item name="email" label={t("auth.email")} rules={[{ required: true, type: "email", message: t("auth.emailRequired") }]}>
                            <Input size="large" autoComplete="email" disabled={busy} />
                        </Form.Item>
                        {settings.turnstile_check ? (
                            <div className="mb-5">
                                <Turnstile
                                    ref={widget}
                                    siteKey={settings.turnstile_site_key || ""}
                                    onSuccess={setTurnstile}
                                    onExpire={() => setTurnstile("")}
                                    onError={() => {
                                        setTurnstile("");
                                        setError("auth.captchaFailed");
                                    }}
                                    options={{ size: "flexible", theme: "auto" }}
                                />
                            </div>
                        ) : null}
                        <Button block type="primary" htmlType="submit" size="large" loading={busy} disabled={settings.turnstile_check && !turnstile}>
                            {t("auth.sendReset")}
                        </Button>
                    </Form>
                )}
                {!password ? (
                    <Link to="/login" className="block text-sm text-muted-foreground underline underline-offset-4">
                        {t("auth.restart")}
                    </Link>
                ) : null}
            </section>
        </main>
    );
}
