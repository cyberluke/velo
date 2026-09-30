import { describe, it, expect, beforeEach, vi } from "vitest";

const mockCreate = vi.fn();

vi.mock("openai", () => {
  const MockOpenAI = vi.fn(function () {
    return { chat: { completions: { create: mockCreate } } };
  });
  return { default: MockOpenAI };
});

vi.mock("@tauri-apps/plugin-http", () => ({
  fetch: vi.fn(),
}));

import OpenAI from "openai";
import { fetch as pluginFetch } from "@tauri-apps/plugin-http";
import { createCustomProvider, clearCustomProvider } from "./customProvider";

describe("customProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearCustomProvider();
  });

  describe("createCustomProvider", () => {
    it("creates OpenAI client with custom baseURL and fetch routed through the Tauri HTTP plugin", () => {
      createCustomProvider("sk-test", "https://api.example.com/v1", "my-model");

      expect(OpenAI).toHaveBeenCalledWith({
        apiKey: "sk-test",
        baseURL: "https://api.example.com/v1",
        dangerouslyAllowBrowser: true,
        fetch: pluginFetch,
      });
    });

    it("strips trailing slashes from the base URL", () => {
      createCustomProvider("sk-test", "https://api.example.com/v1///", "my-model");

      expect(OpenAI).toHaveBeenCalledWith(
        expect.objectContaining({ baseURL: "https://api.example.com/v1" }),
      );
    });
  });

  describe("complete", () => {
    it("calls chat.completions.create with the custom model and messages", async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: "Hello!" } }],
      });

      const provider = createCustomProvider("sk-test", "https://api.example.com/v1", "my-model");
      const result = await provider.complete({
        systemPrompt: "You are helpful",
        userContent: "Hi",
      });

      expect(result).toBe("Hello!");
      expect(mockCreate).toHaveBeenCalledWith({
        model: "my-model",
        max_tokens: 1024,
        messages: [
          { role: "system", content: "You are helpful" },
          { role: "user", content: "Hi" },
        ],
      });
    });
  });

  describe("testConnection", () => {
    it("returns { ok: true } on successful completion", async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: "hi" } }],
      });

      const provider = createCustomProvider("sk-test", "https://api.example.com/v1", "my-model");
      const result = await provider.testConnection();
      expect(result).toEqual({ ok: true });
    });

    it("returns { ok: false, error } when completion throws", async () => {
      mockCreate.mockRejectedValue(new Error("404 model not found"));

      const provider = createCustomProvider("sk-test", "https://api.example.com/v1", "my-model");
      const result = await provider.testConnection();
      expect(result.ok).toBe(false);
      expect(result.error).toContain("404 model not found");
    });
  });

  describe("factory caching", () => {
    it("reuses client for same api key and base url", () => {
      createCustomProvider("sk-test", "https://api.example.com/v1", "my-model");
      createCustomProvider("sk-test", "https://api.example.com/v1", "other-model");

      expect(OpenAI).toHaveBeenCalledTimes(1);
    });

    it("creates new client when base url changes", () => {
      createCustomProvider("sk-test", "https://api.example.com/v1", "my-model");
      createCustomProvider("sk-test", "https://other.example.com/v1", "my-model");

      expect(OpenAI).toHaveBeenCalledTimes(2);
    });

    it("creates new client when the api key changes", () => {
      createCustomProvider("sk-test", "https://api.example.com/v1", "my-model");
      createCustomProvider("sk-other", "https://api.example.com/v1", "my-model");

      expect(OpenAI).toHaveBeenCalledTimes(2);
    });

    it("creates new client after clearCustomProvider", () => {
      createCustomProvider("sk-test", "https://api.example.com/v1", "my-model");
      clearCustomProvider();
      createCustomProvider("sk-test", "https://api.example.com/v1", "my-model");

      expect(OpenAI).toHaveBeenCalledTimes(2);
    });
  });
});