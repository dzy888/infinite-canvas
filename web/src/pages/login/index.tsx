import { useEffect, useRef, useState } from "react";
import { Alert, Button, Checkbox, Form, Input, Spin } from "antd";
import { ArrowLeft, ArrowUpRight, KeyRound } from "lucide-react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";

import { NEW_API_CONSOLE_URL } from "@/constant/runtime-config";
import { AuthError, getLoginSettings, restoreSession, safeReturnPath, signIn, signInWithPasskey, verifyLogin } from "@/services/api/new-api-auth";
import { useUserStore } from "@/stores/use-user-store";
import { ImageCaptcha, type ImageCaptchaHandle } from "./image-captcha";
import type { ImageVerification, LoginChallenge, LoginSettings } from "@/types/auth";
import styles from "./login.module.css";

export default function LoginPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const location = useLocation();
    const user = useUserStore((state) => state.user);
    const [settings, setSettings] = useState<LoginSettings | null>(null);
    const [checking, setChecking] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [challenge, setChallenge] = useState<LoginChallenge | null>(null);
    const [turnstile, setTurnstile] = useState("");
    const [imageVerification, setImageVerification] = useState<ImageVerification>({ id: "", code: "" });
    const imageCaptcha = useRef<ImageCaptchaHandle>(null);
    const [agreed, setAgreed] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const [form] = Form.useForm<{ username: string; password: string; code: string }>();
    const widget = useRef<TurnstileInstance>(null);
    const destination = safeReturnPath((location.state as { from?: unknown } | null)?.from);

    useEffect(() => {
        let cancelled = false;
        setChecking(true);
        setError("");
        void Promise.all([getLoginSettings(), restoreSession(true)])
            .then(([next]) => {
                if (!cancelled) setSettings(next);
            })
            .catch(() => {
                if (!cancelled) setError("auth.unavailable");
            })
            .finally(() => {
                if (!cancelled) setChecking(false);
            });
        return () => {
            cancelled = true;
        };
    }, [attempt]);

    useEffect(() => {
        if (!settings || settings.initialized) return;
        let active = true;
        const recheck = () => {
            void getLoginSettings()
                .then((next) => {
                    if (active) setSettings(next);
                })
                .catch(() => {
                    if (active) setError("auth.unavailable");
                });
        };
        window.addEventListener("focus", recheck);
        return () => {
            active = false;
            window.removeEventListener("focus", recheck);
        };
    }, [settings?.initialized]);

    if (user) return <Navigate to={destination} replace />;
    const needsConsent = settings?.user_agreement_enabled || settings?.privacy_policy_enabled;
    const disabled = busy || !!(needsConsent && !agreed);
    const canVerifyCode = challenge?.methods.some((method) => method.method === "2fa" && method.available);
    const canUsePasskey = challenge ? challenge.methods.some((method) => method.method === "passkey" && method.available) : settings?.passkey_login;
    const passkeySupported = typeof PublicKeyCredential !== "undefined" && window.isSecureContext;
    const submit = async (values: { username: string; password: string; code: string }) => {
        if (!settings || disabled) return;
        setBusy(true);
        setError("");
        try {
            if (challenge) {
                await verifyLogin(challenge, values.code);
                navigate(destination, { replace: true });
            } else {
                const result = await signIn(values.username.trim(), values.password, settings, turnstile, imageVerification);
                form.resetFields(["password"]);
                if ("require_verification" in result) setChallenge(result);
                else navigate(destination, { replace: true });
            }
        } catch (failure) {
            setError(failure instanceof AuthError ? failure.key : "auth.loginFailed");
        } finally {
            setBusy(false);
            setTurnstile("");
            widget.current?.reset();
            if (!challenge && settings.login_captcha_mode === "image") void imageCaptcha.current?.reload();
        }
    };
    const passkey = async () => {
        setBusy(true);
        setError("");
        try {
            await signInWithPasskey(challenge || undefined);
            navigate(destination, { replace: true });
        } catch (failure) {
            setError(failure instanceof AuthError ? failure.key : "auth.passkeyFailed");
        } finally {
            setBusy(false);
        }
    };

    return (
        <main className={styles.page}>
            <header className={styles.header}>
                <Link to="/" className={styles.brand}>
                    <img src="/dmxvideo-logo.png" alt="" />
                    DmxVideo
                </Link>
                <Link to="/">
                    <ArrowLeft size={15} />
                    {t("auth.backHome")}
                </Link>
            </header>
            <section className={styles.content}>
                <div className={styles.intro}>
                    <p className={styles.kicker}>DMXVIDEO / YOUR CREATIVE SPACE</p>
                    <h1>
                        {t("auth.welcome")}
                        <br />
                        <span>{t("auth.welcomeAccent")}</span>
                    </h1>
                    <p>{t("auth.sharedAccount")}</p>
                    <div className={styles.mark} aria-hidden="true">
                        <img src="/dmxvideo-logo.png" alt="" />
                        <i />
                        <i />
                    </div>
                    <span className={styles.credit}>Powered by New API · Infinite Canvas</span>
                </div>
                <div className={styles.form}>
                    <p className={styles.kicker}>{challenge ? "02 / VERIFICATION" : "01 / SIGN IN"}</p>
                    <h2>{t(challenge ? "auth.verifyTitle" : "auth.signIn")}</h2>
                    <p className={styles.description}>{t(challenge ? "auth.verifyDescription" : "auth.loginDescription")}</p>
                    {checking ? (
                        <div className={styles.loading} role="status" aria-label={t("auth.checking")}>
                            <Spin />
                        </div>
                    ) : (
                        <>
                            {error ? <Alert type="error" showIcon title={t(error)} className="!mb-5" /> : null}
                            {!settings ? (
                                <Button onClick={() => setAttempt((current) => current + 1)}>{t("auth.retry")}</Button>
                            ) : !settings.initialized ? (
                                <>
                                    <Alert type="warning" showIcon title={t("auth.setupRequired")} />
                                    {NEW_API_CONSOLE_URL ? (
                                        <Button className="!mt-5" href={`${NEW_API_CONSOLE_URL}/setup`} target="_blank" rel="noopener noreferrer" icon={<ArrowUpRight size={16} />}>
                                            {t("auth.openSetup")}
                                        </Button>
                                    ) : null}
                                    <Button className="!mt-5 !ml-3" onClick={() => setAttempt((current) => current + 1)}>
                                        {t("auth.retry")}
                                    </Button>
                                </>
                            ) : (
                                <>
                                    <Form form={form} layout="vertical" onFinish={submit} requiredMark={false} disabled={busy}>
                                        {challenge ? (
                                            canVerifyCode ? (
                                                <Form.Item name="code" label={t("auth.code")} rules={[{ required: true, whitespace: true, message: t("auth.codeRequired") }]}>
                                                    <Input size="large" autoComplete="one-time-code" placeholder={t("auth.codePlaceholder")} autoFocus />
                                                </Form.Item>
                                            ) : null
                                        ) : settings.password_login_enabled ? (
                                            <>
                                                <Form.Item name="username" label={t("auth.username")} rules={[{ required: true, whitespace: true, message: t("auth.usernameRequired") }]}>
                                                    <Input size="large" autoComplete="username" placeholder={t("auth.usernamePlaceholder")} />
                                                </Form.Item>
                                                <Form.Item name="password" label={t("auth.password")} rules={[{ required: true, message: t("auth.passwordRequired") }]}>
                                                    <Input.Password size="large" autoComplete="current-password" placeholder={t("auth.passwordPlaceholder")} />
                                                </Form.Item>
                                                {settings.login_captcha_mode === "image" ? <ImageCaptcha ref={imageCaptcha} onChange={setImageVerification} /> : null}
                                                {settings.login_captcha_mode === "turnstile" ? (
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
                                            </>
                                        ) : (
                                            <Alert type="warning" showIcon title={t("auth.passwordDisabled")} className="!mb-5" />
                                        )}
                                        {!challenge && needsConsent ? (
                                            <div className={styles.consent}>
                                                <Checkbox checked={agreed} onChange={(event) => setAgreed(event.target.checked)}>
                                                    {t("auth.consent")}
                                                </Checkbox>
                                                {NEW_API_CONSOLE_URL ? (
                                                    <span>
                                                        {settings.user_agreement_enabled ? (
                                                            <a href={`${NEW_API_CONSOLE_URL}/terms-of-service`} target="_blank" rel="noopener noreferrer">
                                                                {t("auth.terms")}
                                                            </a>
                                                        ) : null}
                                                        {settings.privacy_policy_enabled ? (
                                                            <a href={`${NEW_API_CONSOLE_URL}/privacy-policy`} target="_blank" rel="noopener noreferrer">
                                                                {t("auth.privacy")}
                                                            </a>
                                                        ) : null}
                                                    </span>
                                                ) : null}
                                            </div>
                                        ) : null}
                                        {(challenge ? canVerifyCode : settings.password_login_enabled) ? (
                                            <Button
                                                type="primary"
                                                size="large"
                                                htmlType="submit"
                                                block
                                                loading={busy}
                                                disabled={disabled || (!challenge && (settings.login_captcha_mode === "turnstile" ? !turnstile : !imageVerification.id || !imageVerification.code.trim()))}
                                                icon={<ArrowUpRight size={17} />}
                                                iconPlacement="end"
                                            >
                                                {t(challenge ? "auth.verify" : "auth.signIn")}
                                            </Button>
                                        ) : null}
                                    </Form>
                                    {canUsePasskey ? (
                                        <Button size="large" block className="!mt-3" icon={<KeyRound size={16} />} disabled={disabled || !passkeySupported} onClick={() => void passkey()}>
                                            {t("auth.passkey")}
                                        </Button>
                                    ) : null}
                                    {challenge ? (
                                        <Button
                                            type="link"
                                            block
                                            className="!mt-3"
                                            disabled={busy}
                                            onClick={() => {
                                                setChallenge(null);
                                                setError("");
                                                form.resetFields();
                                            }}
                                        >
                                            {t("auth.restart")}
                                        </Button>
                                    ) : null}
                                    {NEW_API_CONSOLE_URL ? (
                                        <div className={styles.links}>
                                            <a href={`${NEW_API_CONSOLE_URL}/sign-in`} target="_blank" rel="noopener noreferrer">
                                                {t("auth.otherMethods")}
                                                <ArrowUpRight size={13} />
                                            </a>
                                            {settings.register_enabled ? (
                                                <a href={`${NEW_API_CONSOLE_URL}/sign-up`} target="_blank" rel="noopener noreferrer">
                                                    {t("auth.register")}
                                                </a>
                                            ) : null}
                                        </div>
                                    ) : null}
                                    <p className={styles.localNote}>{t("auth.localData")}</p>
                                </>
                            )}
                        </>
                    )}
                </div>
            </section>
        </main>
    );
}
