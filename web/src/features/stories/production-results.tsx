import { App, Button, Image } from "antd";
import { useNavigate } from "react-router-dom";
import { createCanvasNode, imageMetadata, videoMetadata } from "@/lib/canvas/canvas-node-factory";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { useAssetStore, type Asset } from "@/stores/use-asset-store";
import { resolveImageUrl } from "@/services/image-storage";
import { resolveMediaUrl } from "@/services/file-storage";
import { productionLink } from "@/services/story-production-results";
import { sourceKey, sourceLabel } from "@/types/story-production";
import { CanvasNodeType } from "@/types/canvas";
import { assertAccountOwner } from "@/lib/account-storage";
import { useUserStore } from "@/stores/use-user-store";

export function ProductionResults({ ownerKey, partId }: { ownerKey: string; partId?: string }) {
    const navigate = useNavigate();
    const { message } = App.useApp();
    const hydrated = useCanvasStore((state) => state.hydrated);
    const assets = useAssetStore((state) => state.assets);
    const linked = assets.filter((asset) => {
        const link = productionLink(asset);
        return link && sourceKey(link.source) === ownerKey && (!partId || link.source.partId === partId);
    });
    async function send(asset: Asset) {
        const owner = useUserStore.getState().user?.id;
        try {
            assertAccountOwner(owner);
            const node =
                asset.kind === "image"
                    ? createCanvasNode(CanvasNodeType.Image, { x: 400, y: 300 }, imageMetadata({ ...asset.data, url: await resolveImageUrl(asset.data.storageKey, asset.data.dataUrl) }))
                    : asset.kind === "video"
                      ? createCanvasNode(CanvasNodeType.Video, { x: 400, y: 300 }, videoMetadata({ ...asset.data, url: await resolveMediaUrl(asset.data.storageKey, asset.data.url), storageKey: asset.data.storageKey || "" }))
                      : undefined;
            if (!node) return;
            assertAccountOwner(useUserStore.getState().user?.id);
            if (owner !== useUserStore.getState().user?.id) return;
            node.title = asset.title;
            node.metadata = { ...node.metadata, storySource: productionLink(asset), prompt: typeof asset.metadata?.prompt === "string" ? asset.metadata.prompt : undefined };
            const id = useCanvasStore.getState().importProject({ title: asset.title, nodes: [node], connections: [] });
            navigate(`/canvas/${id}`);
        } catch (err) {
            message.error(err instanceof Error ? err.message : "送到画布失败");
        }
    }
    if (!linked.length) return null;
    return (
        <section className="my-5 space-y-3 rounded-xl border border-border p-4">
            <div>
                <h3 className="font-medium">剧本生成素材（{linked.length}）</h3>
                <p className="mt-1 text-xs text-muted-foreground">图片和视频已保存到当前账号的本地素材库，导入剧本时可继续选作参考。</p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {linked.map((asset) => (
                    <div key={asset.id} className="min-w-0 space-y-2 rounded-lg border border-border p-2">
                        {asset.kind === "image" ? (
                            <Image src={asset.data.dataUrl} alt={asset.title} className="!aspect-video !w-full !object-contain" />
                        ) : asset.kind === "video" ? (
                            <video controls preload="metadata" src={asset.data.url} className="aspect-video w-full rounded" />
                        ) : null}
                        <div className="truncate text-sm font-medium">{asset.title}</div>
                        <div className="line-clamp-2 text-xs text-muted-foreground">{sourceLabel(productionLink(asset)!.source)}</div>
                        <Button type="text" size="small" disabled={!hydrated} onClick={() => void send(asset)}>
                            送到画布
                        </Button>
                    </div>
                ))}
            </div>
        </section>
    );
}
