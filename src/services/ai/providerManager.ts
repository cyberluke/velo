import { getSetting, getSecureSetting } from "@/services/db/settings";
import { AiError } from "./errors";
import type { AiProvider, AiProviderClient } from "./types";
import { DEFAULT_MODELS, MODEL_SETTINGS, resolveModelId } from "./types";
import { createClaudeProvider, clearClaudeProvider } from "./providers/claudeProvider";
import { createOpenAIProvider, clearOpenAIProvider } from "./providers/openaiProvider";
import { createGeminiProvider, clearGeminiProvider } from "./providers/geminiProvider";
import { createOllamaProvider, clearOllamaProvider } from "./providers/ollamaProvider";
import { createCopilotProvider, clearCopilotProvider } from "./providers/copilotProvider";
import { createCustomProvider, clearCustomProvider } from "./providers/customProvider";
import { createBedrockProvider, clearBedrockProvider } from "./providers/bedrockProvider";

// Bedrock, custom and Ollama carry their own credential shapes (region/model,
// base URL/model, server URL/model), so they are handled as special cases in
// getActiveProvider below rather than as a single API key.
const API_KEY_SETTINGS: Record<Exclude<AiProvider, "ollama" | "custom" | "bedrock">, string> = {
  claude: "claude_api_key",
  openai: "openai_api_key",
  gemini: "gemini_api_key",
  copilot: "copilot_api_key",
};

let cachedProvider: { name: AiProvider; key: string; client: AiProviderClient } | null = null;

export async function getActiveProviderName(): Promise<AiProvider> {
  const setting = await getSetting("ai_provider");
  if (
    setting === "openai" ||
    setting === "gemini" ||
    setting === "ollama" ||
    setting === "copilot" ||
    setting === "custom" ||
    setting === "bedrock"
  )
    return setting;
  return "claude";
}

export async function getActiveProvider(): Promise<AiProviderClient> {
  const providerName = await getActiveProviderName();

  if (providerName === "ollama") {
    const serverUrl = (await getSetting("ollama_server_url")) ?? "http://localhost:11434";
    const model = (await getSetting("ollama_model")) ?? "llama3.2";
    const apiKey = (await getSecureSetting("ollama_api_key")) ?? "";
    const cacheKey = `${serverUrl}|${model}|${apiKey}`;

    if (cachedProvider && cachedProvider.name === "ollama" && cachedProvider.key === cacheKey) {
      return cachedProvider.client;
    }

    const client = createOllamaProvider(serverUrl, model, apiKey);
    cachedProvider = { name: "ollama", key: cacheKey, client };
    return client;
  }

  if (providerName === "custom") {
    const apiKey = await getSecureSetting("custom_api_key");
    if (!apiKey) {
      throw new AiError("NOT_CONFIGURED", "Custom provider API key not configured");
    }
    const baseUrl = (await getSetting("custom_base_url")) ?? "http://localhost:11434/v1";
    const model = (await getSetting("custom_model")) ?? DEFAULT_MODELS.custom;
    const cacheKey = `${apiKey}|${baseUrl}|${model}`;

    if (cachedProvider && cachedProvider.name === "custom" && cachedProvider.key === cacheKey) {
      return cachedProvider.client;
    }

    const client = createCustomProvider(apiKey, baseUrl, model);
    cachedProvider = { name: "custom", key: cacheKey, client };
    return client;
  }

  if (providerName === "bedrock") {
    const apiKey = await getSecureSetting("bedrock_api_key");
    if (!apiKey) {
      throw new AiError("NOT_CONFIGURED", "Bedrock API key not configured");
    }
    const region = (await getSetting("bedrock_region")) ?? "us-east-1";
    const model = (await getSetting("bedrock_model")) ?? DEFAULT_MODELS.bedrock;
    const cacheKey = `${apiKey}|${region}|${model}`;

    if (cachedProvider && cachedProvider.name === "bedrock" && cachedProvider.key === cacheKey) {
      return cachedProvider.client;
    }

    const client = createBedrockProvider(apiKey, region, model);
    cachedProvider = { name: "bedrock", key: cacheKey, client };
    return client;
  }

  const keySetting = API_KEY_SETTINGS[providerName];
  const apiKey = await getSecureSetting(keySetting);

  if (!apiKey) {
    throw new AiError("NOT_CONFIGURED", `${providerName} API key not configured`);
  }

  const model = resolveModelId(
    (await getSetting(MODEL_SETTINGS[providerName])) ?? DEFAULT_MODELS[providerName],
  );
  const cacheKey = `${apiKey}|${model}`;

  if (cachedProvider && cachedProvider.name === providerName && cachedProvider.key === cacheKey) {
    return cachedProvider.client;
  }

  let client: AiProviderClient;
  switch (providerName) {
    case "claude":
      client = createClaudeProvider(apiKey, model);
      break;
    case "openai":
      client = createOpenAIProvider(apiKey, model);
      break;
    case "gemini":
      client = createGeminiProvider(apiKey, model);
      break;
    case "copilot":
      client = createCopilotProvider(apiKey, model);
      break;
  }

  cachedProvider = { name: providerName, key: cacheKey, client };
  return client;
}

export async function isAiAvailable(): Promise<boolean> {
  try {
    const enabled = await getSetting("ai_enabled");
    if (enabled === "false") return false;
    const providerName = await getActiveProviderName();

    if (providerName === "ollama") {
      const serverUrl = await getSetting("ollama_server_url");
      return !!serverUrl;
    }

    if (providerName === "custom") {
      const apiKey = await getSecureSetting("custom_api_key");
      const baseUrl = await getSetting("custom_base_url");
      return !!apiKey && !!baseUrl;
    }

    if (providerName === "bedrock") {
      const apiKey = await getSecureSetting("bedrock_api_key");
      return !!apiKey;
    }

    const keySetting = API_KEY_SETTINGS[providerName];
    const key = await getSecureSetting(keySetting);
    return !!key;
  } catch {
    return false;
  }
}

export function clearProviderClients(): void {
  cachedProvider = null;
  clearClaudeProvider();
  clearOpenAIProvider();
  clearGeminiProvider();
  clearOllamaProvider();
  clearCopilotProvider();
  clearCustomProvider();
  clearBedrockProvider();
}
