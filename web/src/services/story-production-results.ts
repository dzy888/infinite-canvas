import { assertAccountOwner } from "@/lib/account-storage";
import { useUserStore } from "@/stores/use-user-store";
import { useAssetStore, type Asset } from "@/stores/use-asset-store";
import type { StoryProductionLink } from "@/types/story-production";

export function productionLink(asset: Asset): StoryProductionLink | undefined {
    const link = asset.metadata?.storyProduction as StoryProductionLink | undefined;
    return link?.source?.id && link.entity?.name ? link : undefined;
}
export async function rememberProductionImage(link: StoryProductionLink | undefined, image: { id: string; dataUrl: string; storageKey?: string; width: number; height: number; bytes: number; mimeType?: string }, prompt: string) {
    if (!link) return;
    if (!useAssetStore.persist.hasHydrated()) await useAssetStore.persist.rehydrate();
    assertAccountOwner(useUserStore.getState().user?.id);
    if (useAssetStore.getState().assets.some((asset) => asset.metadata?.generationId === image.id)) return;
    useAssetStore
        .getState()
        .addAsset({
            kind: "image",
            title: link.entity.name,
            coverUrl: image.dataUrl,
            tags: ["剧本生成", link.source.title],
            source: link.source.title,
            note: link.source.partTitle,
            data: { dataUrl: image.dataUrl, storageKey: image.storageKey, width: image.width, height: image.height, bytes: image.bytes, mimeType: image.mimeType || "image/png" },
            metadata: { storyProduction: link, generationId: image.id, prompt },
        });
}
export async function rememberProductionVideo(link: StoryProductionLink | undefined, generationId: string, video: { url: string; storageKey: string; width: number; height: number; bytes: number; mimeType: string }, prompt: string) {
    if (!link) return;
    if (!useAssetStore.persist.hasHydrated()) await useAssetStore.persist.rehydrate();
    assertAccountOwner(useUserStore.getState().user?.id);
    if (useAssetStore.getState().assets.some((asset) => asset.metadata?.generationId === generationId)) return;
    useAssetStore
        .getState()
        .addAsset({
            kind: "video",
            title: link.entity.name,
            coverUrl: "",
            tags: ["剧本生成", link.source.title],
            source: link.source.title,
            note: link.source.partTitle,
            data: { url: video.url, storageKey: video.storageKey, width: video.width, height: video.height, bytes: video.bytes, mimeType: video.mimeType },
            metadata: { storyProduction: link, generationId, prompt },
        });
}
