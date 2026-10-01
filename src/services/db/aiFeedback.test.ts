import { describe, it, expect, vi, beforeEach } from "vitest";
import { getAiFeedback, recordAiFeedback, getLatestAiFeedback } from "./aiFeedback";
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

describe("aiFeedback", () => {
  it("records feedback rows", async () => {
    await recordAiFeedback("acc-1", "t1", "summary", -1);
    expect(mockExecute).toHaveBeenCalledTimes(1);
    const sql = mockExecute.mock.calls[0]![0] as string;
    expect(sql).toContain("INSERT INTO ai_feedback");
    const params = mockExecute.mock.calls[0]![1] as unknown[];
    expect(params[3]).toBe("summary");
    expect(params[4]).toBe(-1);
  });

  it("returns the latest feedback value", async () => {
    mockSelect.mockResolvedValueOnce([
      { id: "1", account_id: "acc-1", thread_id: "t1", kind: "summary", value: 1, created_at: 1 },
      { id: "2", account_id: "acc-1", thread_id: "t1", kind: "summary", value: -1, created_at: 2 },
    ]);
    expect(await getLatestAiFeedback("acc-1", "t1", "summary")).toBe(-1);
  });

  it("returns null when no feedback exists", async () => {
    mockSelect.mockResolvedValueOnce([]);
    expect(await getLatestAiFeedback("acc-1", "t1", "summary")).toBeNull();
  });
});