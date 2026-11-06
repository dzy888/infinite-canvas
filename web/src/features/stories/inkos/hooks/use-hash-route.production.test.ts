import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHash, routeToHash } from "./use-hash-route";
import { sourceRoute } from "@/types/story-production";
test("returning from a workbench opens the original chapter, including after reload", () => {
    const source = { kind: "book" as const, id: "雨夜 1", title: "雨夜", partId: "12", partTitle: "第十二章" };
    const route = { page: "chapter" as const, bookId: source.id, chapterNumber: 12 };
    assert.deepEqual(parseHash(sourceRoute(source).split("#")[1]), route);
    assert.deepEqual(parseHash(routeToHash(route)), route);
});
