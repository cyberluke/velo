import { askMeetings as callAskMeetings } from "./aiService";
import { getDb } from "@/services/db/connection";
import type { DbCalendarEvent } from "@/services/db/calendarEvents";
import {
  getMeetingRecordForEvent,
  type DbMeetingRecord,
} from "@/services/db/meetingRecords";
import { getThreadById } from "@/services/db/threads";
import type { ProvenanceRef } from "@/services/v271/types";
import { extractEmailAddresses } from "@/utils/emailUtils";

/**
 * Cross-source meeting intelligence: the "V271 AI" queries from the spec,
 * answered from Velo's own stores (which the graph references):
 *
 *   - "What meetings do I have today?"
 *   - "What did we decide in yesterday's meeting with X?"
 *   - "Which email thread led to this meeting?"
 *   - "Draft a follow-up from the meeting action items."
 *
 * The gatherer resolves calendar events + meeting records + linked threads
 * into one evidence block; the AI answers with provenance for every claim.
 */

export type MeetingIntent =
  | "today"
  | "upcoming"
  | "history"
  | "thread"
  | "followup"
  | "general";

const MEETING_WORDS = /\b(meeting|meetings|calendar|agenda|schedule|scheduled|event|appointment|invite|invitation|conference|call|sync|standup|stand-up|briefing|workshop)\b/i;
const TODAY_WORDS = /\b(today|tonight|this (morning|afternoon|evening)|now|upcoming|next (hour|2 hours|few hours)|later (today|this week))\b/i;
const UPCOMING_WORDS = /\b(tomorrow|this week|next week|upcoming|this (week|month)|next (week|month)|on (monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/i;
const HISTORY_WORDS = /\b(yesterday|last (week|month|meeting)|earlier|previous|past|prior|last (monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/i;
const THREAD_WORDS = /\b(which email thread|thread|email(s)? (that|which) led|how did this meeting|came from)\b/i;
const FOLLOWUP_WORDS = /\b(draft|write|compose|follow-up|follow up|action items?|next steps?)\b/i;

export function detectMeetingIntent(question: string): MeetingIntent | null {
  if (!MEETING_WORDS.test(question)) return null;
  if (THREAD_WORDS.test(question)) return "thread";
  if (FOLLOWUP_WORDS.test(question) && /(meeting|action|decision|follow)/i.test(question)) {
    return "followup";
  }
  if (TODAY_WORDS.test(question) && !HISTORY_WORDS.test(question)) return "today";
  if (UPCOMING_WORDS.test(question) && !HISTORY_WORDS.test(question)) return "upcoming";
  if (HISTORY_WORDS.test(question)) return "history";
  return "general";
}

export interface CrossSourceAnswer {
  answer: string;
  sources: ProvenanceRef[];
  intent: MeetingIntent;
  evidenceCount: number;
}

interface EvidenceEvent {
  event: DbCalendarEvent;
  record: DbMeetingRecord | null;
  thread: { id: string; subject: string } | null;
}

/** Resolve the person(s) named in the question to email addresses. */
async function resolvePeople(question: string): Promise<string[]> {
  const db = await getDb();
  // Whole words or fragments of a name/address; fall back to substring on
  // contact names for natural language like "with Alice".
  const nameMatch = question.match(/\bwith\s+([A-Za-z][\w.'-]*)/i);
  if (!nameMatch) return [];
  const name = nameMatch[1]!;
  const contacts = await db.select<{ email: string; display_name: string | null }[]>(
    `SELECT email, display_name FROM contacts
     WHERE display_name IS NOT NULL AND (LOWER(display_name) LIKE $1 OR LOWER(email) LIKE $1)
     LIMIT 10`,
    [`%${name.toLowerCase()}%`],
  );
  if (contacts.length > 0) return contacts.map((c) => c.email);
  // No contact match — treat the word as a possible email fragment.
  return [name];
}

function eventMatchesPeople(
  event: DbCalendarEvent,
  people: string[],
): boolean {
  if (people.length === 0) return true;
  const haystack = [
    event.organizer_email ?? "",
    event.summary ?? "",
    event.description ?? "",
    event.attendees_json ?? "",
  ].join("\n").toLowerCase();
  return people.some((p) => haystack.includes(p.toLowerCase()));
}

function rangeForIntent(intent: MeetingIntent, now: Date): { start: number; end: number } {
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000;
  const endOfDay = startOfDay + 86400;
  const startOfTomorrow = endOfDay;
  switch (intent) {
    case "today":
      return { start: startOfDay, end: endOfDay };
    case "upcoming":
      return { start: now.getTime() / 1000, end: startOfTomorrow + 7 * 86400 };
    case "history": {
      const startOfYesterday = startOfDay - 86400;
      return { start: startOfYesterday - 14 * 86400, end: endOfDay };
    }
    case "thread":
    case "followup":
      // Recent enough to still carry context.
      return { start: now.getTime() / 1000 - 30 * 86400, end: now.getTime() / 1000 + 365 * 86400 };
    default:
      return { start: startOfDay - 30 * 86400, end: startOfTomorrow + 365 * 86400 };
  }
}

/** Gather calendar + meeting + mail evidence and answer with provenance. */
export async function askCrossSource(
  question: string,
  _accountId: string,
): Promise<CrossSourceAnswer | null> {
  const intent = detectMeetingIntent(question);
  if (!intent) return null;

  const db = await getDb();
  const now = new Date();
  const { start, end } = rangeForIntent(intent, now);
  const people = await resolvePeople(question);

  const rows = await db.select<DbCalendarEvent[]>(
    `SELECT * FROM calendar_events
     WHERE start_time BETWEEN $1 AND $2
       AND status != 'cancelled'
     ORDER BY start_time ASC
     LIMIT 100`,
    [Math.floor(start), Math.floor(end)],
  );

  const evidence: EvidenceEvent[] = [];
  for (const event of rows) {
    if (!eventMatchesPeople(event, people)) continue;
    const record = await getMeetingRecordForEvent(event.id);
    let thread: { id: string; subject: string } | null = null;
    if (event.linked_thread_id && event.linked_thread_account_id) {
      const t = await getThreadById(event.linked_thread_account_id, event.linked_thread_id);
      if (t) thread = { id: t.id, subject: t.subject ?? "" };
    }
    evidence.push({ event, record, thread });
  }

  if (evidence.length === 0) {
    // Meeting intent but nothing found — answer honestly instead of falling
    // into the inbox search, which would answer a calendar question with mail.
    return {
      answer: "I couldn't find any matching meetings in your calendar.",
      sources: [],
      intent,
      evidenceCount: 0,
    };
  }

  const context = evidence
    .map(({ event, record, thread }) => {
      const attendees = safeJson(event.attendees_json) as { email?: string; displayName?: string }[];
      const peopleLine =
        attendees.length > 0
          ? attendees.map((a) => a.displayName ?? a.email).join(", ")
          : (event.organizer_email ?? "unknown");
      const parts = [
        `[event_id:${event.id}] ${event.summary ?? "(no title)"}`,
        `start: ${new Date(event.start_time * 1000).toISOString()}`,
        `end: ${new Date(event.end_time * 1000).toISOString()}`,
        `status: ${event.status}`,
        `location: ${event.location ?? "—"}`,
        `meeting_link: ${event.meeting_link ?? "—"}`,
        `organizer: ${event.organizer_email ?? "—"}`,
        `attendees: ${peopleLine}`,
      ];
      if (event.description) parts.push(`description: ${event.description.slice(0, 500)}`);
      if (thread) {
        parts.push(`linked_thread_id: [thread_id:${thread.id}] subject: ${thread.subject}`);
      }
      if (record) {
        parts.push(
          `meeting_record_id: [record_id:${record.id}] url: ${record.record_url ?? "—"}`,
        );
        if (record.summary) parts.push(`record_summary: ${record.summary.slice(0, 800)}`);
        const decisions = safeJson(record.decisions_json);
        if (Array.isArray(decisions) && decisions.length > 0) {
          parts.push(`decisions: ${decisions.join(" | ")}`);
        }
        const actionItems = safeJson(record.action_items_json);
        if (Array.isArray(actionItems) && actionItems.length > 0) {
          parts.push(`action_items: ${actionItems.join(" | ")}`);
        }
      }
      return parts.join("\n");
    })
    .join("\n---\n");

  const answer = await callAskMeetings(question, context);

  const sources: ProvenanceRef[] = [];
  for (const { event, record, thread } of evidence) {
    sources.push({
      kind: "calendar.event",
      sourceId: `${event.account_id}:event:${event.id}`,
      title: event.summary ?? "(no title)",
    });
    if (thread) {
      sources.push({
        kind: "mail.thread",
        sourceId: `${event.account_id}:${thread.id}`,
        title: thread.subject,
      });
    }
    if (record) {
      sources.push({
        kind: "meeting.record",
        sourceId: record.id,
        title: record.title ?? "Meeting record",
      });
    }
  }

  return { answer, sources, intent, evidenceCount: evidence.length };
}

function safeJson(json: string | null): unknown {
  if (!json) return [];
  try {
    return JSON.parse(json);
  } catch {
    return [];
  }
}

/** Convenience: does this question look like a meeting/calendar question at all? */
export function isMeetingQuestion(question: string): boolean {
  return detectMeetingIntent(question) !== null;
}

/** Who are the attendees/participants of an event, for follow-up drafting. */
export function eventParticipantEmails(event: DbCalendarEvent): string[] {
  const emails = extractEmailAddresses(event.attendees_json ?? "");
  if (event.organizer_email) emails.unshift(event.organizer_email);
  return [...new Set(emails)];
}