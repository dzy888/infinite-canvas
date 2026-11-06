import type { ReferenceImage } from "./image";

export type ScriptSource = {
    kind: "book" | "work";
    id: string;
    title: string;
    partId: string;
    partTitle: string;
    revisionId?: string;
    sectionTitle?: string;
};
export type ProductionKind = "character" | "scene" | "shot";
export type ProductionEntity = {
    id: string;
    kind: ProductionKind;
    name: string;
    description: string;
    imagePrompt: string;
    videoPrompt: string;
    characters: string[];
    scene: string;
};
export type ProductionPlan = { id: string; source: ScriptSource; content: string; entities: ProductionEntity[] };
export type StoryProductionLink = { planId: string; source: ScriptSource; entity: ProductionEntity };
export type ProductionDraft = { id: string; prompt: string; references: ReferenceImage[]; storySource: StoryProductionLink };
export const sourceKey = (source: Pick<ScriptSource, "kind" | "id">) => `${source.kind}:${source.id}`;
export const sourceLabel = (source: ScriptSource) => [source.title, source.partTitle, source.sectionTitle].filter(Boolean).join(" · ");
export const sourceRoute = (source: ScriptSource) => (source.kind === "book" ? `/stories#chapter/${encodeURIComponent(source.id)}/${encodeURIComponent(source.partId)}` : `/stories#work/${encodeURIComponent(source.id)}`);
