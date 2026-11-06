import type { ProductionEntity, ProductionPlan, ScriptSource } from "@/types/story-production";

// Keep section text intact, including its heading, so only the chosen fragment is analysed.
export function scriptSections(content: string) {
    const headings = [...content.matchAll(/^(?:#{1,6}\s+.+|第[一二三四五六七八九十百零〇\d]+[章节幕场回].*|(?:INT\.|EXT\.|内景|外景).*)$/gm)];
    return headings.map((heading, index) => ({
        id: String(index),
        title: heading[0].replace(/^#+\s*/, ""),
        content: content.slice(heading.index, headings[index + 1]?.index ?? content.length).trim(),
    }));
}

export function parseProductionPlan(answer: string, source: ScriptSource, content: string, id: string): ProductionPlan {
    const cleaned = answer
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, "");
    let data: unknown;
    try {
        data = JSON.parse(cleaned);
    } catch {
        throw new Error("分析结果不是有效的结构化内容，请重新分析或更换文本模型。");
    }
    const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
    if (!object(data) || !["characters", "scenes", "shots"].every((key) => Array.isArray(data[key]))) throw new Error("分析结果缺少人物、场景或镜头列表，请重新分析。");
    const entities: ProductionEntity[] = [];
    for (const [key, kind] of [
        ["characters", "character"],
        ["scenes", "scene"],
        ["shots", "shot"],
    ] as const) {
        for (const [index, entry] of (data[key] as unknown[]).entries()) {
            if (!object(entry) || typeof entry.name !== "string" || !entry.name.trim() || typeof entry.description !== "string" || typeof entry.imagePrompt !== "string" || (kind === "shot" && typeof entry.videoPrompt !== "string"))
                throw new Error("分析结果中有不完整的对象，请重新分析。");
            if (entry.characters !== undefined && (!Array.isArray(entry.characters) || !entry.characters.every((name) => typeof name === "string"))) throw new Error("镜头人物列表格式有误，请重新分析。");
            entities.push({
                id: `${kind}-${index}`,
                kind,
                name: entry.name.trim(),
                description: entry.description,
                imagePrompt: entry.imagePrompt,
                videoPrompt: typeof entry.videoPrompt === "string" ? entry.videoPrompt : "",
                characters: (entry.characters as string[] | undefined) ?? [],
                scene: typeof entry.scene === "string" ? entry.scene : "",
            });
        }
    }
    if (!entities.length) throw new Error("这段内容没有可识别的人物、场景或镜头，请选择其他片段。");
    return { id, source, content, entities };
}

export function productionPrompt(plan: ProductionPlan, entity: ProductionEntity, target: "image" | "video", style: string, referenceNames: string[]) {
    const continuity = plan.entities.filter((other) => (other.kind === "character" && entity.characters.includes(other.name)) || (other.kind === "scene" && entity.scene === other.name));
    return [
        target === "image" ? entity.imagePrompt : entity.videoPrompt,
        `${entity.name}的设定：${entity.description}`,
        ...continuity.map((other) => `${other.kind === "character" ? "人物设定" : "场景设定"}（${other.name}）：${other.description}`),
        style.trim() && `统一风格：${style.trim()}`,
        referenceNames.length && `参考图对应：${referenceNames.map((name, index) => `图${index + 1}：${name}`).join("；")}。保持对应人物外观、服装和场景一致。`,
    ]
        .filter(Boolean)
        .join("\n\n");
}
