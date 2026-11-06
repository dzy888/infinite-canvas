export type PlatformModel = {
  name: string;
  capabilities: ("text" | "image" | "video" | "audio")[];
  api_format: "openai" | "gemini";
  text_endpoint: "chat" | "responses";
  group: string;
  group_ratio: number;
  description?: string;
};
import type { BillingUsageSchema } from "../web/src/lib/new-api-pricing/types";

export type PricingModel = {
  model_name: string;
  enable_groups: string[];
  supported_endpoint_types: string[];
  description?: string;
  quota_type?: number;
  model_ratio?: number;
  completion_ratio?: number;
  model_price?: number;
  cache_ratio?: number | null;
  create_cache_ratio?: number | null;
  image_ratio?: number | null;
  audio_ratio?: number | null;
  audio_completion_ratio?: number | null;
  billing_mode?: string;
  billing_expr?: string;
  billing_usage_schema?: BillingUsageSchema;
  billing_plugin_variants?: Array<{
    plugin_key: string;
    plugin_name: string;
    billing_mode?: string;
    billing_expr: string;
    billing_usage_schema: BillingUsageSchema;
  }>;
};
export type PricingCatalog = {
  data: PricingModel[];
  group_ratio: Record<string, number>;
  usable_group: Record<string, string>;
  auto_groups: string[];
};
export function modelsFromPricing(
  pricing: PricingCatalog,
  userGroup: string,
): PlatformModel[] {
  const priority = [
    ...new Set([
      userGroup,
      ...pricing.auto_groups,
      ...Object.keys(pricing.usable_group).sort(),
    ]),
  ];
  return pricing.data
    .flatMap((item): PlatformModel[] => {
      const group = priority.find(
        (candidate) =>
          candidate !== "auto" &&
          candidate in pricing.usable_group &&
          (item.enable_groups.includes(candidate) ||
            item.enable_groups.includes("all")),
      );
      if (!group) return [];
      const name = item.model_name.toLowerCase(),
        endpoints = item.supported_endpoint_types;
      const offer: PlatformModel = {
        name: item.model_name,
        capabilities: [],
        api_format: "openai",
        text_endpoint: "chat",
        group,
        group_ratio: pricing.group_ratio[group],
        description: item.description,
      };
      if (name.includes("tts") || name.includes("speech"))
        offer.capabilities = ["audio"];
      else if (endpoints.includes("openai-video"))
        offer.capabilities = ["video"];
      else if (endpoints.includes("image-generation"))
        offer.capabilities = ["image"];
      else if (endpoints.includes("openai-response")) {
        offer.capabilities = ["text"];
        offer.text_endpoint = "responses";
      } else if (
        endpoints.includes("openai") ||
        endpoints.includes("anthropic")
      )
        offer.capabilities = ["text"];
      else if (endpoints.includes("gemini")) {
        offer.capabilities = ["text"];
        offer.api_format = "gemini";
      }
      if (
        endpoints.includes("gemini") &&
        (name.includes("image") || name.includes("nano-banana"))
      ) {
        offer.capabilities = ["image", "text"];
        offer.api_format = "gemini";
      }
      return offer.capabilities.length ? [offer] : [];
    })
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}
