import { fetch } from "@tauri-apps/plugin-http";

export interface LocalModel {
  id: string;
}

export function normalizeLocalBaseUrl(serverUrl: string): string {
  const trimmed = serverUrl.trim().replace(/\/+$/, "");
  return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
}

export function localApiKey(apiKey?: string | null): string {
  const trimmed = apiKey?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "ollama";
}

export async function listLocalModels(
  serverUrl: string,
  apiKey?: string | null,
): Promise<LocalModel[]> {
  const response = await fetch(`${normalizeLocalBaseUrl(serverUrl)}/models`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${localApiKey(apiKey)}`,
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(`Local model list failed (${response.status})`);
  }
  const payload = (await response.json()) as {
    data?: Array<{ id?: string }>;
    models?: Array<{ name?: string; id?: string; model?: string }>;
  };
  const fromOpenAi = payload.data?.map((item) => item.id).filter(Boolean) ?? [];
  const fromOllama =
    payload.models
      ?.map((item) => item.id ?? item.name ?? item.model)
      .filter(Boolean) ?? [];
  const seen = new Set<string>();
  const models: LocalModel[] = [];
  for (const id of [...fromOpenAi, ...fromOllama]) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    models.push({ id });
  }
  return models.sort((a, b) => a.id.localeCompare(b.id));
}
