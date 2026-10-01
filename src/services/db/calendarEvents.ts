import { getDb, selectFirstBy } from "./connection";

export interface DbCalendarEvent {
  id: string;
  account_id: string;
  google_event_id: string;
  summary: string | null;
  description: string | null;
  location: string | null;
  start_time: number;
  end_time: number;
  is_all_day: number;
  status: string;
  organizer_email: string | null;
  attendees_json: string | null;
  html_link: string | null;
  updated_at: number;
  // New CalDAV fields (nullable for backward compat)
  calendar_id: string | null;
  remote_event_id: string | null;
  etag: string | null;
  ical_data: string | null;
  uid: string | null;
  // Meeting/recurrence/reminder/link fields (migration 34)
  meeting_link: string | null;
  recurring_event_id: string | null;
  recurrence_rule: string | null;
  reminders_json: string | null;
  reminders_notified_at: number | null;
  linked_thread_id: string | null;
  linked_thread_account_id: string | null;
  meeting_record_id: string | null;
  meeting_record_url: string | null;
}

export async function upsertCalendarEvent(event: {
  accountId: string;
  googleEventId: string;
  summary: string | null;
  description: string | null;
  location: string | null;
  startTime: number;
  endTime: number;
  isAllDay: boolean;
  status: string;
  organizerEmail: string | null;
  attendeesJson: string | null;
  htmlLink: string | null;
  calendarId?: string | null;
  remoteEventId?: string | null;
  etag?: string | null;
  icalData?: string | null;
  uid?: string | null;
  meetingLink?: string | null;
  recurringEventId?: string | null;
  recurrenceRule?: string | null;
  remindersJson?: string | null;
}): Promise<void> {
  const db = await getDb();
  const id = crypto.randomUUID();
  await db.execute(
    `INSERT INTO calendar_events (id, account_id, google_event_id, summary, description, location, start_time, end_time, is_all_day, status, organizer_email, attendees_json, html_link, calendar_id, remote_event_id, etag, ical_data, uid, meeting_link, recurring_event_id, recurrence_rule, reminders_json)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
     ON CONFLICT(account_id, google_event_id) DO UPDATE SET
       summary = $4, description = $5, location = $6, start_time = $7, end_time = $8,
       is_all_day = $9, status = $10, organizer_email = $11, attendees_json = $12,
       html_link = $13, calendar_id = $14, remote_event_id = $15, etag = $16,
       ical_data = $17, uid = $18, meeting_link = $19, recurring_event_id = $20,
       recurrence_rule = $21, reminders_json = $22, updated_at = unixepoch()`,
    [
      id, event.accountId, event.googleEventId, event.summary, event.description,
      event.location, event.startTime, event.endTime, event.isAllDay ? 1 : 0,
      event.status, event.organizerEmail, event.attendeesJson, event.htmlLink,
      event.calendarId ?? null, event.remoteEventId ?? null, event.etag ?? null,
      event.icalData ?? null, event.uid ?? null,
      event.meetingLink ?? null, event.recurringEventId ?? null,
      event.recurrenceRule ?? null, event.remindersJson ?? null,
    ],
  );
}

export async function getCalendarEventsInRange(
  accountId: string,
  startTime: number,
  endTime: number,
): Promise<DbCalendarEvent[]> {
  const db = await getDb();
  return db.select<DbCalendarEvent[]>(
    `SELECT * FROM calendar_events
     WHERE account_id = $1 AND start_time < $3 AND end_time > $2
     ORDER BY start_time ASC`,
    [accountId, startTime, endTime],
  );
}

export async function getCalendarEventsInRangeMulti(
  accountId: string,
  calendarIds: string[],
  startTime: number,
  endTime: number,
): Promise<DbCalendarEvent[]> {
  if (calendarIds.length === 0) {
    return getCalendarEventsInRange(accountId, startTime, endTime);
  }
  const db = await getDb();
  const placeholders = calendarIds.map((_, i) => `$${i + 4}`).join(", ");
  return db.select<DbCalendarEvent[]>(
    `SELECT * FROM calendar_events
     WHERE account_id = $1 AND start_time < $3 AND end_time > $2
       AND (calendar_id IN (${placeholders}) OR calendar_id IS NULL)
     ORDER BY start_time ASC`,
    [accountId, startTime, endTime, ...calendarIds],
  );
}

export async function deleteEventsForCalendar(calendarId: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM calendar_events WHERE calendar_id = $1", [calendarId]);
}

export async function getEventByRemoteId(
  calendarId: string,
  remoteEventId: string,
): Promise<DbCalendarEvent | null> {
  return selectFirstBy<DbCalendarEvent>(
    "SELECT * FROM calendar_events WHERE calendar_id = $1 AND remote_event_id = $2",
    [calendarId, remoteEventId],
  );
}

export async function deleteEventByRemoteId(
  calendarId: string,
  remoteEventId: string,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "DELETE FROM calendar_events WHERE calendar_id = $1 AND remote_event_id = $2",
    [calendarId, remoteEventId],
  );
}

export async function deleteCalendarEvent(eventId: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM calendar_events WHERE id = $1", [eventId]);
}

/**
 * Local-calendar update path: merge partial edits into the stored row and
 * return the resulting row. Matches by account + remote event id (the local
 * provider stores the same value in both google_event_id and remote_event_id).
 */
