import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildThreadEml, buildAccountMbox } from "./exportService";
import { getDb } from "@/services/db/connection";

vi.mock("@/services/db/connection", () => ({
  getDb: vi.fn(),
}));
vi.mock("@/services/db/auditLog", () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}));

const mockSelect = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  (getDb as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    select: mockSelect,
    execute: vi.fn(),
  });
});

describe("buildThreadEml", () => {
  it("builds a single EML from the thread's messages", async () => {
    mockSelect.mockResolvedValueOnce([
      {
        id: "m1",
        from_name: "Alice",
        from_address: "alice@example.com",
        to_addresses: "me@example.com",
        cc_addresses: null,
        subject: "Hello",
        date: 1700000000000,
        body_html: "<p>Hi there</p>",
        body_text: "Hi there",
        message_id_header: "<abc@example.com>",
        references_header: null,
        in_reply_to_header: null,
      },
    ]);
    const eml = await buildThreadEml("acc-1", "t1");
    expect(eml).toContain("From: Alice <alice@example.com>");
    expect(eml).toContain("Subject: Hello");
    expect(eml).toContain("<p>Hi there</p>");
  });
});

describe("buildAccountMbox", () => {
  it("escapes From lines per mboxrd", async () => {
    mockSelect.mockResolvedValueOnce([
      {
        id: "m1",
        from_name: null,
        from_address: "alice@example.com",
        to_addresses: "me@example.com",
        cc_addresses: null,
        subject: "Fwd",
        date: 1700000000000,
        body_html: null,
        body_text: "From the top\n>From quoted",
        message_id_header: "<m1@example.com>",
        references_header: null,
        in_reply_to_header: null,
      },
    ]);
    const mbox = await buildAccountMbox("acc-1");
    expect(mbox).toContain("From alice@example.com");
    expect(mbox).toContain(">From the top");
    expect(mbox).toContain(">From quoted");
  });
});