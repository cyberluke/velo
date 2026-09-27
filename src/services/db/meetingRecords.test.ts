import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/services/db/connection", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/db/connection")>();
  return { ...actual, getDb: vi.fn(), selectFirstBy: vi.fn() };
});

import { getDb, selectFirstBy } from "@/services/db/connection";
import {
  upsertMeetingRecord,
  getMeetingRecordForEvent,
  deleteMeetingRecord,
  meetingRecordDecisions,
  meetingRecordActionItems,
} from "./meetingRecords";
import { createMockDb } from "@/test/mocks/db.mock";

const mockDb = createMockDb();

describe("meetingRecords service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDb).mockResolvedValue(mockDb as unknown as Awaited<ReturnType<typeof getDb>>);
    vi.mocked(selectFirstBy).mockResolvedValue(null);
  });

  it("upserts a record and links it to the event", async () => {
    const id = await upsertMeetingRecord({
      eventId: "evt-1",
      recordUrl: "https://scribe.example.com/records/42",
      title: "Design review",
      summary: "We agreed on the new API shape.",
      decisions: ["Use REST for v2"],
      actionItems: ["Alice: write the spec by Friday"],
    });

    expect(id).toBeTruthy();
    // Insert into meeting_records
    const insert = mockDb.execute.mock.calls[0] as [string, unknown[]];
    expect(insert[0]).toContain("INSERT INTO meeting_records");
    // Link update on calendar_events
    const link = mockDb.execute.mock.calls[1] as [string, unknown[]];
    expect(link[0]).toContain("UPDATE calendar_events SET meeting_record_id");
    expect(link[1]).toEqual([id, "https://scribe.example.com/records/42", "evt-1"]);
  });

  it("reuses the existing record id for the same event (idempotent)", async () => {
    vi.mocked(selectFirstBy).mockResolvedValue({
      id: "existing-id",
      event_id: "evt-1",
      source: "toastovac",
      record_url: "https://scribe.example.com/records/1",
      title: "Old",
      transcript: null,
      summary: "Old summary",
      decisions_json: null,
      action_items_json: null,
      synced_at: 1,
    });

    const id = await upsertMeetingRecord({
      eventId: "evt-1",
      summary: "New summary",
    });

    expect(id).toBe("existing-id");
    const insert = mockDb.execute.mock.calls[0] as [string, unknown[]];
    expect(insert[1]).toContain("existing-id");
  });

  it("parses decisions and action items from JSON columns", () => {
    const record = {
      id: "r1",
      event_id: "e1",
      source: "toastovac",
      record_url: null,
      title: null,
      transcript: null,
      summary: null,
      decisions_json: JSON.stringify(["D1", "D2"]),
      action_items_json: JSON.stringify(["A1"]),
      synced_at: 1,
    };

    expect(meetingRecordDecisions(record)).toEqual(["D1", "D2"]);
    expect(meetingRecordActionItems(record)).toEqual(["A1"]);
  });

  it("returns empty arrays for malformed JSON", () => {
    const record = {
      id: "r2",
      event_id: "e1",
      source: "toastovac",
      record_url: null,
      title: null,
      transcript: null,
      summary: null,
      decisions_json: "not json",
      action_items_json: null,
      synced_at: 1,
    };
    expect(meetingRecordDecisions(record)).toEqual([]);
    expect(meetingRecordActionItems(record)).toEqual([]);
  });

  it("deletes a record and unlinks the event", async () => {
    vi.mocked(selectFirstBy).mockResolvedValueOnce({
      id: "r1",
      event_id: "evt-1",
      source: "toastovac",
      record_url: null,
      title: null,
      transcript: null,
      summary: null,
      decisions_json: null,
      action_items_json: null,
      synced_at: 1,
    });
    await deleteMeetingRecord("r1");
    const del = mockDb.execute.mock.calls[0] as [string, unknown[]];
    expect(del[0]).toContain("DELETE FROM meeting_records");
    const unlink = mockDb.execute.mock.calls[1] as [string, unknown[]];
    expect(unlink[0]).toContain("UPDATE calendar_events SET meeting_record_id = NULL");
  });

  it("returns null when no record exists for an event", async () => {
    const record = await getMeetingRecordForEvent("evt-9");
    expect(record).toBeNull();
  });
});