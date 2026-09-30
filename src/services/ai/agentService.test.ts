import { describe, it, expect, beforeEach, vi } from "vitest";

const mockCompleteWithTools = vi.fn();

vi.mock("@/services/db/settings", () => ({
  getSetting: vi.fn(),
  getSecureSetting: vi.fn(),
}));

vi.mock("@/services/db/connection", () => ({
  getDb: vi.fn(),
}));

vi.mock("@/services/unsubscribe/unsubscribeManager", () => ({
  getSubscriptions: vi.fn(),
  executeUnsubscribe: vi.fn(),
}));

vi.mock("@/services/db/threads", () => ({
  getThreadsForCategory: vi.fn(),
}));

vi.mock("@/services/db/search", () => ({
  searchMessages: vi.fn(),
}));

vi.mock("@/services/emailActions", () => ({
  archiveThread: vi.fn(),
}));

vi.mock("./providers/claudeProvider", () => ({
  createClaudeProvider: vi.fn(() => ({
    completeWithTools: mockCompleteWithTools,
  })),
}));

import { getSecureSetting, getSetting } from "@/services/db/settings";
import { getSubscriptions } from "@/services/unsubscribe/unsubscribeManager";
import { getThreadsForCategory } from "@/services/db/threads";
import { sendAgentMessage } from "./agentService";

const mockGetSecureSetting = vi.mocked(getSecureSetting);
const mockGetSetting = vi.mocked(getSetting);
const mockGetSubscriptions = vi.mocked(getSubscriptions);
const mockGetThreadsForCategory = vi.mocked(getThreadsForCategory);

function textTurn(text: string) {
  return {
    text,
    toolCalls: undefined,
    stopReason: "end_turn",
    contentBlocks: [{ type: "text", text }],
  };
}

function toolTurn(name: string, input: Record<string, unknown>, id = "tool_1") {
  return {
    text: undefined,
    toolCalls: [{ id, name, input }],
    stopReason: "tool_use",
    contentBlocks: [
      { type: "tool_use", id, name, input } as unknown as import("@anthropic-ai/sdk/resources/messages/messages").ToolUseBlock,
    ],
  };
}

describe("agentService.sendAgentMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSecureSetting.mockResolvedValue("sk-ant-test");
    mockGetSetting.mockResolvedValue(null);
  });

  it("returns history unchanged and emits an error when no API key is configured", async () => {
    mockGetSecureSetting.mockResolvedValue(null);

    const events: string[] = [];
    const history = await sendAgentMessage("hi", "acc1", [], (e) => {
      if (e.type === "error") events.push(e.error);
    });

    expect(events.length).toBe(1);
    expect(history).toEqual([]);
    expect(mockCompleteWithTools).not.toHaveBeenCalled();
  });

  it("runs the tool loop: tool_use turn, executes get_subscriptions, then end_turn with the final text", async () => {
    mockCompleteWithTools
      .mockResolvedValueOnce(
        toolTurn("get_subscriptions", {}),
      )
      .mockResolvedValueOnce(
        textTurn("Here are your subscriptions."),
      );

    mockGetSubscriptions.mockResolvedValue([
      {
        from_address: "news@example.com",
        from_name: "Newsletter",
        message_count: 12,
        latest_unsubscribe_header: "<https://example.com/unsub>",
        latest_unsubscribe_post: null,
      },
    ]);

    const events: string[] = [];
    const history = await sendAgentMessage(
      "find my subscriptions",
      "acc1",
      [],
      (e) => {
        if (e.type === "tool_start") events.push(`start:${e.toolName}`);
        if (e.type === "tool_end") events.push(`end:${e.toolName}:${e.success}`);
        if (e.type === "message") events.push(`msg:${e.message.content}`);
        if (e.type === "done") events.push("done");
      },
    );

    // Tool loop events in order
    expect(events).toEqual([
      "start:get_subscriptions",
      "end:get_subscriptions:true",
      "msg:Here are your subscriptions.",
      "done",
    ]);

    // History contains user msg, assistant tool_use, tool_result, assistant text
    expect(history[0]).toMatchObject({ role: "user", content: "find my subscriptions" });
    expect(history[1]).toMatchObject({ role: "assistant" });
    expect(history[2]).toMatchObject({ role: "user" });
    expect(history[3]).toMatchObject({ role: "assistant" });

    // The tool_result content carries the subscription data
    const toolResult = history[2] as { content: Array<{ type: string; content: string }> };
    const payload = JSON.parse(toolResult.content[0]!.content);
    expect(payload.subscriptions[0]).toMatchObject({
      from_address: "news@example.com",
      message_count: 12,
      has_one_click: false,
    });
  });

  it("executes get_newsletter_threads with the given category", async () => {
    mockCompleteWithTools
      .mockResolvedValueOnce(
        toolTurn("get_newsletter_threads", { category: "Newsletters" }),
      )
      .mockResolvedValueOnce(textTurn("Found 2 newsletter threads."));

    mockGetThreadsForCategory.mockResolvedValue([
      {
        id: "t1",
        account_id: "acc1",
        subject: "Weekly digest",
        from_name: "News",
        from_address: "news@example.com",
        message_count: 5,
        is_read: 1,
      },
    ]);

    await sendAgentMessage("show newsletters", "acc1", [], () => {});

    expect(mockGetThreadsForCategory).toHaveBeenCalledWith("acc1", "Newsletters", 100, 0);
  });

  it("surfaces provider errors as an error event and stops the loop", async () => {
    mockCompleteWithTools.mockRejectedValue(new Error("401 invalid api key"));

    const events: string[] = [];
    const history = await sendAgentMessage("hi", "acc1", [], (e) => {
      if (e.type === "error") events.push(e.error);
    });

    expect(events).toContain("401 invalid api key");
    // The user message was appended before the failure
    expect(history[0]).toMatchObject({ role: "user", content: "hi" });
  });
});