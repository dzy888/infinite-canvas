import { test } from "node:test";
import assert from "node:assert/strict";
import { parseProductionPlan, productionPrompt, scriptSections } from "./story-production";
import { sourceRoute } from "../types/story-production";
const source = { kind: "book" as const, id: "月下旅人", title: "月下旅人", partId: "2", partTitle: "第二章" };
const reply = {
    characters: [{ name: "林月", description: "黑色短发，蓝色外套", imagePrompt: "林月定妆照" }],
    scenes: [{ name: "车站", description: "夜晚的旧车站", imagePrompt: "旧车站全景" }],
    shots: [{ name: "离站", description: "林月走出车站", characters: ["林月"], scene: "车站", imagePrompt: "中景，林月站在车站门口", videoPrompt: "林月走出车站，镜头缓慢跟随" }],
};
test("only the selected section is analysed, with its heading and exact text", () => {
    const content = "序言\n\n## 第一幕\n林月在车站。\n\n## 第二幕\n林月走出车站。";
    const sections = scriptSections(content);
    assert.deepEqual(
        sections.map((section) => section.title),
        ["第一幕", "第二幕"],
    );
    assert.equal(sections[1].content, "## 第二幕\n林月走出车站。");
    assert.equal(sections[0].content.includes("走出"), false);
});
test("structured output accepts JSON fences and preserves source/revision/text", () => {
    const plan = parseProductionPlan("```json\n" + JSON.stringify(reply) + "\n```", { ...source, revisionId: "rev-1" }, "原始片段", "plan-1");
    assert.equal(plan.source.revisionId, "rev-1");
    assert.equal(plan.content, "原始片段");
    assert.deepEqual(plan.entities[2].characters, ["林月"]);
    assert.equal(plan.entities[2].kind, "shot");
});
test("malformed or incomplete model output is rejected before creating generation drafts", () => {
    for (const answer of ["不是JSON", "{}", JSON.stringify({ ...reply, shots: [{ name: "镜头", description: "", imagePrompt: "" }] }), JSON.stringify({ ...reply, shots: [{ ...reply.shots[0], characters: "林月" }] })]) {
        assert.throws(() => parseProductionPlan(answer, source, "片段", "bad"));
    }
});
test("video import includes approved continuity, style and ordered reference names", () => {
    const plan = parseProductionPlan(JSON.stringify(reply), source, "片段", "plan");
    const prompt = productionPrompt(plan, plan.entities[2], "video", "写实电影", ["林月", "车站"]);
    assert.match(prompt, /走出车站/);
    assert.match(prompt, /黑色短发，蓝色外套/);
    assert.match(prompt, /夜晚的旧车站/);
    assert.match(prompt, /统一风格：写实电影/);
    assert.match(prompt, /图1：林月；图2：车站/);
    assert.equal(sourceRoute(source), "/stories#chapter/%E6%9C%88%E4%B8%8B%E6%97%85%E4%BA%BA/2");
});
