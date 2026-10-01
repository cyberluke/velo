import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/services/db/connection", () => ({
  getDb: vi.fn(),
}));

vi.mock("@/services/db/messages", () => ({
  getMessagesForThread: vi.fn(),
}));

vi.mock("./eventThreadLinks", () => ({
  autoLinkEventsToThreads: vi.fn(() => Promise.resolve(0)),
  getThreadParticipants: vi.fn(() => Promise.resolve([])),
}));

import { getDb } from "@/services/db/connection";
import { getMessagesForThread } from "@/services/db/messages";
import { getThreadParticipants, autoLinkEventsToThreads } from "./eventThreadLinks";
import {
  detectConfirmationSource,
  updateConfirmationSources,
  pairMeetingsWithEmails,
  tryPairEvent,
  sourceForDomain,
} from "./meetingPairing";
import { createMockDb } from "@/test/mocks";

const mockDb = createMockDb();

const event = {
  id: "evt-1",
  account_id: "acc-1",
  google_event_id: "gev-1",
  summary: "Product standup",
  description: null,
  location: null,
  start_time: 1_800_000_000,
  end_time: 1_800_003_600,
  is_all_day: 0,
  status: "confirmed",
  organizer_email: "org@example.com",
  attendees_json: '[{"email":"me@example.com"}]',
  html_link: null,
  updated_at: 1_700_000_000,
  calendar_id: "cal-1",
  remote_event_id: "remote-1",
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
  confirmation_source: null,
};

const msg = (overrides: Partial<Parameters<typeof detectConfirmationSource>[0][number]> = {}) => ({
  from_address: null,
  subject: null,
  snippet: null,
  body_text: null,
  ...overrides,
});

describe("meetingPairing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDb).mockResolvedValue(mockDb as never);
    vi.mocked(getMessagesForThread).mockResolvedValue([]);
    vi.mocked(getThreadParticipants).mockResolvedValue([]);
  });

  describe("sourceForDomain", () => {
    it("maps the known providers", () => {
      expect(sourceForDomain("calendly.com")).toBe("calendly");
      expect(sourceForDomain("zoom.us")).toBe("zoom");
      expect(sourceForDomain("teams.microsoft.com")).toBe("teams");
      expect(sourceForDomain("google.com")).toBe("google_calendar");
      expect(sourceForDomain("doodle.com")).toBe("scheduler");
      expect(sourceForDomain("webex.com")).toBe("scheduler");
      expect(sourceForDomain("example.com")).toBeNull();
    });
  });

  describe("detectConfirmationSource", () => {
    it("finds Calendly by sender", () => {
      expect(detectConfirmationSource([msg({ from_address: "invites@calendly.com" })])).toBe("calendly");
    });

    it("finds Google Calendar by the calendar-notification sender", () => {
      expect(detectConfirmationSource([msg({ from_address: "calendar-notification@google.com" })])).toBe("google_calendar");
    });

    it("finds Google Calendar invitations sent by the organizer via the calendar.google.com link", () => {
      expect(
        detectConfirmationSource([
          msg({
            from_address: "organizer@example.com",
            subject: "Invitation: Product standup",
            body_text: "View the event: https://calendar.google.com/calendar/event?action=TEMPLATE",
          }),
        ]),
      ).toBe("google_calendar");
    });

    it("finds Zoom and Teams", () => {
      expect(detectConfirmationSource([msg({ from_address: "no-reply@zoom.us" })])).toBe("zoom");
      expect(detectConfirmationSource([msg({ from_address: "noreply@teams.microsoft.com" })])).toBe("teams");
    });

    it("treats other booking platforms as schedulers", () => {
      expect(detectConfirmationSource([msg({ from_address: "info@doodle.com" })])).toBe("scheduler");
    });

    it("falls back to a plain email confirmation by subject", () => {
      expect(
        detectConfirmationSource([msg({ subject: "You're scheduled with Anna", from_address: "anna@example.com" })]),
      ).toBe("email");
    });

    it("returns null when nothing looks like a confirmation", () => {
      expect(detectConfirmationSource([msg({ subject: "Lunch menu", from_address: "cafe@example.com" })])).toBeNull();
    });
  });

  describe("updateConfirmationSources", () => {
    it("writes the detected source for every linked event", async () => {
      vi.mocked(mockDb.select).mockResolvedValueOnce([
        { ...event, id: "evt-1", linked_thread_id: "th-1", linked_thread_account_id: "acc-1" },
      ] as never);
      vi.mocked(getMessagesForThread).mockResolvedValueOnce([
        { from_address: "invites@calendly.com", subject: "You're scheduled", snippet: null, body_text: null },
      ] as never);

      const updated = await updateConfirmationSources();

      expect(updated).toBe(1);
      const executeCalls = vi.mocked(mockDb.execute).mock.calls;
      expect(executeCalls.some((call) => call[0].includes("confirmation_source") && call[1]?.[0] === "calendly")).toBe(true);
    });
  });

  describe("pairMeetingsWithEmails", () => {
    it("auto-links then refreshes confirmation sources", async () => {
      vi.mocked(mockDb.select).mockResolvedValueOnce([] as never);
      const result = await pairMeetingsWithEmails("acc-1");
      expect(autoLinkEventsToThreads).toHaveBeenCalledWith("acc-1");
      expect(result).toEqual({ linked: 0, sourcesUpdated: 0 });
    });
  });

  describe("tryPairEvent", () => {
    it("pairs via the provider-domain fallback within a week of the event", async () => {
      vi.mocked(mockDb.select).mockResolvedValueOnce([
        { id: "th-1", subject: "Re: quick chat", last_message_at: event.start_time - 86400 },
      ] as never);
      vi.mocked(getThreadParticipants).mockResolvedValueOnce(["nobody@example.com"]);
      vi.mocked(getMessagesForThread).mockResolvedValue([
        { from_address: "invites@calendly.com", subject: "You're scheduled", snippet: null, body_text: null },
      ] as never);

      const result = await tryPairEvent(event);

      expect(result).toEqual({ threadId: "th-1", threadAccountId: "acc-1", source: "calendly" });
      const executeCalls = vi.mocked(mockDb.execute).mock.calls;
      expect(executeCalls.some((call) => call[0].includes("linked_thread_id") && call[1]?.[0] === "th-1")).toBe(true);
    });

    it("pairs via shared participant + distinctive subject token", async () => {
      vi.mocked(mockDb.select).mockResolvedValueOnce([
        { id: "th-2", subject: "Product standup agenda", last_message_at: event.start_time - 3600 },
      ] as never);
      vi.mocked(getThreadParticipants).mockResolvedValueOnce(["org@example.com", "me@example.com"]);
      vi.mocked(getMessagesForThread).mockResolvedValueOnce([
        { from_address: "org@example.com", subject: "Product standup agenda", snippet: null, body_text: null },
      ] as never);

      const result = await tryPairEvent(event);

      expect(result?.threadId).toBe("th-2");
    });

    it("returns null when no convincing thread exists", async () => {
      vi.mocked(mockDb.select).mockResolvedValueOnce([
        { id: "th-3", subject: "Holiday photos", last_message_at: event.start_time - 86400 },
      ] as never);
      vi.mocked(getThreadParticipants).mockResolvedValueOnce(["stranger@example.com"]);
      vi.mocked(getMessagesForThread).mockResolvedValueOnce([
        { from_address: "stranger@example.com", subject: "Holiday photos", snippet: null, body_text: null },
      ] as never);

      const result = await tryPairEvent(event);

      expect(result).toBeNull();
    });
  });
});