import { describe, it, expect } from "vitest";
import { localApiKey, normalizeLocalBaseUrl } from "./localOpenAi";

describe("local OpenAI helpers", () => {
  it("appends /v1 once", () => {
    expect(normalizeLocalBaseUrl("http://localhost:11434")).toBe("http://localhost:11434/v1");
    expect(normalizeLocalBaseUrl("http://localhost:1234/v1/")).toBe("http://localhost:1234/v1");
  });

  it("falls back to ollama when no key is set", () => {
    expect(localApiKey(undefined)).toBe("ollama");
    expect(localApiKey("  ")).toBe("ollama");
    expect(localApiKey("sk-local")).toBe("sk-local");
  });
});
