import { useEffect, useState } from "react";
import { Alert, Button, DatePicker, Input, Table, Tabs } from "antd";
import { RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import dayjs from "dayjs";
import { Link, useSearchParams } from "react-router-dom";
import { Wallet } from "./wallet";
import { Profile } from "./profile";
import { usePlatformStore } from "@/stores/use-platform-store";
import { useUserStore } from "@/stores/use-user-store";
import { formatQuota, platformRequest, type UsageLog } from "@/services/api/new-api-platform";

export default function AccountPage({ initialTab = "usage" }: { initialTab?: "usage" | "wallet" }) {
    const { t } = useTranslation();
    const [params, setParams] = useSearchParams();
    const tab = ["usage", "wallet", "profile"].includes(params.get("tab") || "") ? params.get("tab")! : initialTab;
    const { account, quotaSettings } = usePlatformStore();
    const owner = useUserStore((state) => state.user?.id);
    useEffect(() => {
        if (owner) void usePlatformStore.getState().load(owner);
    }, [owner]);
    const [logs, setLogs] = useState<UsageLog[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [model, setModel] = useState("");
    const [range, setRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([dayjs().subtract(7, "day").startOf("day"), dayjs().endOf("day")]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);
    const [refresh, setRefresh] = useState(0);
    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(false);
        setLogs([]);
        const query = new URLSearchParams({ p: String(page), page_size: "20", start_timestamp: String(range[0].unix()), end_timestamp: String(range[1].unix()), ...(model ? { model_name: model } : {}) });
        void platformRequest<{ items: UsageLog[]; total: number }>(`/log/self?${query}`)
            .then((data) => {
                if (!cancelled) {
                    setLogs(data.items || []);
                    setTotal(data.total || 0);
                }
            })
            .catch(() => {
                if (!cancelled) setError(true);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [owner, page, model, range, refresh]);
    const cards = [
        { label: t("platform.balance"), value: account ? formatQuota(account.quota, quotaSettings) : "—" },
        { label: t("platform.totalSpent"), value: account ? formatQuota(account.used_quota, quotaSettings) : "—" },
        { label: t("platform.requests"), value: account?.request_count.toLocaleString() || "—" },
    ];
    return (
        <div className="h-full overflow-y-auto">
            <div className="mx-auto max-w-6xl space-y-8 px-5 py-8 md:px-10 md:py-12">
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <p className="mb-2 font-mono text-xs tracking-[0.2em] text-muted-foreground">DMXVIDEO / ACCOUNT</p>
                        <h1 className="text-3xl font-bold tracking-tight">{t("platform.account")}</h1>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Link to="/account?tab=wallet">
                            <Button type="primary">{t("wallet.title")}</Button>
                        </Link>
                        <Button
                            icon={<RefreshCw size={15} />}
                            loading={loading}
                            onClick={() => {
                                setRefresh((value) => value + 1);
                                if (owner) void usePlatformStore.getState().load(owner);
                            }}
                        >
                            {t("platform.refresh")}
                        </Button>
                    </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                    {cards.map((card) => (
                        <div key={card.label} className="rounded-2xl border border-border bg-background p-6">
                            <p className="mb-3 text-sm text-muted-foreground">{card.label}</p>
                            <p className="break-all text-2xl font-semibold tabular-nums">{card.value}</p>
                        </div>
                    ))}
                </div>
                <Tabs
                    activeKey={tab}
                    onChange={(value) => setParams({ tab: value })}
                    items={[
                        {
                            key: "usage",
                            label: t("platform.usage"),
                            children: (
                                <section>
                                    <h2 className="mb-4 text-xl font-semibold">{t("platform.usage")}</h2>
                                    <div className="mb-5 flex flex-wrap gap-3">
                                        <DatePicker.RangePicker
                                            value={range}
                                            allowClear={false}
                                            onChange={(dates) => {
                                                if (dates?.[0] && dates[1]) {
                                                    setRange([dates[0].startOf("day"), dates[1].endOf("day")]);
                                                    setPage(1);
                                                }
                                            }}
                                        />
                                        <Input.Search
                                            className="!w-64 max-w-full"
                                            placeholder={t("platform.filterModel")}
                                            allowClear
                                            onSearch={(value) => {
                                                setModel(value.trim());
                                                setPage(1);
                                            }}
                                        />
                                    </div>
                                    {error ? <Alert className="!mb-4" type="error" showIcon title={t("platform.logsFailed")} /> : null}
                                    <Table<UsageLog>
                                        rowKey="id"
                                        size="middle"
                                        loading={loading}
                                        dataSource={logs}
                                        scroll={{ x: 760 }}
                                        pagination={{ current: page, total, pageSize: 20, showSizeChanger: false, onChange: setPage }}
                                        columns={[
                                            { title: t("platform.time"), dataIndex: "created_at", render: (value: number) => dayjs.unix(value).format("MM-DD HH:mm:ss"), width: 140 },
                                            { title: t("platform.model"), dataIndex: "model_name", render: (value: string, row) => <span title={row.request_id}>{value || "—"}</span> },
                                            { title: t("platform.event"), dataIndex: "type", render: (value: number) => t(value === 2 ? "platform.consume" : value === 5 ? "platform.failure" : value === 6 ? "platform.refund" : "platform.adjustment") },
                                            {
                                                title: t("platform.cost"),
                                                dataIndex: "quota",
                                                render: (value: number, row) => (
                                                    <span className={row.type === 6 ? "text-green-600" : undefined}>
                                                        {row.type === 6 ? "+" : ""}
                                                        {formatQuota(value, quotaSettings)}
                                                    </span>
                                                ),
                                            },
                                            { title: t("platform.tokens"), render: (_, row) => ((row.prompt_tokens || 0) + (row.completion_tokens || 0)).toLocaleString() },
                                            { title: t("platform.duration"), dataIndex: "use_time", render: (value: number) => `${value || 0}s`, width: 80 },
                                        ]}
                                    />
                                </section>
                            ),
                        },
                        { key: "wallet", label: t("wallet.title"), children: <Wallet key={owner} /> },
                        { key: "profile", label: t("profile.title"), children: <Profile key={owner} /> },
                    ]}
                />
            </div>
        </div>
    );
}
