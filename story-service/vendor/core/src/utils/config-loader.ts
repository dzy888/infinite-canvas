import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ProjectConfigSchema } from "../models/project.js";
import { managedLLM } from "../dmx-runtime.js";
import type { ProjectConfig } from "../models/project.js";
import {
  resolveEffectiveLLMConfig,
  type LLMConfigCliOverrides,
  type LLMConsumer,
} from "./effective-llm-config.js";
import { loadLLMEnvLayers, GLOBAL_CONFIG_DIR, GLOBAL_ENV_PATH } from "./llm-env.js";
import { isApiKeyOptionalForEndpoint } from "./llm-endpoint-auth.js";

export { GLOBAL_CONFIG_DIR, GLOBAL_ENV_PATH, isApiKeyOptionalForEndpoint };

export async function loadProjectConfig(
  root: string,
  options?: {
    readonly requireApiKey?: boolean;
    readonly cli?: LLMConfigCliOverrides;
    readonly consumer?: LLMConsumer;
  },
): Promise<ProjectConfig> {
  if (process.env.DMX_STORY_RELAY) {
    const config = ProjectConfigSchema.parse(JSON.parse(await readFile(join(root, "inkos.json"), "utf8")));
    return { ...config, llm: managedLLM({ ...config.llm, model: config.llm.defaultModel ?? config.llm.model }), modelOverrides: {}, notify: [], detection: undefined, researchSearch: { enabled: false, provider: "tavily" } };
  }
  const envLayers = await loadLLMEnvLayers(root);
  const result = await resolveEffectiveLLMConfig({
    consumer: options?.consumer ?? "cli",
    projectRoot: root,
    envLayers,
    cli: options?.cli,
    requireApiKey: options?.requireApiKey,
  });
  return result.config;
}
