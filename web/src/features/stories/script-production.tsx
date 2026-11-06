import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, App, Button, Checkbox, Drawer, Empty, Input, Select, Segmented, Spin, Steps, Tabs } from "antd";
import { Plus, Sparkles, Upload } from "lucide-react";
import { nanoid } from "nanoid";
import { useNavigate } from "react-router-dom";
import { ModelPicker } from "@/components/model-picker";
import { assertAccountOwner } from "@/lib/account-storage";
import { productionPrompt, scriptSections } from "@/lib/story-production";
import { analyseScript, listScriptDocuments, listScriptParts, loadScriptPart, type ScriptDocument, type ScriptPart } from "@/services/api/story-production";
import { uploadImage } from "@/services/image-storage";
import { useAssetStore, type ImageAsset } from "@/stores/use-asset-store";
import { useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { openProductionDraft, useStoryProductionStore } from "@/stores/use-story-production-store";
import { useUserStore } from "@/stores/use-user-store";
import { sourceKey, sourceLabel, type ProductionEntity, type ProductionKind, type ProductionPlan, type ScriptSource } from "@/types/story-production";
import { productionLink } from "@/services/story-production-results";
import type { ProductionLauncherProps } from "./production-launcher";

const kindLabels = { character: "人物", scene: "场景", shot: "镜头" };
export default function ScriptProduction({ source: initialSource, content: initialContent, target: initialTarget, onClose }: ProductionLauncherProps & { onClose: () => void }) {
    const navigate = useNavigate();
    const { message } = App.useApp();
    const config = useEffectiveConfig();
    const assets = useAssetStore((state) => state.assets);
    const plans = useStoryProductionStore((state) => state.plans);
    const savePlan = useStoryProductionStore((state) => state.savePlan);
    const [documents, setDocuments] = useState<ScriptDocument[]>(initialSource ? [initialSource] : []);
    const [document, setDocument] = useState<ScriptDocument | undefined>(initialSource);
    const [parts, setParts] = useState<ScriptPart[]>(initialSource ? [{ id: initialSource.partId, title: initialSource.partTitle, revisionId: initialSource.revisionId }] : []);
    const [part, setPart] = useState<ScriptPart | undefined>(parts[0]);
    const [content, setContent] = useState(initialContent ?? "");
    const [sectionId, setSectionId] = useState("all");
    const [sectionTitle, setSectionTitle] = useState(initialSource?.sectionTitle);
    const [fragment, setFragment] = useState(initialContent ?? "");
    const [target, setTarget] = useState<"image" | "video">(initialTarget ?? "image");
    const [kind, setKind] = useState<ProductionKind>(initialTarget === "video" ? "shot" : "character");
    const [plan, setPlan] = useState<ProductionPlan>();
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [activeId, setActiveId] = useState("");
    const [referenceIds, setReferenceIds] = useState<Record<string, string[]>>({});
    const [style, setStyle] = useState("");
    const [textModel, setTextModel] = useState("");
    const [loading, setLoading] = useState(false);
    const [analysing, setAnalysing] = useState(false);
    const [importing, setImporting] = useState(false);
    const [error, setError] = useState("");
    const [listWarning, setListWarning] = useState("");
    const sequence = useRef(0);
    const controller = useRef<AbortController | null>(null);
    const fileInput = useRef<HTMLInputElement>(null);
    useEffect(() => {
        let cancelled = false;
        const initialSequence = sequence.current;
        void listScriptDocuments()
            .then((result) => {
                if (cancelled) return;
                setDocuments(initialSource && !result.documents.some((item) => sourceKey(item) === sourceKey(initialSource)) ? [initialSource, ...result.documents] : result.documents);
                setListWarning(result.errors.join("；"));
                const current = initialSource && result.documents.find((item) => sourceKey(item) === sourceKey(initialSource));
                if (current && sequence.current === initialSequence) setDocument(current);
                if (initialSource)
                    void listScriptParts(current ?? initialSource)
                        .then((list) => {
                            if (!cancelled && sequence.current === initialSequence) setParts((items) => [...list, ...items.filter((item) => !list.some((next) => next.id === item.id))]);
                        })
                        .catch((err) => {
                            if (!cancelled) setListWarning(String(err));
                        });
            })
            .catch((err) => {
                if (!cancelled) setListWarning(String(err));
            });
        return () => {
            cancelled = true;
            sequence.current++;
            controller.current?.abort();
        };
    }, []);
    const sections = useMemo(() => scriptSections(content), [content]);
    const source: ScriptSource | undefined = document && part ? { ...document, partId: part.id, partTitle: part.title, revisionId: part.revisionId, sectionTitle } : undefined;
    const imageAssets = assets.filter((asset): asset is ImageAsset => asset.kind === "image");
    const relatedPlans = plans.filter((item) => source && sourceKey(item.source) === sourceKey(source) && item.source.partId === source.partId);
    const entities = plan?.entities.filter((item) => item.kind === kind) ?? [];
    const active = entities.find((item) => item.id === activeId) ?? entities[0];
    const chosen = entities.filter((item) => selectedIds.includes(item.id));
    function suggestedReferences(entity: ProductionEntity) {
        const names = new Set([entity.name, ...entity.characters, entity.scene].filter(Boolean));
        const matched = new Set<string>();
        return imageAssets
            .filter((asset) => {
                const link = productionLink(asset);
                if (!link || !plan || sourceKey(link.source) !== sourceKey(plan.source) || !names.has(link.entity.name) || matched.has(link.entity.name)) return false;
                matched.add(link.entity.name);
                return true;
            })
            .map((asset) => asset.id);
    }
    const refsFor = (entity: ProductionEntity) => referenceIds[entity.id] ?? suggestedReferences(entity);
    const activeReferences = active ? refsFor(active) : [];
    const sortedAssets = [...imageAssets].sort(
        (a, b) => Number(Boolean(plan && productionLink(b) && sourceKey(productionLink(b)!.source) === sourceKey(plan.source))) - Number(Boolean(plan && productionLink(a) && sourceKey(productionLink(a)!.source) === sourceKey(plan.source))),
    );
    function resetAnalysis() {
        controller.current?.abort();
        setAnalysing(false);
        setPlan(undefined);
        setSelectedIds([]);
        setReferenceIds({});
        setError("");
    }
    async function chooseDocument(value: string) {
        const next = documents.find((item) => sourceKey(item) === value);
        const request = ++sequence.current;
        resetAnalysis();
        setDocument(next);
        setPart(undefined);
        setParts([]);
        setContent("");
        setFragment("");
        setSectionId("all");
        setSectionTitle(undefined);
        if (!next) return;
        setLoading(true);
        try {
            const list = await listScriptParts(next);
            if (sequence.current === request) setParts(list);
        } catch (err) {
            if (sequence.current === request) setError(err instanceof Error ? err.message : String(err));
        } finally {
            if (sequence.current === request) setLoading(false);
        }
    }
    async function choosePart(value: string) {
        const next = parts.find((item) => item.id === value);
        const request = ++sequence.current;
        resetAnalysis();
        setPart(next);
        setContent("");
        setFragment("");
        setSectionId("all");
        setSectionTitle(undefined);
        if (!document || !next) return;
        setLoading(true);
        try {
            const text = await loadScriptPart(document, next);
            if (sequence.current === request) {
                setContent(text);
                setFragment(text);
            }
        } catch (err) {
            if (sequence.current === request) setError(err instanceof Error ? err.message : String(err));
        } finally {
            if (sequence.current === request) setLoading(false);
        }
    }
    function acceptPlan(next: ProductionPlan) {
        setPlan(next);
        setReferenceIds({});
        const nextKind = target === "video" ? "shot" : next.entities.some((entity) => entity.kind === "character") ? "character" : next.entities[0].kind;
        setKind(nextKind);
        const first = next.entities.find((entity) => entity.kind === nextKind);
        setActiveId(first?.id ?? "");
        setSelectedIds(first ? [first.id] : []);
    }
    async function analyse() {
        if (!source || !fragment.trim()) return;
        const model = textModel || config.textModel;
        if (!useConfigStore.getState().isAiConfigReady(config, model)) {
            message.warning("请先选择可用的文本模型。");
            return;
        }
        controller.current?.abort();
        const abort = new AbortController();
        controller.current = abort;
        setAnalysing(true);
        setError("");
        const owner = useUserStore.getState().user?.id;
        try {
            const result = await analyseScript({ ...config, model, textModel: model }, source, fragment, abort.signal);
            if (abort.signal.aborted) return;
            assertAccountOwner(useUserStore.getState().user?.id);
            if (owner !== useUserStore.getState().user?.id) return;
            savePlan(result);
            acceptPlan(result);
        } catch (err) {
            if (!abort.signal.aborted) setError(err instanceof Error ? err.message : String(err));
        } finally {
            if (controller.current === abort) setAnalysing(false);
        }
    }
    function changeEntity(patch: Partial<ProductionEntity>) {
        if (!plan || !active) return;
        const next = {
            ...plan,
            entities: plan.entities.map((entity) =>
                entity.id === active.id
                    ? { ...entity, ...patch }
                    : patch.name
                      ? {
                            ...entity,
                            characters: active.kind === "character" ? entity.characters.map((name) => (name === active.name ? patch.name! : name)) : entity.characters,
                            scene: active.kind === "scene" && entity.scene === active.name ? patch.name : entity.scene,
                        }
                      : entity,
            ),
        };
        setPlan(next);
        savePlan(next);
    }
    function switchKind(next: ProductionKind) {
        setKind(next);
        setActiveId(plan?.entities.find((entity) => entity.kind === next)?.id ?? "");
    }
    async function uploadReferences(files: FileList | null) {
        if (!active) return;
        const owner = useUserStore.getState().user?.id;
        const entityId = active.id,
            selected = refsFor(active);
        try {
            const stored = await Promise.all(
                Array.from(files ?? [])
                    .filter((file) => file.type.startsWith("image/"))
                    .map(async (file) => ({ file, image: await uploadImage(file) })),
            );
            assertAccountOwner(useUserStore.getState().user?.id);
            if (owner !== useUserStore.getState().user?.id) return;
            const ids = stored.map(({ file, image }) =>
                useAssetStore.getState().addAsset({
                    kind: "image",
                    title: file.name,
                    coverUrl: image.url,
                    tags: ["剧本参考"],
                    source: plan?.source.title,
                    data: { dataUrl: image.url, storageKey: image.storageKey, width: image.width, height: image.height, bytes: image.bytes, mimeType: image.mimeType },
                }),
            );
            setReferenceIds((current) => ({ ...current, [entityId]: [...selected, ...ids] }));
        } catch (err) {
            message.error(err instanceof Error ? err.message : "上传失败");
        }
    }
    async function transfer() {
        if (!plan || !chosen.length) return;
        if (chosen.some((entity) => !(target === "image" ? entity.imagePrompt : entity.videoPrompt).trim())) {
            message.warning("请填写每个已选对象的生成提示词。");
            return;
        }
        setImporting(true);
        try {
            const drafts = chosen.map((entity) => {
                const refs = refsFor(entity).flatMap((id) => {
                    const asset = imageAssets.find((item) => item.id === id);
                    return asset ? [asset] : [];
                });
                return {
                    id: nanoid(),
                    prompt: productionPrompt(
                        plan,
                        entity,
                        target,
                        style,
                        refs.map((asset) => asset.title),
                    ),
                    references: refs.map((asset) => ({ id: asset.id, name: asset.title, type: asset.data.mimeType, dataUrl: asset.data.dataUrl, storageKey: asset.data.storageKey })),
                    storySource: { planId: plan.id, source: plan.source, entity },
                };
            });
            // This is the existing video workbench's reference capacity, never silently discard references.
            if (target === "video" && drafts.some((draft) => draft.references.length > 7)) {
                message.warning("视频工作台最多支持 7 张参考图，请减少参考图后导入。");
                return;
            }
            await openProductionDraft(target, drafts[0]);
            savePlan(plan);
            useStoryProductionStore.getState().setQueue(target, drafts);
            navigate(`/${target}`);
            onClose();
            message.success(`已导入 ${drafts.length} 个${kindLabels[kind]}，确认模型和参数后即可生成。`);
        } catch (err) {
            message.error(err instanceof Error ? err.message : "导入失败，请重试。");
        } finally {
            setImporting(false);
        }
    }
    return (
        <Drawer
            title="剧本生成助手"
            open
            onClose={onClose}
            width="min(980px, 100vw)"
            zIndex={1100}
            footer={
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-sm text-muted-foreground">导入后可继续编辑，点击生成才会提交图片或视频任务。</span>
                    <Button type="primary" loading={importing} disabled={!chosen.length || analysing || loading} onClick={() => void transfer()}>
                        导入{target === "image" ? "生图" : "视频"}工作台{chosen.length ? `（${chosen.length}）` : ""}
                    </Button>
                </div>
            }
        >
            <div className="space-y-5">
                <Steps size="small" current={plan ? 1 : 0} items={[{ title: "选择剧本片段" }, { title: "确认人物与镜头" }, { title: "导入工作台生成" }]} />
                {listWarning && <Alert type="warning" showIcon title="部分作品暂时无法加载" description={listWarning} />}
                {error && <Alert type="error" showIcon title={error} />}
                <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1 text-sm">
                        <span>选择作品</span>
                        <Select
                            className="w-full"
                            aria-label="选择作品"
                            placeholder="选择剧本或小说"
                            value={document ? sourceKey(document) : undefined}
                            options={documents.map((item) => ({ value: sourceKey(item), label: item.title }))}
                            onChange={(value) => void chooseDocument(value)}
                            disabled={analysing || importing}
                            showSearch
                            optionFilterProp="label"
                        />
                    </label>
                    <label className="space-y-1 text-sm">
                        <span>章节 / 生成物</span>
                        <Select
                            className="w-full"
                            aria-label="章节或生成物"
                            placeholder={loading ? "正在读取…" : "选择章节或文本生成物"}
                            value={part?.id}
                            options={parts.map((item) => ({ value: item.id, label: item.title }))}
                            onChange={(value) => void choosePart(value)}
                            disabled={!document || loading || analysing || importing}
                        />
                    </label>
                </div>
                {!loading && document && !parts.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有可导入的章节或文本生成物，请先完成剧本。" />}
                {loading && (
                    <Spin tip="正在读取剧本…">
                        <div className="h-12" />
                    </Spin>
                )}
                {part && (
                    <>
                        <Select
                            className="w-full"
                            aria-label="选择片段"
                            value={sectionId}
                            disabled={analysing || loading}
                            options={[{ value: "all", label: "整个章节 / 生成物" }, ...sections.map((section) => ({ value: section.id, label: section.title }))]}
                            onChange={(value) => {
                                resetAnalysis();
                                setSectionId(value);
                                const section = sections.find((item) => item.id === value);
                                setFragment(section?.content ?? content);
                                setSectionTitle(section?.title);
                            }}
                        />
                        <Input.TextArea
                            aria-label="待分析剧本"
                            rows={5}
                            value={fragment}
                            disabled={analysing || loading}
                            placeholder="可以只保留需要生成的片段，原剧本不会被修改。"
                            onChange={(event) => {
                                resetAnalysis();
                                setFragment(event.target.value);
                            }}
                        />
                        <div className="flex flex-wrap items-center gap-3">
                            <span className="text-sm text-muted-foreground">分析模型</span>
                            <ModelPicker config={config} value={textModel || config.textModel} onChange={setTextModel} capability="text" />
                            <Button icon={<Sparkles size={15} />} loading={analysing} disabled={!fragment.trim() || loading || importing} onClick={() => void analyse()}>
                                {plan ? "重新分析" : "分析人物与镜头"}
                            </Button>
                            {analysing && (
                                <Button
                                    onClick={() => {
                                        controller.current?.abort();
                                        setAnalysing(false);
                                    }}
                                >
                                    停止分析
                                </Button>
                            )}
                        </div>
                        <p className="text-xs text-muted-foreground">分析按所选文本模型正常计费；导入和查看已保存的分析结果无需再次分析。</p>
                    </>
                )}
                {relatedPlans.length > 0 && (
                    <Select
                        className="w-full"
                        aria-label="已保存的分析"
                        disabled={analysing || importing || loading}
                        placeholder="使用已保存的分析"
                        value={plan?.id}
                        options={relatedPlans.map((item) => ({ value: item.id, label: `${sourceLabel(item.source)} · ${item.entities.length} 个对象` }))}
                        onChange={(id) => {
                            const saved = relatedPlans.find((item) => item.id === id);
                            if (saved) acceptPlan(saved);
                        }}
                    />
                )}
                {plan && (
                    <>
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <h3 className="font-medium">{sourceLabel(plan.source)}</h3>
                            <Segmented<"image" | "video">
                                aria-label="生成类型"
                                disabled={importing}
                                value={target}
                                options={[
                                    { value: "image", label: "生成图片" },
                                    { value: "video", label: "生成视频" },
                                ]}
                                onChange={(value) => {
                                    setTarget(value);
                                    if (value === "video") {
                                        switchKind("shot");
                                        const first = plan.entities.find((entity) => entity.kind === "shot");
                                        setSelectedIds(first ? [first.id] : []);
                                    }
                                }}
                            />
                        </div>
                        {target === "image" && (
                            <Tabs
                                activeKey={kind}
                                onChange={(value) => switchKind(value as ProductionKind)}
                                items={(["character", "scene", "shot"] as const).map((value) => ({ key: value, label: `${kindLabels[value]}（${plan.entities.filter((entity) => entity.kind === value).length}）` }))}
                            />
                        )}
                        <div className="grid gap-4 sm:grid-cols-[210px_minmax(0,1fr)]">
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Checkbox
                                        checked={entities.length > 0 && entities.every((entity) => selectedIds.includes(entity.id))}
                                        indeterminate={chosen.length > 0 && chosen.length < entities.length}
                                        onChange={(event) => setSelectedIds(event.target.checked ? entities.map((entity) => entity.id) : [])}
                                    >
                                        全选{kindLabels[kind]}
                                    </Checkbox>
                                    <span className="text-xs text-muted-foreground">已选 {chosen.length}</span>
                                </div>
                                {entities.map((entity) => (
                                    <div key={entity.id} className={`flex items-start gap-2 rounded-lg border p-3 ${active?.id === entity.id ? "border-primary bg-primary/5" : "border-border"}`}>
                                        <Checkbox
                                            aria-label={`选择${entity.name}`}
                                            checked={selectedIds.includes(entity.id)}
                                            onChange={(event) => setSelectedIds((ids) => (event.target.checked ? [...ids, entity.id] : ids.filter((id) => id !== entity.id)))}
                                        />
                                        <button type="button" className="min-w-0 flex-1 text-left text-sm" onClick={() => setActiveId(entity.id)}>
                                            <div className="font-medium break-words">{entity.name}</div>
                                            <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{entity.description}</div>
                                        </button>
                                    </div>
                                ))}
                                <Button
                                    type="text"
                                    icon={<Plus size={14} />}
                                    onClick={() => {
                                        const entity: ProductionEntity = { id: nanoid(), kind, name: `新${kindLabels[kind]}`, description: "", imagePrompt: "", videoPrompt: "", characters: [], scene: "" };
                                        const next = { ...plan, entities: [...plan.entities, entity] };
                                        setPlan(next);
                                        savePlan(next);
                                        setActiveId(entity.id);
                                        setSelectedIds((ids) => [...ids, entity.id]);
                                    }}
                                >
                                    补充{kindLabels[kind]}
                                </Button>
                            </div>
                            {active ? (
                                <div className="min-w-0 space-y-3">
                                    <label className="block space-y-1 text-sm">
                                        <span>{kindLabels[kind]}名称</span>
                                        <Input aria-label="对象名称" value={active.name} onChange={(event) => changeEntity({ name: event.target.value })} />
                                    </label>
                                    <label className="block space-y-1 text-sm">
                                        <span>{kind === "shot" ? "情节与画面" : "外观 / 环境设定"}</span>
                                        <Input.TextArea aria-label="对象设定" rows={3} value={active.description} onChange={(event) => changeEntity({ description: event.target.value })} />
                                    </label>
                                    {kind === "shot" && (
                                        <div className="grid gap-3 sm:grid-cols-2">
                                            <label className="space-y-1 text-sm">
                                                <span>出场人物</span>
                                                <Select
                                                    aria-label="出场人物"
                                                    mode="tags"
                                                    className="w-full"
                                                    value={active.characters}
                                                    options={plan.entities.filter((entity) => entity.kind === "character").map((entity) => ({ value: entity.name }))}
                                                    onChange={(value) => changeEntity({ characters: value })}
                                                />
                                            </label>
                                            <label className="space-y-1 text-sm">
                                                <span>场景</span>
                                                <Input aria-label="镜头场景" value={active.scene} onChange={(event) => changeEntity({ scene: event.target.value })} />
                                            </label>
                                        </div>
                                    )}
                                    <label className="block space-y-1 text-sm">
                                        <span>{target === "image" ? "图片提示词" : "视频提示词"}</span>
                                        <Input.TextArea
                                            aria-label="生成提示词"
                                            rows={5}
                                            value={target === "image" ? active.imagePrompt : active.videoPrompt}
                                            onChange={(event) => changeEntity(target === "image" ? { imagePrompt: event.target.value } : { videoPrompt: event.target.value })}
                                        />
                                    </label>
                                    <label className="block space-y-1 text-sm">
                                        <span>统一画面风格（应用于本次所选对象）</span>
                                        <Input value={style} onChange={(event) => setStyle(event.target.value)} placeholder="例如：写实电影、柔和自然光、统一服装与色调" />
                                    </label>
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <span className="text-sm font-medium">
                                            {active.name}的参考图（{activeReferences.length}）
                                        </span>
                                        <Button type="text" size="small" icon={<Upload size={14} />} onClick={() => fileInput.current?.click()}>
                                            上传参考图
                                        </Button>
                                        <input
                                            ref={fileInput}
                                            type="file"
                                            accept="image/*"
                                            multiple
                                            hidden
                                            onChange={(event) => {
                                                void uploadReferences(event.target.files);
                                                event.target.value = "";
                                            }}
                                        />
                                    </div>
                                    <p className="text-xs text-muted-foreground">优先沿用同一作品中同名人物、场景的最新图片，可取消或补选其他素材。参考图按当前顺序导入。</p>
                                    <div className="grid max-h-60 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
                                        {sortedAssets.map((asset) => (
                                            <label key={asset.id} className={`cursor-pointer rounded-lg border p-1.5 ${activeReferences.includes(asset.id) ? "border-primary" : "border-border"}`}>
                                                <img src={asset.data.dataUrl} alt={asset.title} className="aspect-square w-full rounded object-cover" />
                                                <div className="mt-1 flex items-center gap-1">
                                                    <Checkbox
                                                        checked={activeReferences.includes(asset.id)}
                                                        onChange={(event) => setReferenceIds((current) => ({ ...current, [active.id]: event.target.checked ? [...activeReferences, asset.id] : activeReferences.filter((id) => id !== asset.id) }))}
                                                    />
                                                    <span className="truncate text-xs">{asset.title}</span>
                                                </div>
                                            </label>
                                        ))}
                                    </div>
                                    {!imageAssets.length && <p className="text-xs text-muted-foreground">还没有图片素材，可以先生成人物定妆图，再回到这里生成镜头或视频。</p>}
                                </div>
                            ) : (
                                <Empty description={`没有识别到${kindLabels[kind]}，可以手动补充或重新分析。`} />
                            )}
                        </div>
                    </>
                )}
            </div>
        </Drawer>
    );
}
