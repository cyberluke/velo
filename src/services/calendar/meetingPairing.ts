import { getDb } from "@/services/db/connection";
import {
  linkEventToThread,
  setEventConfirmationSource,
  type DbCalendarEvent,
} from "@/services/db/calendarEvents";
import { getMessagesForThread } from "@/services/db/messages";
import {
  autoLinkEventsToThreads,
  getThreadParticipants,
} from "./eventThreadLinks";

/**
 * Meeting confirmation pairing.
 *
 * A meeting starts as an email: Calendly sends "You're scheduled", Google
 * Calendar sends an invitation, Zoom sends "Invitation: ...". This module
 * answers two questions the Meetings tab needs:
 *
 *   1. WHERE a paired confirmation came from — the provider is recorded on
 *      the event (`confirmation_source`) so the UI can show it prominently;
 *   2. WHICH events are still unpaired — no confirmation email found, so the
 *      user can act on them instead of silently missing a meeting.
 *
 * Detection is sender-domain driven, with Google Calendar invitations caught
 * by their `calendar.google.com` links too. The pairing itself stays as
 * conservative as `eventThreadLinks` — a wrong link is worse than no link.
 */

export type ConfirmationSource =
  | "calendly"
  | "google_calendar"
  | "zoom"
  | "teams"
  | "scheduler"
  | "email";

/** Booking/scheduling platforms — every mail from them arranges meetings. */
const SCHEDULER_DOMAINS = new Set([
  "cal.com",
  "calendow.com",
  "savvycal.com",
  "doodle.com",
  "when2meet.com",
  "x.ai",
  "clara.io",
  "cron.com",
  "reclaim.ai",
  "motion.us",
]);

/** Meeting platforms that also send non-meeting mail — domain + content. */
const MEETING_PLATFORM_DOMAINS = new Set([
  "goto.com",
  "gotomeeting.com",
  "webex.com",
  "whereby.com",
  "bluejeans.com",
]);

const GOOGLE_CALENDAR_DOMAIN = "google.com";

