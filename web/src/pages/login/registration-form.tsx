import { useRef, useState } from "react";
import { Alert, Button, Checkbox, Form, Input } from "antd";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowUpRight } from "lucide-react";

import { AuthError, registerAccount, sendRegistrationCode, type Registration } from "@/services/api/new-api-auth";
import type { LoginSettings } from "@/types/auth";
import styles from "./login.module.css";

export function RegistrationForm({ settings, destination }: { settings: LoginSettings; destination: string }) {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [form] = Form.useForm<Registration & { confirmPassword: string }>();
    const [busy, setBusy] = useState(false);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState("");
    const [sent, setSent] = useState(false);
    const [agreed, setAgreed] = useState(false);
    const [turnstile, setTurnstile] = useState("");
    const widget = useRef<TurnstileInstance>(null);
    const needsConsent = settings.user_agreement_enabled || settings.privacy_policy_enabled;
    const ready = (!needsConsent || agreed) && (!settings.turnstile_check || !!turnstile);
    const resetCaptcha = () => {
        setTurnstile("");
        widget.current?.reset();
    };
    const submit = async (values: Registration) => {
        if (!ready || busy || sending) return;
        setBusy(true);
        setError("");
        try {
            await registerAccount(values, settings, turnstile);
            form.resetFields();
            navigate("/login", { replace: true, state: { from: destination, registered: true } });
        } catch (failure) {
            setError(failure instanceof AuthError ? failure.key : "auth.registrationFailed");
        } finally {
            setBusy(false);
            resetCaptcha();
        }
    };
    const sendCode = async () => {
        if (!ready || busy || sending) return;
        try {
            await form.validateFields(["email"]);
        } catch {
            return;
        }
        setSending(true);
        setError("");
        setSent(false);
        try {
            await sendRegistrationCode(form.getFieldValue("email") || "", settings, turnstile);
            setSent(true);
        } catch (failure) {
            setError(failure instanceof AuthError ? failure.key : "auth.emailCodeFailed");
        } finally {
            setSending(false);
            resetCaptcha();
        }
    };

    return (
        <>
            {!settings.register_enabled || !settings.password_register_enabled ? (
                <>
                    <Alert type="warning" showIcon title={t("auth.registrationDisabled")} />
                </>
            ) : (
                <Form form={form} layout="vertical" onFinish={submit} requiredMark={false} disabled={busy || sending}>
                    {error ? <Alert className="!mb-5" type="error" showIcon title={t(error)} /> : null}
                    {sent ? <Alert className="!mb-5" type="success" showIcon title={t("auth.emailCodeSent")} /> : null}
                    <Form.Item name="username" label={t("auth.registerUsername")} rules={[{ required: true, whitespace: true, max: 20, message: t("auth.registerUsernameRule") }]}>
                        <Input size="large" autoComplete="username" placeholder={t("auth.registerUsername")} />
                    </Form.Item>
                    <Form.Item name="password" label={t("auth.password")} rules={[{ required: true, min: 8, max: 128, message: t("auth.registerPasswordRule") }]}>
                        <Input.Password size="large" autoComplete="new-password" placeholder={t("auth.registerPasswordRule")} />
                    </Form.Item>
                    <Form.Item
                        name="confirmPassword"
                        label={t("auth.confirmPassword")}
                        dependencies={["password"]}
                        rules={[
                            { required: true, message: t("auth.confirmPassword") },
                            ({ getFieldValue }) => ({ validator: (_, value) => (!value || getFieldValue("password") === value ? Promise.resolve() : Promise.reject(new Error(t("auth.passwordMismatch")))) }),
                        ]}
                    >
                        <Input.Password size="large" autoComplete="new-password" placeholder={t("auth.confirmPassword")} />
                    </Form.Item>
                    {settings.email_verification ? (
                        <>
                            <Form.Item name="email" label={t("auth.email")} rules={[{ required: true, type: "email", message: t("auth.emailRequired") }]}>
                                <Input size="large" type="email" autoComplete="email" onChange={() => setSent(false)} />
                            </Form.Item>
                            <div className="mb-5 flex items-start gap-2">
                                <Form.Item className="!mb-0 min-w-0 flex-1" name="verification_code" label={t("auth.emailCode")} rules={[{ required: true, whitespace: true, message: t("auth.emailCodeRequired") }]}>
                                    <Input size="large" autoComplete="one-time-code" />
                                </Form.Item>
                                <Button className="!mt-[30px]" size="large" loading={sending} disabled={busy || sending || !ready} onClick={() => void sendCode()}>
                                    {t("auth.sendEmailCode")}
                                </Button>
                            </div>
                        </>
                    ) : null}
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
                    {needsConsent ? (
                        <div className={styles.consent}>
                            <Checkbox checked={agreed} onChange={(event) => setAgreed(event.target.checked)}>
                                {t("auth.consent")}
                            </Checkbox>
                            <span>
                                {settings.user_agreement_enabled ? (
                                    <a href="/terms-of-service" target="_blank" rel="noopener noreferrer">
                                        {t("auth.terms")}
                                    </a>
                                ) : null}
                                {settings.privacy_policy_enabled ? (
                                    <a href="/privacy-policy" target="_blank" rel="noopener noreferrer">
                                        {t("auth.privacy")}
                                    </a>
                                ) : null}
                            </span>
                        </div>
                    ) : null}
                    <Button type="primary" size="large" htmlType="submit" block loading={busy} disabled={!ready || sending} icon={<ArrowUpRight size={17} />} iconPlacement="end">
                        {t("auth.register")}
                    </Button>
                </Form>
            )}
            <div className={styles.links}>
                <Link to="/login" state={{ from: destination }}>
                    {t("auth.alreadyRegistered")}
                </Link>
            </div>
            <p className={styles.localNote}>{t("auth.localData")}</p>
        </>
    );
}
