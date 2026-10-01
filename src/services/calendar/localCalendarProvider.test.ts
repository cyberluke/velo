import { describe, it, expect, vi, beforeEach } from "vitest";
import { LocalCalendarProvider } from "./localCalendarProvider";
import type { DbCalendarEvent } from "@/services/db/calendarEvents";

vi.mock("@/services/db/calendarEvents", () => ({
  getCalendarEventsInRange: vi.fn(),
  updateEventByRemoteId: vi.fn(),
  deleteEventByAccountAndRemoteId: vi.fn(),
  upsertCalendarEvent: vi.fn(),
}));

import {
  getCalendarEventsInRange,
  updateEventByRemoteId,
  deleteEventByAccountAndRemoteId,
  upsertCalendarEvent,
} from "@/services/db/calendarEvents";

const mockGetRange = vi.mocked(getCalendarEventsInRange);
const mockUpdate = vi.mocked(updateEventByRemoteId);
const mockDelete = vi.mocked(deleteEventByAccountAndRemoteId);
const mockUpsert = vi.mocked(upsertCalendarEvent);

function dbEvent(overrides: Partial<DbCalendarEvent> = {}): DbCalendarEvent {
  return {
    id: "evt-1",
    account_id: "acc-1",
    google_event_id: "local-abc",
    summary: "Standup",
    description: null,
    location: null,
    start_time: 1700000000,
    end_time: 1700003600,
    is_all_day: 0,
    status: "confirmed",
    organizer_email: null,
    attendees_json: null,
    html_link: null,
    updated_at: 1700000000,
    calendar_id: null,
    remote_event_id: "local-abc",
    etag: null,
    ical_data: null,
    uid: null,
    meeting_link: null,
    recurring_event_id: null,
    recurrence_rule: null,
    reminders_json: null,
    reminders_notified_at: null,
    linked_thread_id: null,
    linked_thread_account_id: null,
    meeting_record_id: null,
    meeting_record_url: null,
    ...overrides,
  };
}

describe("LocalCalendarProvider", () => {
  const provider = new LocalCalendarProvider("acc-1");

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports type local and keeps the account id", () => {
    expect(provider.type).toBe("local");
    expect(provider.accountId).toBe("acc-1");
  });

  it("lists a single primary calendar", async () => {
    const calendars = await provider.listCalendars();
    expect(calendars).toHaveLength(1);
    expect(calendars[0]).toMatchObject({
      remoteId: "local",
      displayName: "My Calendar",
      isPrimary: true,
    });
  });

  it("fetches events from the local table within the range", async () => {
    mockGetRange.mockResolvedValue([dbEvent()]);
    const events = await provider.fetchEvents("local", "2023-11-14T00:00:00Z", "2023-11-15T00:00:00Z");
    expect(mockGetRange).toHaveBeenCalledWith("acc-1", expect.any(Number), expect.any(Number));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      remoteEventId: "local-abc",
      summary: "Standup",
      startTime: 1700000000,
      isAllDay: false,
    });
  });

  it("creates an event with a local- prefixed id and persists it", async () => {
    const created = await provider.createEvent("local", {
      summary: "Planning",
      startTime: "2023-11-14T09:00:00Z",
      endTime: "2023-11-14T10:00:00Z",
      description: "Sprint planning",
    });
    expect(created.remoteEventId).toMatch(/^local-/);
    expect(created.status).toBe("confirmed");
    expect(created.isAllDay).toBe(false);
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    const arg = mockUpsert.mock.calls[0]![0];
    expect(arg.accountId).toBe("acc-1");
    expect(arg.googleEventId).toBe(created.remoteEventId);
    expect(arg.summary).toBe("Planning");
  });

  it("updates an existing event through the write-through helper", async () => {
    mockUpdate.mockResolvedValue(dbEvent({ summary: "Standup (moved)" }));
    const updated = await provider.updateEvent("local", "local-abc", {
      summary: "Standup (moved)",
    });
    expect(mockUpdate).toHaveBeenCalledWith("acc-1", "local-abc", expect.objectContaining({
      summary: "Standup (moved)",
    }));
    expect(updated.summary).toBe("Standup (moved)");
  });

  it("throws when updating an event that does not exist", async () => {
    mockUpdate.mockResolvedValue(null);
    await expect(
      provider.updateEvent("local", "local-missing", { summary: "X" }),
    ).rejects.toThrow("Local event local-missing not found");
  });

  it("deletes an event from the local table", async () => {
    await provider.deleteEvent("local", "local-abc");
    expect(mockDelete).toHaveBeenCalledWith("acc-1", "local-abc");
  });

  it("syncs nothing — the local table is the source of truth", async () => {
    const result = await provider.syncEvents("local", "some-token");
    expect(result).toEqual({
      created: [],
      updated: [],
      deletedRemoteIds: [],
      newSyncToken: null,
      newCtag: null,
    });
  });

  it("always passes a connection test", async () => {
    const result = await provider.testConnection();
    expect(result.success).toBe(true);
  });
});