export async function updateEventByRemoteId(
  accountId: string,
  remoteEventId: string,
  changes: {
    summary?: string;
    description?: string;
    location?: string;
    startTime?: number;
    endTime?: number;
    isAllDay?: boolean;
  },
): Promise<DbCalendarEvent | null> {
  const existing = await selectFirstBy<DbCalendarEvent>(
    "SELECT * FROM calendar_events WHERE account_id = $1 AND (remote_event_id = $2 OR google_event_id = $2)",
    [accountId, remoteEventId],
  );
  if (!existing) return null;

  const updated: DbCalendarEvent = {
    ...existing,
    summary: changes.summary ?? existing.summary,
    description: changes.description ?? existing.description,
    location: changes.location ?? existing.location,
    start_time: changes.startTime ?? existing.start_time,
    end_time: changes.endTime ?? existing.end_time,
    is_all_day: changes.isAllDay === undefined ? existing.is_all_day : changes.isAllDay ? 1 : 0,
  };

  await upsertCalendarEvent({
    accountId,
    googleEventId: existing.google_event_id,
    summary: updated.summary,
    description: updated.description,
    location: updated.location,
    startTime: updated.start_time,
    endTime: updated.end_time,
    isAllDay: updated.is_all_day === 1,
    status: updated.status,
    organizerEmail: updated.organizer_email,
    attendeesJson: updated.attendees_json,
    htmlLink: updated.html_link,
    calendarId: updated.calendar_id,
    remoteEventId: updated.remote_event_id,
    etag: updated.etag,
    icalData: updated.ical_data,
    uid: updated.uid,
    meetingLink: updated.meeting_link,
    recurringEventId: updated.recurring_event_id,
    recurrenceRule: updated.recurrence_rule,
    remindersJson: updated.reminders_json,
  });

  return updated;
}

/** Local-calendar delete path: remove by account + remote event id. */
export async function deleteEventByAccountAndRemoteId(
  accountId: string,
  remoteEventId: string,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "DELETE FROM calendar_events WHERE account_id = $1 AND (remote_event_id = $2 OR google_event_id = $2)",
    [accountId, remoteEventId],
  );
}

export async function getCalendarEventById(eventId: string): Promise<DbCalendarEvent | null> {
  return selectFirstBy<DbCalendarEvent>(
    "SELECT * FROM calendar_events WHERE id = $1",
    [eventId],
  );
}

/** Link an event to a mail thread (or clear the link with null). */
export async function linkEventToThread(
  eventId: string,
  threadId: string | null,
  threadAccountId: string | null,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE calendar_events SET linked_thread_id = $1, linked_thread_account_id = $2, updated_at = unixepoch() WHERE id = $3",
    [threadId, threadAccountId, eventId],
  );
}

/** Attach the Toastovač meeting record reference to an event. */
export async function linkEventToMeetingRecord(
  eventId: string,
  recordId: string | null,
  recordUrl: string | null,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE calendar_events SET meeting_record_id = $1, meeting_record_url = $2, updated_at = unixepoch() WHERE id = $3",
    [recordId, recordUrl, eventId],
  );
}

/** Mark the moment the local checker notified about this event's reminder. */
export async function markRemindersNotified(eventId: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE calendar_events SET reminders_notified_at = unixepoch(), updated_at = unixepoch() WHERE id = $1",
    [eventId],
  );
}

/**
 * Events whose reminder window has opened and that have not been notified
 * yet. The window is [start - minutes, start) for each reminder in
 * reminders_json.
 */
export async function getDueCalendarReminders(now: number): Promise<DbCalendarEvent[]> {
  const db = await getDb();
  const rows = await db.select<DbCalendarEvent[]>(
    `SELECT * FROM calendar_events
     WHERE reminders_json IS NOT NULL
       AND reminders_json != ''
       AND reminders_notified_at IS NULL
       AND status != 'cancelled'
       AND start_time > $1
     ORDER BY start_time ASC
     LIMIT 200`,
    [now],
  );
  return rows.filter((row) => reminderWindowOpen(row, now));
}

function reminderWindowOpen(event: DbCalendarEvent, now: number): boolean {
  // Defense in depth on top of the SQL filter: a notified or cancelled event
  // must never fire again even if the query is widened or the mock replaces
  // the SQL layer in tests.
  if (event.reminders_notified_at !== null) return false;
  if (event.status === "cancelled") return false;
  let reminders: { minutes?: number }[] = [];
  try {
    reminders = JSON.parse(event.reminders_json ?? "[]") as { minutes?: number }[];
  } catch {
    return false;
  }
  return reminders.some((r) => {
    const minutes = typeof r.minutes === "number" ? r.minutes : 0;
    const dueAt = event.start_time - minutes * 60;
    return dueAt <= now && now < event.start_time;
  });
}

/** Events related to a mail thread by explicit link or participant/subject match. */
export async function getEventsRelatedToThread(
  accountId: string,
  threadId: string,
  threadSubject: string,
  threadParticipants: string[],
  windowStart: number,
  windowEnd: number,
): Promise<DbCalendarEvent[]> {
  const db = await getDb();
  const rows = await db.select<DbCalendarEvent[]>(
    `SELECT * FROM calendar_events
     WHERE account_id = $1
       AND start_time >= $2 AND start_time <= $3
       AND status != 'cancelled'
     ORDER BY start_time ASC`,
    [accountId, windowStart, windowEnd],
  );
  return rows.filter((event) => {
    if (event.linked_thread_id === threadId && event.linked_thread_account_id === accountId) {
      return true;
    }
    return matchesEventByParticipantsAndSubject(event, threadSubject, threadParticipants);
  });
}

/**
 * Events without an explicit link that look like they belong to a thread:
 * a participant (organizer or attendee) appears in the thread's participant
 * set AND the subject shares at least one distinctive token. Both halves are
 * required — a shared participant alone matches every meeting with that
 * person, a shared subject alone matches unrelated events with the same
 * generic title.
 */
export function matchesEventByParticipantsAndSubject(
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
