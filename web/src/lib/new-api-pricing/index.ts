// Prices are display-only. New API remains the authority for settlement.
// Expression parsing is vendored from QuantumNous/new-api; see expression/ and LICENSE.
import { compileBillingExpression } from "./expression/parser";
import { readTokenTierChain, readTaskTierChain, readTimeTokenPricing } from "./expression/display";
import type { PricingModel } from "@/services/api/new-api-platform";

export type PriceRow = { label: string; condition: string; prices: Array<{ key: string; value: number; unit: string }> };
export function pricingRows(model: PricingModel): { rows: PriceRow[]; special: boolean; rules: string[] } {
    if (model.billing_mode !== "tiered_expr") {
        if (model.quota_type === 1 && model.model_price !== undefined) return { rows: [{ label: "", condition: "", prices: [{ key: "request", value: model.model_price, unit: "request" }] }], special: false, rules: [] };
        if (model.model_ratio === undefined || model.completion_ratio === undefined) return { rows: [], special: true, rules: [] };
        const base = model.model_ratio * 2;
        const prices = [
            { key: "p", value: base, unit: "million" },
            { key: "c", value: base * model.completion_ratio, unit: "million" },
        ];
        for (const [key, ratio] of [
            ["cr", model.cache_ratio],
            ["cc", model.create_cache_ratio],
            ["img", model.image_ratio],
            ["ai", model.audio_ratio],
            ["ao", model.audio_ratio != null && model.audio_completion_ratio != null ? model.audio_ratio * model.audio_completion_ratio : undefined],
        ] as const) {
            if (ratio != null) prices.push({ key, value: base * ratio, unit: "million" });
        }
        return { rows: [{ label: "", condition: "", prices }], special: false, rules: [] };
    }
    const compiled = compileBillingExpression(model.billing_expr || "");
    if (compiled.status !== "ready") return { rows: [], special: true, rules: [] };
    const rules = compiled.requestRules.map((rule) => rule.cond + " × " + rule.multiplier);
    // Do not extract partial/minimum prices from custom request-dependent expressions.
    const tokens = readTokenTierChain(compiled.ast) || readTimeTokenPricing(compiled.source)?.tiers;
    if (tokens)
        return {
            special: false,
            rules,
            rows: tokens.map((tier) => ({
                label: tier.label,
                condition: tier.conditionText || tier.conditions.map((item) => item.var + " " + item.op + " " + item.value.toLocaleString()).join(" · "),
                prices: tier.billingUnit === "request" ? [{ key: "request", value: tier.fixedPrice!, unit: tier.imageCount ? "image" : "request" }] : Object.entries(tier.prices).map(([key, value]) => ({ key, value, unit: "million" })),
            })),
        };
    const schema = model.billing_usage_schema || {};
    const tasks = readTaskTierChain(compiled.ast, schema, true);
    if (tasks)
        return {
            special: false,
            rules,
            rows: tasks.map((tier) => ({
                label: tier.label,
                condition: tier.conditions.map((item) => item.field + " = " + item.value).join(" · "),
                prices: [
                    ...(tier.constant ? [{ key: "request", value: tier.constant, unit: "request" }] : []),
                    ...Object.entries(tier.unitPrices).map(([key, value]) => ({ key, value, unit: schema[key]?.unit === "token" ? "million" : schema[key]?.unit || "count" })),
                ],
            })),
        };
    return { rows: [], special: true, rules };
}
