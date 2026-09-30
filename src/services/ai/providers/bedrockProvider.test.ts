import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));

vi.mock("@tauri-apps/plugin-http", () => ({
  fetch: mockFetch,
}));

import { createBedrockProvider, clearBedrockProvider } from "./bedrockProvider";

function okResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: vi.fn(() => Promise.resolve(body)),
    text: vi.fn(() => Promise.resolve("")),
  } as unknown as Response;
}

function errorResponse(status: number, text: string) {
  return {
    ok: false,
    status,
    text: vi.fn(() => Promise.resolve(text)),
  } as unknown as Response;
}

describe("bedrockProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearBedrockProvider();
    mockFetch.mockReset();
  });

  describe("createBedrockProvider", () => {
    it("is stateless — returns a provider with complete and testConnection", () => {
      const provider = createBedrockProvider("key", "us-east-1", "us.anthropic.claude-sonnet-4-6");
      expect(typeof provider.complete).toBe("function");
      expect(typeof provider.testConnection).toBe("function");
    });
  });

  describe("complete", () => {
    it("posts an InvokeModel request to the region endpoint and returns the text", async () => {
      mockFetch.mockResolvedValue(
        okResponse({ content: [{ type: "text", text: "Hello from Bedrock" }] }),
      );

      const provider = createBedrockProvider("key", "us-east-1", "us.anthropic.claude-sonnet-4-6");
      const result = await provider.complete({
        systemPrompt: "Be brief",
        userContent: "Hi",
      });

      expect(result).toBe("Hello from Bedrock");
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe(
        "https://bedrock-runtime.us-east-1.amazonaws.com/model/us.anthropic.claude-sonnet-4-6/invoke",
      );
      expect(options).toMatchObject({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer key",
        },
      });
      expect(JSON.parse(options.body)).toEqual({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 1024,
        system: "Be brief",
        messages: [{ role: "user", content: "Hi" }],
      });
    });

    it("omits system when the system prompt is empty", async () => {
      mockFetch.mockResolvedValue(okResponse({ content: [{ type: "text", text: "hi" }] }));

      const provider = createBedrockProvider("key", "us-east-1", "model");
      await provider.complete({ systemPrompt: "", userContent: "Hi" });

      const body = JSON.parse(mockFetch.mock.calls[0]![1].body);
      expect(body).not.toHaveProperty("system");
    });

    it("returns empty string when the response has no text block", async () => {
      mockFetch.mockResolvedValue(okResponse({ content: [{ type: "tool_use" }] }));

      const provider = createBedrockProvider("key", "us-east-1", "model");
      expect(await provider.complete({ systemPrompt: "", userContent: "Hi" })).toBe("");
    });
  });

  describe("testConnection", () => {
    it("returns { ok: true } on successful invoke", async () => {
      mockFetch.mockResolvedValue(okResponse({ content: [{ type: "text", text: "hi" }] }));

      const provider = createBedrockProvider("key", "us-east-1", "model");
      const result = await provider.testConnection();
      expect(result).toEqual({ ok: true });
    });

    it("returns { ok: false, error } when invoke fails with a status", async () => {
      mockFetch.mockResolvedValue(errorResponse(403, "AccessDeniedException"));

      const provider = createBedrockProvider("key", "us-east-1", "model");
      const result = await provider.testConnection();
      expect(result.ok).toBe(false);
      expect(result.error).toContain("403");
    });

    it("returns { ok: false, error } when fetch throws", async () => {
      mockFetch.mockRejectedValue(new Error("network down"));

      const provider = createBedrockProvider("key", "us-east-1", "model");
      const result = await provider.testConnection();
      expect(result.ok).toBe(false);
      expect(result.error).toContain("network down");
    });
  });
});