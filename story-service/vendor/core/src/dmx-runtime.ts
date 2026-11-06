// DmxVideo integration: force all model calls through the authenticated gateway.
import type { LLMConfig } from "./models/project.js";
export function managedLLM(config: LLMConfig): LLMConfig {
  if (!process.env.DMX_STORY_RELAY) return config;
  let format: "chat" | "responses" = config.apiFormat === "responses" ? "responses" : "chat";
  let model = config.model;
  try { const decoded = JSON.parse(Buffer.from(config.model.slice(4), "base64url").toString()); if (typeof decoded.model === "string") model = decoded.model; format = decoded.format === "responses" ? "responses" : "chat"; } catch { /* The gateway rejects models outside the catalog. */ }
  return { ...config, model, provider: "custom", service: "custom", configSource: "studio", baseUrl: process.env.DMX_STORY_RELAY + "/v1", apiKey: process.env.DMX_STORY_KEY ?? "", apiFormat: format, headers: {}, proxyUrl: undefined };
}
