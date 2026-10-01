import { getCalendarEventsInRange } from "@/services/db/calendarEvents";
import { proposeMeetingSlots } from "@/services/ai/aiService";
import { createCalendarEvent } from "./createEvent";
import { getCalendarsForAccount } from "@/services/db/calendars";
import { t, getLocale } from "@/i18n";
import { escapeHtml } from "@/utils/sanitize";

export interface SchedulingResult {
  proposedSlots: string[];
  createdEvent: boolean;
  draftEmail?: {
    to: string[];
    subject: string;
    bodyHtml: string;
  };
  error?: string;
}

const DAYS_AHEAD = 14;

export function isoLocal(date: Date): string {
  // Local-time ISO (no Z) so slot comparisons stay in the user's timezone.
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function parseLocalIso(iso: string): Date {
  const [datePart = "", timePart = "00:00"] = iso.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const [hh, mm] = timePart.split(":").map(Number);
  return new Date(y!, m! - 1, d!, hh!, mm ?? 0);
}

/**
 * Generate candidate free 30-minute slots across the next two weeks, skipping
 * overnight hours. The AI then picks the 3 best non-conflicting ones.
 */
export function generateFreeSlots(
  start: Date,
  busy: { start: number; end: number }[],
): string[] {
  const slots: string[] = [];
  const busySet = busy
    .filter((e) => e.end > e.start)
    .map((e) => ({ start: e.start * 1000, end: e.end * 1000 }));
  const cursor = new Date(start);
  cursor.setHours(9, 0, 0, 0); // start at 09:00
  const endLimit = new Date(start.getTime() + DAYS_AHEAD * 24 * 3600 * 1000);
  while (cursor < endLimit) {
    const hour = cursor.getHours();
    if (hour >= 9 && hour < 17 && hour !== 12) {
      const slotStart = cursor.getTime();
      const slotEnd = slotStart + 30 * 60 * 1000;
      const collides = busySet.some(
        (b) => slotStart < b.end && slotEnd > b.start,
      );
      if (!collides) {
        slots.push(isoLocal(cursor));
      }
    }
    cursor.setMinutes(cursor.getMinutes() + 30);
  }
  return slots;
}

function formatDraftBody(slots: string[], title: string, durationMinutes: number): string {
  const locale = getLocale();
  const lines = slots
    .map((s, i) => {
      const d = parseLocalIso(s);
      const day = d.toLocaleDateString(locale, { weekday: "long", month: "long", day: "numeric" });
      const time = d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
      const end = new Date(d.getTime() + durationMinutes * 60 * 1000)
        .toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
      return `${i + 1}. ${day}, ${time}–${end}`;
    })
    .join("<br>");
  return `<p>${t("schedule.emailGreeting")}</p><p>${t("schedule.emailIntro").replace("{title}", escapeHtml(title))}</p><p>${lines}</p><p>${t("schedule.emailClosing")}</p><p>${t("schedule.emailSignoff")}</p>`;
}

/**
 * End-to-end scheduling assistant: detect intent → propose 3 slots from the
 * calendar → create the event → hand back a draft email offering the times.
 */
export async function scheduleMeeting(
  accountId: string,
  context: {
    title: string;
    durationMinutes?: number;
    attendees?: string[];
    startAfter?: string; // ISO, optional constraint (e.g. "tomorrow")
  },
  createEvent = false,
): Promise<SchedulingResult> {
  const durationMinutes = context.durationMinutes ?? 60;
  const start = context.startAfter
    ? new Date(context.startAfter)
    : new Date(Date.now() + 24 * 3600 * 1000); // default: from tomorrow
  if (Number.isNaN(start.getTime())) {
    return { proposedSlots: [], createdEvent: false, error: t("schedule.errorInvalidStart") };
  }

  const rangeStart = Math.floor(start.getTime() / 1000) - 3600;
  const rangeEnd = Math.floor(
    (start.getTime() + DAYS_AHEAD * 24 * 3600 * 1000) / 1000,
  );
  const events = await getCalendarEventsInRange(accountId, rangeStart, rangeEnd);
  const busy = events
    .filter((e) => e.status !== "cancelled" && e.status !== "declined")
    .map((e) => ({ start: e.start_time, end: e.end_time }));

  const freeSlots = generateFreeSlots(start, busy);
  if (freeSlots.length === 0) {
    return { proposedSlots: [], createdEvent: false, error: t("schedule.errorNoSlots") };
  }

  const meetingContext = `${context.title} (${durationMinutes} min)${context.attendees?.length ? ` with ${context.attendees.join(", ")}` : ""}`;
  const proposal = await proposeMeetingSlots(freeSlots, busy, meetingContext);
  if (proposal.slots.length === 0) {
    // AI failed — fall back to the first three free slots.
    proposal.slots = freeSlots.slice(0, 3);
  }

  if (createEvent && proposal.slots[0]) {
    try {
      const calendars = await getCalendarsForAccount(accountId);
      const chosen = parseLocalIso(proposal.slots[0]);
      await createCalendarEvent(accountId, calendars, {
        summary: context.title,
        description: t("schedule.eventDescription").replace("{slots}", proposal.slots.join(", ")),
        location: "",
        startTime: chosen.toISOString(),
        endTime: new Date(chosen.getTime() + durationMinutes * 60 * 1000).toISOString(),
      });
    } catch (err) {
      return {
        proposedSlots: proposal.slots,
        createdEvent: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  return {
    proposedSlots: proposal.slots,
    createdEvent: createEvent,
    draftEmail: {
      to: context.attendees ?? [],
      subject: t("schedule.emailSubject").replace("{title}", context.title),
      bodyHtml: formatDraftBody(proposal.slots, context.title, durationMinutes),
    },
  };
}