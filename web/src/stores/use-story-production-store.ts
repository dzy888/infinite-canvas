import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createAccountStorage } from "@/lib/account-storage";
import { resolveImageUrl } from "@/services/image-storage";
import { useWorkbenchAgentStore } from "./use-workbench-agent-store";
import type { ProductionDraft, ProductionPlan } from "@/types/story-production";

const storage = createAccountStorage("story_production");
type State = {
    plans: ProductionPlan[];
    queues: { image: ProductionDraft[]; video: ProductionDraft[] };
    savePlan: (plan: ProductionPlan) => void;
    setQueue: (kind: "image" | "video", drafts: ProductionDraft[]) => void;
};
export const useStoryProductionStore = create<State>()(
    persist(
        (set) => ({
            plans: [],
            queues: { image: [], video: [] },
            savePlan: (plan) => set((state) => ({ plans: [plan, ...state.plans.filter((item) => item.id !== plan.id)] })),
            setQueue: (kind, drafts) => set((state) => ({ queues: { ...state.queues, [kind]: drafts } })),
        }),
        {
            name: "plans-and-queues",
            storage: createJSONStorage(() => ({
                getItem: (key) => storage.getItem<string>(key),
                setItem: async (key, value) => {
                    await storage.setItem(key, value);
                },
                removeItem: (key) => storage.removeItem(key),
            })),
            partialize: (state) => ({
                plans: state.plans,
                queues: Object.fromEntries(
                    Object.entries(state.queues).map(([kind, drafts]) => [kind, drafts.map((draft) => ({ ...draft, references: draft.references.map((ref) => ({ ...ref, dataUrl: ref.storageKey ? "" : ref.dataUrl })) }))]),
                ) as State["queues"],
            }),
        },
    ),
);
export async function openProductionDraft(kind: "image" | "video", draft: ProductionDraft) {
    const { assertAccountOwner } = await import("@/lib/account-storage");
    const { useUserStore } = await import("./use-user-store");
    const owner = useUserStore.getState().user?.id;
    assertAccountOwner(owner);
    const references = await Promise.all(draft.references.map(async (ref) => ({ ...ref, dataUrl: await resolveImageUrl(ref.storageKey, ref.dataUrl) })));
    if (references.some((ref) => !ref.dataUrl || (ref.dataUrl.startsWith("blob:") && !ref.storageKey))) throw new Error("参考图已失效，请重新选择或上传参考图。");
    assertAccountOwner(useUserStore.getState().user?.id);
    if (useUserStore.getState().user?.id !== owner) throw new Error("账号已切换，请重新打开剧本。");
    const store = useWorkbenchAgentStore.getState();
    (kind === "image" ? store.dispatchImage : store.dispatchVideo)({ prompt: draft.prompt, references, storySource: draft.storySource, run: false });
}
