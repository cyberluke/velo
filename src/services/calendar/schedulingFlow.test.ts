import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateFreeSlots, parseLocalIso, scheduleMeeting } from "./schedulingFlow";
import { proposeMeetingSlots } from "@/services/ai/aiService";

vi.mock("@/services/db/calendarEvents", () => ({
  getCalendarEventsInRange: vi.fn(),
}));
vi.mock("@/services/ai/aiService", () => ({
  proposeMeetingSlots: vi.fn(),
}));
vi.mock("@/services/calendar/createEvent", () => ({
  createCalendarEvent: vi.fn(),
}));
vi.mock("@/services/db/calendars", () => ({
  getCalendarsForAccount: vi.fn(),
}));

import { getCalendarEventsInRange } from "@/services/db/calendarEvents";
import { getCalendarsForAccount } from "@/services/db/calendars";
import { createCalendarEvent } from "./createEvent";

const mockGetEvents = getCalendarEventsInRange as unknown as ReturnType<typeof vi.fn>;
const mockPropose = proposeMeetingSlots as unknown as ReturnType<typeof vi.fn>;
const mockCalendars = getCalendarsForAccount as unknown as ReturnType<typeof vi.fn>;
const mockCreate = createCalendarEvent as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetAllMocks();
  mockGetEvents.mockResolvedValue([]);
  mockCalendars.mockResolvedValue([{ id: "cal-1", is_primary: 1 }]);
});

describe("generateFreeSlots", () => {
  it("generates 30-minute slots in working hours, skipping lunch and busy times", () => {
    const start = new Date("2026-10-05T00:00:00");
    const busy = [
      { start: Math.floor(new Date("2026-10-05T10:00:00").getTime() / 1000), end: Math.floor(new Date("2026-10-05T11:00:00").getTime() / 1000) },
    ];
    const slots = generateFreeSlots(start, busy);
    // 09:00–17:00 minus 12:00 hour = 7 hours/day × 2 slots/hour = 14 per day
    expect(slots.length).toBeGreaterThan(0);
    // 10:00 must not appear (busy), 12:00 must not appear (lunch)
    expect(slots.some((s) => s.startsWith("2026-10-05T10:00"))).toBe(false);
    expect(slots.some((s) => s.startsWith("2026-10-05T12:"))).toBe(false);
    // First day's 09:00 free slot must exist
    expect(slots.some((s) => s.startsWith("2026-10-05T09:00"))).toBe(true);
  });
});

describe("parseLocalIso", () => {
  it("parses local ISO timestamps", () => {
    const d = parseLocalIso("2026-10-05T14:30");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(9); // October
    expect(d.getDate()).toBe(5);
    expect(d.getHours()).toBe(14);
    expect(d.getMinutes()).toBe(30);
  });
});

describe("scheduleMeeting", () => {
  it("returns three proposed slots and a draft invite without creating an event by default", async () => {
    mockPropose.mockResolvedValue({ slots: ["2026-10-06T10:00", "2026-10-06T14:00", "2026-10-07T09:00"] });
    const result = await scheduleMeeting(
      "acc-1",
      { title: "Sync", durationMinutes: 60, attendees: ["bob@example.com"] },
      false,
    );
    expect(result.proposedSlots).toHaveLength(3);
    expect(result.createdEvent).toBe(false);
    expect(result.draftEmail?.to).toEqual(["bob@example.com"]);
    expect(result.draftEmail?.bodyHtml).toContain("Sync");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("creates the event when asked and hands back the invite", async () => {
    mockPropose.mockResolvedValue({ slots: ["2026-10-06T10:00", "2026-10-06T14:00", "2026-10-07T09:00"] });
    const result = await scheduleMeeting(
      "acc-1",
      { title: "Review", durationMinutes: 30, attendees: [] },
      true,
    );
    expect(result.createdEvent).toBe(true);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate.mock.calls[0]![1]).toEqual([{ id: "cal-1", is_primary: 1 }]);
  });

  it("falls back to the first free slots when the AI returns none", async () => {
    mockPropose.mockResolvedValue({ slots: [] });
    const result = await scheduleMeeting("acc-1", { title: "Quick call" }, false);
    expect(result.proposedSlots.length).toBeGreaterThanOrEqual(1);
  });

  it("reports an error when no free slots exist", async () => {
    mockPropose.mockResolvedValue({ slots: [] });
    // Block every working hour for the full two-week horizon.
    const busy: { start: number; end: number }[] = [];
    for (let day = 0; day < 14; day++) {
      for (let hour = 9; hour < 17; hour++) {
        const start = new Date("2026-10-05T00:00:00");
        start.setDate(start.getDate() + day);
        start.setHours(hour, 0, 0, 0);
        busy.push({
          start: Math.floor(start.getTime() / 1000),
          end: Math.floor((start.getTime() + 3600 * 1000) / 1000),
        });
      }
    }
    mockGetEvents.mockResolvedValueOnce(
      busy.map((b) => ({ start_time: b.start, end_time: b.end, status: "confirmed" })),
    );
    const result = await scheduleMeeting(
      "acc-1",
      { title: "Full day", startAfter: "2026-10-05T00:00:00" },
    );
    expect(result.error).toBeDefined();
  });
});