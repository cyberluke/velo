import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/services/db/calendarEvents", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/db/calendarEvents")>();
  return { ...actual, getDueCalendarReminders: vi.fn(), markRemindersNotified: vi.fn() };
});

vi.mock("@/services/notifications/notificationManager", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/notifications/notificationManager")>();
  return { ...actual, notifyCalendarReminder: vi.fn() };
});

vi.mock("@/stores/toastStore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/stores/toastStore")>();
  return { ...actual, notify: vi.fn() };
});

import { getDueCalendarReminders, markRemindersNotified } from "@/services/db/calendarEvents";
import { notifyCalendarReminder } from "@/services/notifications/notificationManager";
import { notify } from "@/stores/toastStore";
import { checkCalendarReminders } from "./reminderChecker";
import type { DbCalendarEvent } from "@/services/db/calendarEvents";

const makeEvent = (overrides: Partial<DbCalendarEvent>): DbCalendarEvent =>
  ({
    id: "evt-1",
    account_id: "acc-1",
    google_event_id: "g-1",
    summary: "Design review",
    description: null,
    location: null,
    start_time: 1000,
    end_time: 1100,
    is_all_day: 0,
    status: "confirmed",
    organizer_email: null,
    attendees_json: null,
    html_link: null,
    updated_at: 1,
    calendar_id: null,
    remote_event_id: null,
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
  });

describe("checkCalendarReminders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("notifies once per due event and marks it notified", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-15T10:00:00Z"));
    const now = Math.floor(Date.now() / 1000);
    const due = [
      makeEvent({
        id: "evt-1",
        summary: "Design review",
        start_time: now + 10 * 60,
        reminders_json: JSON.stringify([{ method: "popup", minutes: 15 }]),
      }),
      makeEvent({
        id: "evt-2",
        summary: "All hands",
        start_time: now + 60 * 60,
        reminders_json: JSON.stringify([{ method: "popup", minutes: 60 }]),
      }),
    ];
    vi.mocked(getDueCalendarReminders).mockResolvedValue(due);

    const fired = await checkCalendarReminders();

    expect(fired).toBe(2);
    expect(notifyCalendarReminder).toHaveBeenCalledTimes(2);
    expect(notifyCalendarReminder).toHaveBeenNthCalledWith(1, "Design review", 10, "evt-1", "acc-1");
    expect(notifyCalendarReminder).toHaveBeenNthCalledWith(2, "All hands", 60, "evt-2", "acc-1");
    expect(notify).toHaveBeenCalledTimes(2);
    expect(markRemindersNotified).toHaveBeenCalledWith("evt-1");
    expect(markRemindersNotified).toHaveBeenCalledWith("evt-2");
    vi.useRealTimers();
  });

  it("does nothing when no reminders are due", async () => {
    vi.mocked(getDueCalendarReminders).mockResolvedValue([]);
    const fired = await checkCalendarReminders();
    expect(fired).toBe(0);
    expect(notifyCalendarReminder).not.toHaveBeenCalled();
    expect(markRemindersNotified).not.toHaveBeenCalled();
  });
});