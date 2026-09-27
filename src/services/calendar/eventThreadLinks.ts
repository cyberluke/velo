import { getDb } from "@/services/db/connection";
import {
  linkEventToThread,
  matchesEventByParticipantsAndSubject,
  getEventsRelatedToThread,
  type DbCalendarEvent,
} from "@/services/db/calendarEvents";
import { getThreadById } from "@/services/db/threads";
import { getMessagesForThread } from "@/services/db/messages";
import { extractEmailAddresses } from "@/utils/emailUtils";

/**
 * Cross-link calendar events and mail threads.
 *
 * A meeting usually starts as an email: the invitation, the agenda, the
 * follow-up. The link is stored on the event (`linked_thread_id`) so the
 * event detail can open the thread, the thread view can list the meeting,
 * and the V271 graph can carry a RELATED_TO edge with a real reference
 * instead of a guess.
 *
 * Auto-linking is deliberately conservative: it requires BOTH a shared
 * participant and a shared distinctive subject token. A shared participant
 * alone would link every meeting with that person; a shared subject alone
 * would link unrelated events whose titles reuse a generic word.
 */

/** The thread's people: every address that sent to or was addressed in it. */
export async function getThreadParticipants(
  accountId: string,
  threadId: string,
): Promise<string[]> {
  const messages = await getMessagesForThread(accountId, threadId);
  const people = new Set<string>();
  for (const message of messages) {
    if (message.from_address) people.add(message.from_address);
    for (const address of extractEmailAddresses(message.to_addresses)) people.add(address);
    for (const address of extractEmailAddresses(message.cc_addresses)) people.add(address);
  }
  return [...people];
}

/**
 * Link unlinked events to their email threads, per account (or all accounts
 * with calendars when no account is given).
 *
 * Idempotent: an explicit manual link is never overwritten, and an event
 * that already has a link is skipped.
 */
export async function autoLinkEventsToThreads(accountId?: string): Promise<number> {
  const db = await getDb();

  let accounts: { id: string }[];
  if (accountId) {
    accounts = [{ id: accountId }];
  } else {
    accounts = await db.select<{ id: string }[]>(
      `SELECT DISTINCT a.id FROM accounts a
       INNER JOIN calendars c ON c.account_id = a.id
       WHERE a.is_active = 1`,
    );
  }

  let linked = 0;
  for (const account of accounts) {
    linked += await linkEventsForAccount(account.id);
  }
  return linked;
}

interface ThreadCandidate {
  subject: string;
  participants: string[];
  lastMessageAt: number;
}

async function linkEventsForAccount(accountId: string): Promise<number> {
  const db = await getDb();
  const now = Math.floor(Date.now() / 1000);

  // Events without a link, in a window wide enough to catch the invitation
  // and the follow-up on either side of the meeting.
  const events = await db.select<DbCalendarEvent[]>(
    `SELECT * FROM calendar_events
     WHERE account_id = $1
       AND linked_thread_id IS NULL
       AND status != 'cancelled'
       AND start_time BETWEEN $2 AND $3
     ORDER BY start_time ASC
     LIMIT 500`,
    [accountId, now - 90 * 86400, now + 365 * 86400],
  );
  if (events.length === 0) return 0;

  // Candidate threads around the same time, with their participants and
  // subject loaded once per account.
  const threads = await db.select<{ id: string; subject: string | null; last_message_at: number | null }[]>(
    `SELECT id, subject, last_message_at FROM threads
     WHERE account_id = $1
       AND last_message_at BETWEEN $2 AND $3
       AND merged_into IS NULL
     ORDER BY last_message_at DESC
     LIMIT 2000`,
    [accountId, now - 120 * 86400, now + 370 * 86400],
  );

  const candidates = new Map<string, ThreadCandidate>();
  for (const thread of threads) {
    candidates.set(thread.id, {
      subject: thread.subject ?? "",
      participants: await getThreadParticipants(accountId, thread.id),
      lastMessageAt: thread.last_message_at ?? 0,
    });
  }

  let linked = 0;
  for (const event of events) {
    // Among the matching threads, prefer the one whose last message is
    // nearest the event's start — the invitation usually lands right before.
    let best: { threadId: string; candidate: ThreadCandidate } | null = null;
    let bestDistance = Infinity;
    for (const [threadId, candidate] of candidates) {
      if (!matchesEventByParticipantsAndSubject(event, candidate.subject, candidate.participants)) {
        continue;
      }
      const distance = Math.abs(event.start_time - candidate.lastMessageAt);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { threadId, candidate };
      }
    }
    if (best) {
      await linkEventToThread(event.id, best.threadId, accountId);
      linked++;
    }
  }
  return linked;
}

/**
 * The events that belong to a thread: explicitly linked ones, plus matches
 * found by participant/subject similarity in a window around the thread's
 * own lifetime.
 */
export async function findEventsForThread(
  accountId: string,
  threadId: string,
): Promise<DbCalendarEvent[]> {
  const thread = await getThreadById(accountId, threadId);
  if (!thread) return [];
  const participants = await getThreadParticipants(accountId, threadId);
  const now = Math.floor(Date.now() / 1000);
  return getEventsRelatedToThread(
    accountId,
    threadId,
    thread.subject ?? "",
    participants,
    now - 90 * 86400,
    now + 365 * 86400,
  );
}

/** The event's linked thread id and account, if it has one. */
export async function getLinkedThreadForEvent(
  event: DbCalendarEvent,
): Promise<{ threadId: string; accountId: string } | null> {
  if (!event.linked_thread_id || !event.linked_thread_account_id) return null;
  const thread = await getThreadById(event.linked_thread_account_id, event.linked_thread_id);
  if (!thread) return null;
  return { threadId: event.linked_thread_id, accountId: event.linked_thread_account_id };
}