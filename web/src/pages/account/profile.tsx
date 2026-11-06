import { useEffect, useState } from "react";
import { Alert, App, Button, Form, Input, Popconfirm, Skeleton, Table, Tag } from "antd";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import dayjs from "dayjs";
import { platformRequest } from "@/services/api/new-api-platform";
import { AuthError } from "@/services/api/new-api-auth";
import { usePlatformStore } from "@/stores/use-platform-store";
import { useUserStore } from "@/stores/use-user-store";

type LoginSession = { sid: string; current: boolean; user_agent: string; ip: string; created_at: number; last_active_at: number };
export function Profile() {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const account = usePlatformStore((state) => state.account);
    const owner = useUserStore((state) => state.user?.id);
    const [form] = Form.useForm<{ display_name: string }>();
    const [sessions, setSessions] = useState<LoginSession[]>([]);
    const [loading, setLoading] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(false);
    const [refresh, setRefresh] = useState(0);
    useEffect(() => {
        form.setFieldsValue({ display_name: account?.display_name || "" });
    }, [account?.display_name, form]);
    useEffect(() => {
        let active = true;
        setLoading(true);
        setError(false);
        void platformRequest<LoginSession[]>("/user/sessions")
            .then((next) => {
                if (active) setSessions(next);
            })
            .catch(() => {
                if (active) setError(true);
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [owner, refresh]);
    const save = async ({ display_name }: { display_name: string }) => {
        if (!account || busy) return;
        setBusy(true);
        try {
            await platformRequest("/user/self", false, { method: "PUT", body: { username: account.username, display_name: display_name.trim() } });
            const session = useUserStore.getState().session;
            if (session && session.user.id === owner) useUserStore.getState().setSession({ ...session, user: { ...session.user, display_name: display_name.trim() } });
            if (owner) await usePlatformStore.getState().load(owner);
            message.success(t("profile.saved"));
        } catch (failure) {
            message.error(t(failure instanceof AuthError ? failure.key : "platform.operationFailed"));
        } finally {
            setBusy(false);
        }
    };
    const revoke = async (sid?: string) => {
        if (busy) return;
        setBusy(true);
        try {
            await platformRequest(sid ? "/user/sessions/" + encodeURIComponent(sid) : "/user/sessions/revoke-others", false, { method: sid ? "DELETE" : "POST", ...(sid ? {} : { body: {} }) });
            setRefresh((value) => value + 1);
            message.success(t("profile.revoked"));
        } catch (failure) {
            message.error(t(failure instanceof AuthError ? failure.key : "platform.operationFailed"));
        } finally {
            setBusy(false);
        }
    };
    return (
        <div className="space-y-8">
            <section className="max-w-xl rounded-2xl border border-border p-6">
                <h2 className="mb-5 text-xl font-semibold">{t("profile.title")}</h2>
                {!account ? (
                    <Skeleton active />
                ) : (
                    <Form form={form} layout="vertical" onFinish={(values) => void save(values)}>
                        <Form.Item label={t("auth.registerUsername")}>
                            <Input value={account.username} readOnly />
                        </Form.Item>
                        <Form.Item name="display_name" label={t("profile.displayName")} rules={[{ max: 20, message: t("profile.nameRule") }]}>
                            <Input autoComplete="nickname" disabled={busy} />
                        </Form.Item>
                        <Form.Item label={t("auth.email")}>
                            <Input value={account.email || t("profile.noEmail")} readOnly />
                        </Form.Item>
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <Button htmlType="submit" type="primary" loading={busy}>
                                {t("common.save")}
                            </Button>
                            <Link to="/forgot-password" className="text-sm text-muted-foreground underline underline-offset-4">
                                {t("auth.forgotPassword")}
                            </Link>
                        </div>
                    </Form>
                )}
            </section>
            <section>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-xl font-semibold">{t("profile.sessions")}</h2>
                    <Popconfirm title={t("profile.revokeConfirm")} onConfirm={() => revoke()}>
                        <Button disabled={busy || loading || !sessions.some((session) => !session.current)}>{t("profile.revokeOthers")}</Button>
                    </Popconfirm>
                </div>
                {error ? <Alert type="error" showIcon className="!mb-4" title={t("profile.sessionsFailed")} action={<Button onClick={() => setRefresh((value) => value + 1)}>{t("platform.refresh")}</Button>} /> : null}
                <Table<LoginSession>
                    rowKey="sid"
                    loading={loading}
                    dataSource={sessions}
                    pagination={false}
                    scroll={{ x: 680 }}
                    columns={[
                        {
                            title: t("profile.device"),
                            dataIndex: "user_agent",
                            render: (value: string, row) => (
                                <div className="max-w-lg break-words">
                                    {row.current ? <Tag color="green">{t("profile.current")}</Tag> : null}
                                    <span className="text-xs">{value || "—"}</span>
                                </div>
                            ),
                        },
                        { title: "IP", dataIndex: "ip" },
                        { title: t("profile.lastActive"), dataIndex: "last_active_at", render: (value: number) => dayjs.unix(value).format("MM-DD HH:mm") },
                        {
                            title: t("profile.action"),
                            render: (_, row) =>
                                !row.current ? (
                                    <Popconfirm title={t("profile.revokeConfirm")} onConfirm={() => revoke(row.sid)}>
                                        <Button type="text" danger disabled={busy}>
                                            {t("profile.revoke")}
                                        </Button>
                                    </Popconfirm>
                                ) : null,
                        },
                    ]}
                />
            </section>
        </div>
    );
}
