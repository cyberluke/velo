import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/services/db/settings", () => ({
  getSetting: vi.fn(),
  getSecureSetting: vi.fn(),
}));
vi.mock("./providerManager", () => ({
  getActiveProviderName: vi.fn(),
}));

import { getSetting, getSecureSetting } from "@/services/db/settings";
import { getActiveProviderName } from "./providerManager";
import { resolveDictationEndpoint } from "./voiceDictation";

const mockGetSetting = getSetting as unknown as ReturnType<typeof vi.fn>;
const mockGetSecureSetting = getSecureSetting as unknown as ReturnType<typeof vi.fn>;
const mockProvider = getActiveProviderName as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetAllMocks();
  mockGetSetting.mockImplementation(async (key: string) => {
    const map: Record<string, string> = {
      custom_base_url: "http://gw.local:8080/v1/",
      ollama_server_url: "http://localhost:11434",
    };
    return map[key] ?? null;
  });
  mockGetSecureSetting.mockResolvedValue(null);
});

describe("resolveDictationEndpoint", () => {
  it("defaults the model to whisper-1 and targets OpenAI when provider is openai", async () => {
    mockProvider.mockResolvedValue("openai");
    mockGetSecureSetting.mockResolvedValue("sk-test");
    const endpoint = await resolveDictationEndpoint();
    expect(endpoint).toEqual({ apiKey: "sk-test", model: "whisper-1" });
    expect(endpoint.baseURL).toBeUndefined();
    expect(endpoint.useTauriFetch).toBeUndefined();
  });

  it("honours the dictation_model setting override", async () => {
    mockProvider.mockResolvedValue("openai");
    mockGetSecureSetting.mockResolvedValue("sk-test");
    mockGetSetting.mockImplementation(async (key: string) => (key === "dictation_model" ? "large-v3" : null));
    const endpoint = await resolveDictationEndpoint();
    expect(endpoint.model).toBe("large-v3");
  });

  it("reports VOICE_NO_KEY when the OpenAI key is missing", async () => {
    mockProvider.mockResolvedValue("openai");
    await expect(resolveDictationEndpoint()).rejects.toThrow("VOICE_NO_KEY");
  });

  it("uses the custom gateway base URL + key with Tauri fetch", async () => {
    mockProvider.mockResolvedValue("custom");
    mockGetSecureSetting.mockResolvedValue("custom-key");
    const endpoint = await resolveDictationEndpoint();
    expect(endpoint).toMatchObject({
      baseURL: "http://gw.local:8080/v1",
      apiKey: "custom-key",
      useTauriFetch: true,
    });
  });

  it("reports VOICE_NO_KEY when the custom gateway has no key or URL", async () => {
    mockProvider.mockResolvedValue("custom");
    await expect(resolveDictationEndpoint()).rejects.toThrow("VOICE_NO_KEY");
  });

  it("normalizes a local server URL to /v1 and uses the placeholder key", async () => {
    mockProvider.mockResolvedValue("ollama");
    const endpoint = await resolveDictationEndpoint();
    expect(endpoint).toMatchObject({
      baseURL: "http://localhost:11434/v1",
      apiKey: "ollama",
      useTauriFetch: true,
    });
  });

  it("reports VOICE_PROVIDER for providers without an OpenAI-compatible audio endpoint", async () => {
    mockProvider.mockResolvedValue("claude");
    await expect(resolveDictationEndpoint()).rejects.toThrow("VOICE_PROVIDER");
    mockProvider.mockResolvedValue("bedrock");
    await expect(resolveDictationEndpoint()).rejects.toThrow("VOICE_PROVIDER");
  });
});