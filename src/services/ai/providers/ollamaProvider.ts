import OpenAI from "openai";
import { fetch } from "@tauri-apps/plugin-http";
import type { AiProviderClient, AiCompletionRequest } from "../types";
import { localApiKey, normalizeLocalBaseUrl } from "../localOpenAi";

let instance: OpenAI | null = null;
let cachedKey: string | null = null;

function getClient(serverUrl: string, model: string, apiKey?: string | null): OpenAI {
  const resolvedKey = localApiKey(apiKey);
  const cacheKey = `${serverUrl}|${model}|${resolvedKey}`;
  if (!instance || cachedKey !== cacheKey) {
    instance = new OpenAI({
      baseURL: normalizeLocalBaseUrl(serverUrl),
      apiKey: resolvedKey,
      dangerouslyAllowBrowser: true,
      fetch,
    });
    cachedKey = cacheKey;
  }
  return instance;
}

export function createOllamaProvider(
  serverUrl: string,
  model: string,
  apiKey?: string | null,
): AiProviderClient {
  const client = getClient(serverUrl, model, apiKey);

  return {
    async complete(req: AiCompletionRequest): Promise<string> {
      const response = await client.chat.completions.create({
        model,
        max_tokens: req.maxTokens ?? 1024,
        messages: [
          { role: "system", content: req.systemPrompt },
          { role: "user", content: req.userContent },
        ],
      });

      return response.choices[0]?.message?.content ?? "";
    },

    async testConnection(): Promise<boolean> {
      try {
        await client.chat.completions.create({
          model,
          max_tokens: 10,
          messages: [{ role: "user", content: "Say hi" }],
        });
        return true;
      } catch {
        return false;
      }
    },
  };
}

export function clearOllamaProvider(): void {
  instance = null;
  cachedKey = null;
}
