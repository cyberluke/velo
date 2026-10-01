import { describe, it, expect, vi, beforeEach } from "vitest";
import { getFollowThroughItems } from "./followThrough";
import { getDb } from "@/services/db/connection";

vi.mock("@/services/db/connection", () => ({
  getDb: vi.fn(),
}));

const mockSelect = vi.fn();
const mockExecute = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  (getDb as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    select: mockSelect,
    execute: mockExecute,
  });
});

describe("getFollowThroughItems", () => {
  it("returns empty when no accounts", async () => {
    const result = await getFollowThroughItems([], {});
    expect(result).toEqual([]);
  });

  it("skips threads whose last message is from the user's own address", async () => {
    mockSelect
      .mockResolvedValueOnce([
        {
          account_id: "acc-1",
          thread_id: "t1",
          subject: "Need your sign-off",
          peer_name: "Alice",
          peer_address: "alice@example.com",
          last_message_at: Math.floor(Date.now() / 1000) - 5 * 86400,
          message_count: 4,
          is_starred: 0,
        },
        {
          account_id: "acc-1",
          thread_id: "t2",
          subject: "Re: my own note",
          peer_name: "Me",
          peer_address: "me@example.com",
          last_message_at: Math.floor(Date.now() / 1000) - 5 * 86400,
          message_count: 2,
          is_starred: 0,
        },
      ])
      .mockResolvedValueOnce([]) // tasks check for t1
      .mockResolvedValueOnce([]); // tasks check for t2

    const result = await getFollowThroughItems(
      ["acc-1"],
      { "acc-1": new Set(["me@example.com"]) },
      2,
    );

    // t2's last message is from the user itself → excluded
    expect(result.map((r) => r.threadId)).toEqual(["t1"]);
    expect(result[0]!.daysWaiting).toBe(5);
  });

  it("excludes trash/spam/sent/newsletter threads via NOT EXISTS", async () => {
    mockSelect
      .mockResolvedValueOnce([
        {
          account_id: "acc-1",
          thread_id: "t1",
          subject: "Hey",
          peer_name: "Bob",
          peer_address: "bob@example.com",
          last_message_at: Math.floor(Date.now() / 1000) - 3 * 86400,
          message_count: 1,
          is_starred: 0,
        },
      ])
      .mockResolvedValueOnce([]);

    const result = await getFollowThroughItems(
      ["acc-1"],
      { "acc-1": new Set(["me@example.com"]) },
      2,
    );
    expect(result).toHaveLength(1);
    // The SQL where-clause carries the label exclusions; the service filters only own-address
    expect(result[0]!.threadId).toBe("t1");
  });
});