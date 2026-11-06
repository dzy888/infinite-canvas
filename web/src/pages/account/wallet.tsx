import { useEffect, useMemo, useState } from "react";
import { Alert, App, Button, Empty, Form, Input, InputNumber, Select, Skeleton, Table, Tag } from "antd";
import { RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import dayjs from "dayjs";
import { AuthError } from "@/services/api/new-api-auth";
import { formatQuota, platformRequest } from "@/services/api/new-api-platform";
import { createCreemPayment, createPayment, getTopupInfo, paymentMethodKey, paymentMethods, quotePayment, showCheckout, type Checkout, type TopupInfo, type TopupRecord } from "@/services/api/new-api-wallet";
import { usePlatformStore } from "@/stores/use-platform-store";
import { useUserStore } from "@/stores/use-user-store";

export function Wallet() {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const owner = useUserStore((state) => state.user?.id);
    const quotaSettings = usePlatformStore((state) => state.quotaSettings);
    const [info, setInfo] = useState<TopupInfo | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);
    const [busy, setBusy] = useState(false);
    const [pending, setPending] = useState(false);
    const [methodKey, setMethodKey] = useState("");
    const [amount, setAmount] = useState<number | null>(null);
    const [quote, setQuote] = useState<{ amount: number; method: string; value: number } | null>(null);
    const [quoting, setQuoting] = useState(false);
    const [quoteError, setQuoteError] = useState(false);
    const [records, setRecords] = useState<TopupRecord[]>([]);
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [refresh, setRefresh] = useState(0);
    const [form] = Form.useForm<{ code: string }>();
    const methods = useMemo(() => (info ? paymentMethods(info) : []), [info]);
    const method = methods.find((item) => paymentMethodKey(item) === methodKey);
    const rawMinimum = Number(method?.min_topup || 0);
    const minimum = quotaSettings?.quota_display_type === "TOKENS" ? rawMinimum * quotaSettings.quota_per_unit : rawMinimum;
    const currentQuote = quote?.amount === amount && quote.method === methodKey ? quote.value : null;
    const validAmount = amount !== null && Number.isSafeInteger(amount) && amount > 0 && amount >= minimum;
    const refreshAccount = () => {
        setRefresh((value) => value + 1);
        if (owner) void usePlatformStore.getState().load(owner);
    };
    useEffect(() => {
        let active = true;
        const refreshOnFocus = () => {
            if (active) refreshAccount();
        };
        window.addEventListener("focus", refreshOnFocus);
        return () => {
            active = false;
            window.removeEventListener("focus", refreshOnFocus);
        };
    }, [owner]);
    useEffect(() => {
        let active = true;
        setLoading(true);
        setError(false);
        void Promise.all([getTopupInfo(), platformRequest<{ items: TopupRecord[]; total: number }>("/user/topup/self?p=" + page + "&page_size=20")])
            .then(([next, history]) => {
                if (!active) return;
                setInfo(next);
                setRecords(history.items || []);
                setTotal(history.total || 0);
                setMethodKey((current) => (paymentMethods(next).some((item) => paymentMethodKey(item) === current) ? current : paymentMethods(next)[0] ? paymentMethodKey(paymentMethods(next)[0]) : ""));
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
    }, [owner, page, refresh]);
    useEffect(() => {
        let active = true;
        setQuote(null);
        setQuoteError(false);
        setQuoting(false);
        if (!method || !validAmount) return;
        setQuoting(true);
        void quotePayment(amount!, method)
            .then((value) => {
                if (active) setQuote({ amount: amount!, method: methodKey, value });
            })
            .catch(() => {
                if (active) setQuoteError(true);
            })
            .finally(() => {
                if (active) setQuoting(false);
            });
        return () => {
            active = false;
        };
    }, [amount, methodKey, minimum, info]);
    const pay = async (create: () => Promise<Checkout>) => {
        if (busy) return;
        const target = "dmx-payment-" + crypto.randomUUID();
        const popup = window.open("", target);
        if (!popup) {
            message.error(t("wallet.popupBlocked"));
            return;
        }
        popup.opener = null;
        setBusy(true);
        try {
            const checkout = await create();
            if (useUserStore.getState().user?.id !== owner) throw new AuthError("auth.sessionChanged");
            showCheckout(checkout, popup, target);
            setPending(true);
            refreshAccount();
        } catch (failure) {
            popup.close();
            message.error(t(failure instanceof AuthError ? failure.key : "wallet.paymentFailed"));
        } finally {
            setBusy(false);
        }
    };
    const redeem = async ({ code }: { code: string }) => {
        if (busy || !info?.enable_redemption) return;
        setBusy(true);
        try {
            const quota = await platformRequest<number>("/user/topup", false, { method: "POST", body: { key: code.trim() } });
            message.success(t("wallet.redeemed", { amount: formatQuota(quota, quotaSettings) }));
            form.resetFields();
            refreshAccount();
        } catch (failure) {
            message.error(t(failure instanceof AuthError ? failure.key : "wallet.redeemFailed"));
        } finally {
            setBusy(false);
        }
    };
    if (loading && !info) return <Skeleton active />;
    return (
        <div className="space-y-7">
            <div className="flex items-center justify-between gap-3">
                <h2 className="text-xl font-semibold">{t("wallet.title")}</h2>
                <Button type="text" icon={<RefreshCw size={15} />} loading={loading} onClick={refreshAccount}>
                    {t("platform.refresh")}
                </Button>
            </div>
            {error ? <Alert type="error" showIcon title={t("wallet.loadFailed")} /> : null}
            {pending ? <Alert type="info" showIcon title={t("wallet.pending")} description={t("wallet.pendingHint")} /> : null}
            <div className="grid items-start gap-6 lg:grid-cols-2">
                <section className="space-y-5 rounded-2xl border border-border p-6">
                    <h3 className="font-semibold">{t("wallet.online")}</h3>
                    {methods.length ? (
                        <>
                            <label className="block space-y-2">
                                <span className="text-sm text-muted-foreground">{t("wallet.method")}</span>
                                <Select className="w-full" aria-label={t("wallet.method")} value={methodKey} onChange={setMethodKey} disabled={busy} options={methods.map((item) => ({ value: paymentMethodKey(item), label: item.name }))} />
                            </label>
                            <div>
                                <label htmlFor="topup-amount" className="mb-2 block text-sm text-muted-foreground">
                                    {t("wallet.amount")}
                                </label>
                                <InputNumber id="topup-amount" className="!w-full" precision={0} value={amount} min={minimum || undefined} onChange={setAmount} disabled={busy} placeholder={t("wallet.minimum", { amount: minimum })} />
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {info?.amount_options.map((value) => (
                                        <Button key={value} size="small" type={amount === value ? "primary" : "text"} onClick={() => setAmount(value)} disabled={busy}>
                                            {value.toLocaleString()}
                                        </Button>
                                    ))}
                                </div>
                            </div>
                            <div className="flex items-center justify-between gap-3 border-t border-border pt-5">
                                <div>
                                    <p className="text-xs text-muted-foreground">{t("wallet.quote")}</p>
                                    <p className="mt-1 font-mono text-lg tabular-nums">{quoting ? "…" : currentQuote === null ? "—" : currentQuote.toLocaleString(undefined, { maximumFractionDigits: 4 })}</p>
                                </div>
                                <Button type="primary" loading={busy || quoting} disabled={loading || !validAmount || currentQuote === null || !method} onClick={() => method && void pay(() => createPayment(amount!, method))}>
                                    {t("wallet.pay")}
                                </Button>
                            </div>
                            {quoteError ? (
                                <p role="alert" className="text-sm text-muted-foreground">
                                    {t("wallet.quoteFailed")}
                                </p>
                            ) : null}
                            <p className="text-xs leading-6 text-muted-foreground">{t("wallet.quoteHint")}</p>
                        </>
                    ) : (
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("wallet.onlineDisabled")} />
                    )}
                    {info?.enable_creem_topup && info.creem_products?.length ? (
                        <div className="space-y-3">
                            {info.creem_products.map((product) => (
                                <div key={product.productId} className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                                    <div>
                                        <p className="text-sm font-medium">{product.name}</p>
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            {product.price} {product.currency}
                                        </p>
                                    </div>
                                    <Button disabled={loading || busy} onClick={() => void pay(() => createCreemPayment(product.productId))}>
                                        {t("wallet.buy")}
                                    </Button>
                                </div>
                            ))}
                        </div>
                    ) : null}
                </section>
                <section className="rounded-2xl border border-border p-6">
                    <h3 className="mb-5 font-semibold">{t("wallet.redemption")}</h3>
                    {info?.enable_redemption ? (
                        <Form form={form} layout="vertical" onFinish={(values) => void redeem(values)}>
                            <Form.Item name="code" label={t("wallet.code")} rules={[{ required: true, whitespace: true, message: t("wallet.codeRequired") }]}>
                                <Input autoComplete="off" disabled={busy} />
                            </Form.Item>
                            <Button htmlType="submit" loading={busy} disabled={loading}>
                                {t("wallet.redeem")}
                            </Button>
                        </Form>
                    ) : (
                        <p className="text-sm text-muted-foreground">{t("wallet.redemptionDisabled")}</p>
                    )}
                </section>
            </div>
            <section>
                <h3 className="mb-4 text-lg font-semibold">{t("wallet.history")}</h3>
                <Table<TopupRecord>
                    rowKey="id"
                    dataSource={records}
                    loading={loading}
                    scroll={{ x: 700 }}
                    pagination={{ current: page, total, pageSize: 20, showSizeChanger: false, onChange: setPage }}
                    columns={[
                        { title: t("platform.time"), dataIndex: "create_time", render: (value: number) => dayjs.unix(value).format("MM-DD HH:mm:ss") },
                        { title: t("wallet.order"), dataIndex: "trade_no" },
                        { title: t("wallet.method"), dataIndex: "payment_method" },
                        { title: t("wallet.paid"), dataIndex: "money" },
                        { title: t("wallet.status"), dataIndex: "status", render: (value: string) => <Tag color={value === "success" ? "green" : undefined}>{t("wallet.statuses." + value, { defaultValue: value })}</Tag> },
                    ]}
                />
            </section>
        </div>
    );
}
