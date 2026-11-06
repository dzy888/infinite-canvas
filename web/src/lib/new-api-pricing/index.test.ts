import { test } from "node:test";
import assert from "node:assert/strict";
import { pricingRows } from "./index";
import type { PricingModel } from "@/services/api/new-api-platform";
const model = (fields: Partial<PricingModel>): PricingModel => ({ model_name: "test", enable_groups: ["default"], supported_endpoint_types: ["openai"], ...fields });

test("native context tiers preserve all thresholds and explicit cache prices", () => {
    const prices = pricingRows(model({ billing_mode: "tiered_expr", billing_expr: 'len <= 200000 ? tier("standard", p * 3 + c * 15 + cr * 0 + cc * 3.75) : tier("long", p * 6 + c * 22.5 + cr * 0.6 + cc * 7.5)' }));
    assert.equal(prices.special, false);
    assert.equal(prices.rows.length, 2);
    assert.equal(prices.rows[0].condition, "len <= 200,000");
    assert.equal(prices.rows[0].prices.find((price) => price.key === "cr")?.value, 0);
    assert.equal(prices.rows[1].prices.find((price) => price.key === "c")?.value, 22.5);
});
test("fixed and task usage prices keep their native units and never revert to old prices", () => {
    const free = pricingRows(model({ billing_mode: "tiered_expr", billing_expr: 'tier("free", fixed(0)) * image_count', model_price: 12, quota_type: 1 }));
    assert.deepEqual(free.rows[0].prices, [{ key: "request", value: 0, unit: "image" }]);
    const task = pricingRows(
        model({ billing_mode: "tiered_expr", billing_expr: 'tier("base", 0.1 + u("seconds") * 0.4 + u("tokens") * 9.8 / 1000000)', billing_usage_schema: { seconds: { type: "number", unit: "second" }, tokens: { type: "number", unit: "token" } } }),
    );
    assert.equal(task.special, false);
    assert.deepEqual(task.rows[0].prices, [
        { key: "request", value: 0.1, unit: "request" },
        { key: "seconds", value: 0.4, unit: "second" },
        { key: "tokens", value: 9.8, unit: "million" },
    ]);
});
test("legacy prices retain zero cache overrides and unknown expressions do not invent prices", () => {
    const legacy = pricingRows(model({ model_ratio: 1.5, completion_ratio: 5, cache_ratio: 0, quota_type: 0 }));
    assert.equal(legacy.rows[0].prices.find((price) => price.key === "p")?.value, 3);
    assert.equal(legacy.rows[0].prices.find((price) => price.key === "c")?.value, 15);
    assert.equal(legacy.rows[0].prices.find((price) => price.key === "cr")?.value, 0);
    assert.equal(pricingRows(model({ billing_mode: "tiered_expr", billing_expr: 'tier("custom", p * c)', model_price: 0.01, quota_type: 1 })).special, true);
});
