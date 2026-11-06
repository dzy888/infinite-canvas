import { useState } from "react";
import { Alert, App, Button, Select, Switch } from "antd";
import { Link } from "react-router-dom";
import { Settings2 } from "lucide-react";
import { fetchJson, useApi } from "./inkos/hooks/use-api";
import { useServiceStore } from "./inkos/store/service";
import { usePreferencesStore } from "./inkos/store/preferences";
import { tr } from "./inkos/lib/app-language";
import type { PlatformModel } from "@/services/api/new-api-platform";
function modelId(model: PlatformModel) {
    const bytes = new TextEncoder().encode(JSON.stringify({ model: model.name, format: model.text_endpoint }));
    return (
        "dmx_" +
        btoa(String.fromCharCode(...bytes))
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/, "")
    );
}
type ModelConfig = { textModel: string; imageModel: string; models: PlatformModel[] };
export function ManagedModels() {
    const { data, error, loading, refetch } = useApi<ModelConfig>("/managed-models");
    return (
        <div className="mx-auto max-w-2xl space-y-7 p-5 sm:p-8">
            <div>
                <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
                    <Settings2 size={15} />
                    {tr("创作偏好", "Studio preferences")}
                </div>
                <h1 className="text-2xl font-semibold tracking-tight">{tr("选择创作模型", "Choose your models")}</h1>
                <p className="mt-2 text-sm text-muted-foreground">{tr("模型价格与用量可在模型广场和账户中心查看。", "View model prices and usage in Models and Account.")}</p>
            </div>
            {error && <Alert type="error" title={error} action={<Button onClick={refetch}>{tr("重试", "Retry")}</Button>} />}
            {loading ? <div className="text-sm text-muted-foreground">{tr("加载模型…", "Loading models…")}</div> : data && <ModelForm key={data.textModel + data.imageModel} data={data} onSaved={refetch} />}
            <div className="flex gap-5 text-sm">
                <Link to="/pricing" className="text-muted-foreground hover:text-foreground">
                    {tr("模型广场", "Models")}
                </Link>
                <Link to="/account" className="text-muted-foreground hover:text-foreground">
                    {tr("用量与余额", "Usage & balance")}
                </Link>
            </div>
        </div>
    );
}
function ModelForm({ data, onSaved }: { data: ModelConfig; onSaved: () => void }) {
    const { message } = App.useApp();
    const [textModel, setText] = useState(data.textModel),
        [imageModel, setImage] = useState(data.imageModel),
        [saving, setSaving] = useState(false);
    const expanded = usePreferencesStore((s) => s.toolDetailsDefaultOpen);
    const setExpanded = usePreferencesStore((s) => s.setToolDetailsDefaultOpen);
    const text = data.models.filter((m) => m.capabilities.includes("text")),
        images = data.models.filter((m) => m.capabilities.includes("image"));
    async function save() {
        setSaving(true);
        try {
            await fetchJson("/managed-models", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ textModel, imageModel }) });
            await useServiceStore.getState().refreshServices();
            onSaved();
            message.success(tr("已保存", "Saved"));
        } catch (e) {
            message.error(e instanceof Error ? e.message : tr("保存失败", "Save failed"));
        } finally {
            setSaving(false);
        }
    }
    return (
        <div className="space-y-6">
            {!text.length && <Alert type="info" title={tr("当前没有可用的创作模型，请联系管理员配置文本模型。", "No writing models available. Contact your administrator.")} />}
            <div className="space-y-2">
                <label className="block text-sm font-medium">{tr("文本模型", "Writing model")}</label>
                <Select
                    aria-label={tr("文本模型", "Writing model")}
                    className="w-full"
                    showSearch
                    optionFilterProp="label"
                    value={text.some((m) => modelId(m) === textModel) ? textModel : undefined}
                    onChange={setText}
                    placeholder={tr("请选择模型", "Select model")}
                    options={text.map((m) => ({ value: modelId(m), label: m.name }))}
                />
                <p className="text-xs text-muted-foreground">{tr("用于创作、审稿、修订和翻译。对话中也可以切换模型。", "Used for writing, review, revisions and translation. You can also switch models in chat.")}</p>
            </div>
            <div className="space-y-2">
                <label className="block text-sm font-medium">{tr("封面与分镜图片模型", "Cover & storyboard image model")}</label>
                <Select
                    aria-label={tr("图片模型", "Image model")}
                    className="w-full"
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    value={imageModel || undefined}
                    onChange={(v) => setImage(v || "")}
                    placeholder={tr("可选，生成图片时使用", "Optional, used for image generation")}
                    options={images.map((m) => ({ value: m.name, label: m.name }))}
                />
            </div>
            <div className="flex items-center justify-between gap-4 border-t border-border pt-5">
                <span className="text-sm">{tr("默认展开创作步骤", "Expand creative steps by default")}</span>
                <Switch checked={expanded} onChange={setExpanded} />
            </div>
            <Button type="primary" loading={saving} disabled={!text.some((m) => modelId(m) === textModel)} onClick={save}>
                {tr("保存设置", "Save settings")}
            </Button>
        </div>
    );
}