/** Subject words that mark a mail as a meeting confirmation/invitation. */
const CONFIRMATION_SUBJECT_RE =
  /(invitation|invited you|invite you|you'?re scheduled|meeting scheduled|booking confirmed|event confirmed|confirmed:)/i;

/** The sender's domain, lowercased and minus any leading subdomain labels. */
function domainOf(fromAddress: string | null): string | null {
  if (!fromAddress) return null;
  const at = fromAddress.lastIndexOf("@");
  if (at < 0) return null;
  return fromAddress.slice(at + 1).trim().toLowerCase();
}

/** Provider id for a sender domain, or null when the domain says nothing. */
export function sourceForDomain(domain: string | null): ConfirmationSource | null {
  if (!domain) return null;
  if (domain === "calendly.com") return "calendly";
  if (domain === "zoom.us") return "zoom";
  if (domain === "teams.microsoft.com") return "teams";
  if (domain === GOOGLE_CALENDAR_DOMAIN) return "google_calendar";
  if (SCHEDULER_DOMAINS.has(domain)) return "scheduler";
  if (MEETING_PLATFORM_DOMAINS.has(domain)) return "scheduler";
  return null;
}

/** The messages the source detection runs over — the thread's own rows. */
export interface ConfirmationMessage {
  from_address: string | null;
  subject: string | null;
  snippet: string | null;
  body_text: string | null;
}

/**
 * Where a thread's confirmation email came from. The first message that
 * names a provider wins; a Google Calendar link in the body catches
 * invitations sent from the organizer's own address; a subject that reads
 * like a confirmation but names no provider resolves to a plain "email".
 */
export function detectConfirmationSource(
  messages: ConfirmationMessage[],
): ConfirmationSource | null {
  for (const message of messages) {
    const domain = domainOf(message.from_address);
    const fromDomain = sourceForDomain(domain);
    if (fromDomain) return fromDomain;

    // Google Calendar invitations are often sent by the organizer (not by
    // google.com) and carry a calendar.google.com link in the body.
    const haystack =
      `${message.subject ?? ""} ${message.snippet ?? ""} ${message.body_text ?? ""}`.toLowerCase();
    if (haystack.includes("calendar.google.com")) return "google_calendar";

    if (message.subject && CONFIRMATION_SUBJECT_RE.test(message.subject)) {
      return "email";
    }
  }
  return null;
}

/**
 * Refresh `confirmation_source` for every linked event — after auto-linking
 * ran, so each freshly paired event learns where its email came from.
 */
export async function updateConfirmationSources(accountId?: string): Promise<number> {
  const db = await getDb();

  const events = accountId
    ? await db.select<DbCalendarEvent[]>(
        `SELECT * FROM calendar_events
         WHERE account_id = $1 AND linked_thread_id IS NOT NULL AND linked_thread_account_id IS NOT NULL`,
        [accountId],
      )
    : await db.select<DbCalendarEvent[]>(
        `SELECT * FROM calendar_events
         WHERE linked_thread_id IS NOT NULL AND linked_thread_account_id IS NOT NULL`,
      );

  let updated = 0;
  for (const event of events) {
    const threadAccountId = event.linked_thread_account_id!;
    const threadId = event.linked_thread_id!;
    const messages = await getMessagesForThread(threadAccountId, threadId);
    const source = detectConfirmationSource(messages);
    if (source !== event.confirmation_source) {
      await setEventConfirmationSource(event.id, source);
      updated++;
    }
  }
  return updated;
}

/**
 * Pair meetings with their confirmation emails and record where each came
 * from. Best-effort, never throws — the Meetings tab calls this when it
 * opens and the calendar sync calls it after every sync.
 */
export async function pairMeetingsWithEmails(accountId?: string): Promise<{
  linked: number;
  sourcesUpdated: number;
}> {
  const linked = await autoLinkEventsToThreads(accountId);
  const sourcesUpdated = await updateConfirmationSources(accountId);
  return { linked, sourcesUpdated };
}

/**
 * The manual "find in email" action for one unpaired event. Looks for a
 * thread the event belongs to — first with the same conservative
 * participant + subject rule the auto-linker uses, then, when a meeting
 * platform's confirmation mail sits within a week of the event, on the
 * provider domain alone. Returns the paired result, or null when no
 * convincing thread exists.
 */
export async function tryPairEvent(
  event: DbCalendarEvent,
): Promise<{ threadId: string; threadAccountId: string; source: ConfirmationSource | null } | null> {
  const db = await getDb();

  const threads = await db.select<{ id: string; subject: string | null; last_message_at: number | null }[]>(
    `SELECT id, subject, last_message_at FROM threads
     WHERE account_id = $1
       AND last_message_at BETWEEN $2 AND $3
       AND merged_into IS NULL
     ORDER BY last_message_at DESC
     LIMIT 500`,
    [event.account_id, event.start_time - 90 * 86400, event.start_time + 45 * 86400],
  );

  const candidates = new Map<string, { subject: string; participants: string[]; lastMessageAt: number }>();
  for (const thread of threads) {
    candidates.set(thread.id, {
      subject: thread.subject ?? "",
      participants: await getThreadParticipants(event.account_id, thread.id),
      lastMessageAt: thread.last_message_at ?? 0,
    });
  }

  let best: { threadId: string; distance: number } | null = null;
  let bestProvider: { threadId: string; distance: number } | null = null;

  for (const [threadId, candidate] of candidates) {
    const distance = Math.abs(event.start_time - candidate.lastMessageAt);

    // Provider-domain fallback: a scheduling platform's mail within a week
    // of the event is the confirmation, whatever the subject says.
    if (distance <= 7 * 86400) {
      const messages = await getMessagesForThread(event.account_id, threadId);
      const source = detectConfirmationSource(messages);
      if (source && source !== "email") {
        if (!bestProvider || distance < bestProvider.distance) {
          bestProvider = { threadId, distance };
        }
        continue;
      }
    }

    if (!matchesEventByParticipantsAndSubject(event, candidate.subject, candidate.participants)) {
      continue;
    }
    if (!best || distance < best.distance) {
      best = { threadId, distance };
    }
  }

  const chosen = bestProvider ?? best;
  if (!chosen) return null;

  await linkEventToThread(event.id, chosen.threadId, event.account_id);
  const messages = await getMessagesForThread(event.account_id, chosen.threadId);
  const source = detectConfirmationSource(messages);
  await setEventConfirmationSource(event.id, source);
  return { threadId: chosen.threadId, threadAccountId: event.account_id, source };
}

/**
 * Same conservative participant + distinctive-subject match the auto-linker
 * uses — a shared participant alone matches every meeting with that person,
 * a shared subject alone matches unrelated events with the same title.
 */
function matchesEventByParticipantsAndSubject(
  event: DbCalendarEvent,
  threadSubject: string,
  threadParticipants: string[],
): boolean {
  const eventPeople: string[] = [];
  if (event.organizer_email) eventPeople.push(event.organizer_email);
  try {
    const attendees = JSON.parse(event.attendees_json ?? "[]") as { email?: string }[];
    for (const a of attendees) {
      if (a.email) eventPeople.push(a.email);
    }
  } catch {
    // ignore malformed attendees
  }

  const threadSet = new Set(threadParticipants.map((p) => p.toLowerCase()));
  const sharesParticipant = eventPeople.some((p) => threadSet.has(p.toLowerCase()));
  if (!sharesParticipant) return false;

  return sharesDistinctiveToken(event.summary ?? "", threadSubject);
}

function sharesDistinctiveToken(eventSummary: string, threadSubject: string): boolean {
  const tokens = new Set(
    (threadSubject ?? "")
      .toLowerCase()
      .split(/\W+/)
      .filter((t) => t.length >= 4 && !GENERIC_SUBJECT_TOKENS.has(t)),
  );
  if (tokens.size === 0) return false;
  const eventTokens = (eventSummary ?? "").toLowerCase().split(/\W+/);
  return eventTokens.some((t) => tokens.has(t));
}

/** Words too common in meeting/thread titles to prove a relationship. */
const GENERIC_SUBJECT_TOKENS = new Set([
  "meeting", "meet", "call", "sync", "update", "status", "re", "fw", "fwd",
  "hello", "hi", "today", "tomorrow", "week", "weekly", "monthly", "reminder",
  "invitation", "invite", "confirmed", "canceled", "cancelled", "new", "note",
  "notes", "agenda", "minutes", "follow", "up", "action", "items", "team",
  "review", "discussion", "check", "in", "quick", "touch", "base", "zoom",
  "google", "meet", "hangouts", "teams", "schedule", "scheduled", "event",
]);