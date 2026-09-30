import { getDb } from "@/services/db/connection";
import type {
  GraphEntity,
  GraphEdge,
  ProvenanceRef,
} from "./types";
import {
  mailThreadSourceId,
  mailContactSourceId,
  mailMessageSourceId,
  calendarEventSourceId,
  calendarParticipantSourceId,
  meetingRecordSourceId,
} from "./types";
import { extractEmailAddresses } from "@/utils/emailUtils";

/**
 * Adapters that summarize NAI's own stores into V271 graph entities.
 *
 * These are the defined adapter boundary the spec asks for: the graph never
 * holds a second copy of the mail or calendar database, it references NAI
 * data through these entity/edge shapes.
 */

const SYNC_LOOKBACK_DAYS = 30;

export interface CollectedGraphData {
  entities: GraphEntity[];
  edges: GraphEdge[];
  /** Provenance anchors for the cross-source AI layer. */
  provenance: ProvenanceRef[];
}

/** Mail thread/contact/message_ref entities for accounts with activity. */
export async function collectMailEntities(): Promise<CollectedGraphData> {
  const db = await getDb();
  const since = Math.floor(Date.now() / 1000) - SYNC_LOOKBACK_DAYS * 86400;

  const entities: GraphEntity[] = [];
  const edges: GraphEdge[] = [];

  const threads = await db.select<{
    id: string;
    account_id: string;
    subject: string | null;
    last_message_at: number | null;
    is_read: number;
    is_starred: number;
    is_muted: number;
  }[]>(
    `SELECT id, account_id, subject, last_message_at, is_read, is_starred, is_muted
     FROM threads
     WHERE last_message_at >= $1
     ORDER BY last_message_at DESC
     LIMIT 500`,
    [since],
  );

  const messageRows = await db.select<{
    id: string;
    account_id: string;
    thread_id: string;
    from_address: string | null;
    from_name: string | null;
    to_addresses: string | null;
    cc_addresses: string | null;
    subject: string | null;
    snippet: string | null;
    date: number;
  }[]>(
    `SELECT id, account_id, thread_id, from_address, from_name, to_addresses, cc_addresses, subject, snippet, date
     FROM messages
     WHERE date >= $1
     ORDER BY date DESC
     LIMIT 1500`,
    [since],
  );

  const messagesByThread = new Map<string, typeof messageRows>();
  for (const message of messageRows) {
    const key = `${message.account_id}:${message.thread_id}`;
    const list = messagesByThread.get(key) ?? [];
    list.push(message);
    messagesByThread.set(key, list);
  }

  for (const thread of threads) {
    const key = `${thread.account_id}:${thread.id}`;
    const messages = messagesByThread.get(key) ?? [];
    const participants = new Set<string>();
    for (const m of messages) {
      if (m.from_address) participants.add(m.from_address);
      for (const a of extractEmailAddresses(m.to_addresses)) participants.add(a);
      for (const a of extractEmailAddresses(m.cc_addresses)) participants.add(a);
    }

    entities.push({
      type: "mail.thread",
      sourceId: mailThreadSourceId(thread.account_id, thread.id),
      data: {
        thread_id: thread.id,
        subject: thread.subject,
        last_message_at: thread.last_message_at,
        is_read: thread.is_read === 1,
        is_starred: thread.is_starred === 1,
        is_muted: thread.is_muted === 1,
        participants: [...participants],
        message_refs: messages.map((m) => mailMessageSourceId(m.account_id, m.id)),
      },
    });

    for (const m of messages) {
      entities.push({
        type: "mail.message_ref",
        sourceId: mailMessageSourceId(m.account_id, m.id),
        data: {
          message_id: m.id,
          thread: mailThreadSourceId(m.account_id, m.thread_id),
          from_address: m.from_address,
          from_name: m.from_name,
          to_addresses: m.to_addresses,
          date: m.date,
          subject: m.subject,
          snippet: m.snippet,
        },
      });
    }
  }

  const contacts = await db.select<{
    email: string;
    display_name: string | null;
    frequency: number;
    last_contacted_at: number | null;
  }[]>(
    `SELECT email, display_name, frequency, last_contacted_at
     FROM contacts
     WHERE last_contacted_at >= $1 OR last_contacted_at IS NULL
     ORDER BY frequency DESC
     LIMIT 500`,
    [since],
  );
  for (const contact of contacts) {
    entities.push({
      type: "mail.contact",
      sourceId: mailContactSourceId("global", contact.email),
      data: {
        email: contact.email,
        display_name: contact.display_name,
        frequency: contact.frequency,
        last_contacted_at: contact.last_contacted_at,
      },
    });
  }

  return { entities, edges, provenance: [] };
}

/** Calendar event/participant entities with their edges. */
export async function collectCalendarEntities(): Promise<CollectedGraphData> {
  const db = await getDb();
  const now = Math.floor(Date.now() / 1000);

  const events = await db.select<{
    id: string;
    account_id: string;
    summary: string | null;
    start_time: number;
    end_time: number;
    status: string;
    organizer_email: string | null;
    attendees_json: string | null;
    meeting_link: string | null;
    location: string | null;
    recurrence_rule: string | null;
    recurring_event_id: string | null;
    linked_thread_id: string | null;
    linked_thread_account_id: string | null;
    meeting_record_id: string | null;
  }[]>(
    `SELECT id, account_id, summary, start_time, end_time, status, organizer_email,
            attendees_json, meeting_link, location, recurrence_rule, recurring_event_id,
            linked_thread_id, linked_thread_account_id, meeting_record_id
     FROM calendar_events
     WHERE start_time BETWEEN $1 AND $2
     ORDER BY start_time ASC
     LIMIT 1000`,
    [now - 90 * 86400, now + 365 * 86400],
  );

  const entities: GraphEntity[] = [];
  const edges: GraphEdge[] = [];

  for (const event of events) {
    const eventSourceId = calendarEventSourceId(event.account_id, event.id);
    entities.push({
      type: "calendar.event",
      sourceId: eventSourceId,
      data: {
        event_id: event.id,
        title: event.summary,
        start: event.start_time,
        end: event.end_time,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        organizer: event.organizer_email,
        meeting_link: event.meeting_link,
        location: event.location,
        status: event.status,
        recurrence: event.recurrence_rule ?? event.recurring_event_id,
      },
    });

    let attendees: { email?: string; responseStatus?: string }[] = [];
    try {
      attendees = JSON.parse(event.attendees_json ?? "[]") as {
        email?: string;
        responseStatus?: string;
      }[];
    } catch {
      // malformed attendees — ignore
    }

    if (event.organizer_email) {
      entities.push({
        type: "calendar.participant",
        sourceId: calendarParticipantSourceId(event.account_id, event.id, event.organizer_email),
        data: {
          event: eventSourceId,
          email: event.organizer_email,
          role: "organizer",
        },
      });
      edges.push({
        type: "ORGANIZED",
        fromType: "calendar.participant",
        fromSourceId: calendarParticipantSourceId(event.account_id, event.id, event.organizer_email),
        toType: "calendar.event",
        toSourceId: eventSourceId,
      });
    }

    for (const attendee of attendees) {
      if (!attendee.email) continue;
      const participantSourceId = calendarParticipantSourceId(
        event.account_id,
        event.id,
        attendee.email,
      );
      entities.push({
        type: "calendar.participant",
        sourceId: participantSourceId,
        data: {
          event: eventSourceId,
          email: attendee.email,
          role: "attendee",
          response_status: attendee.responseStatus,
        },
      });
      edges.push({
        type: "ATTENDED",
        fromType: "calendar.participant",
        fromSourceId: participantSourceId,
        toType: "calendar.event",
        toSourceId: eventSourceId,
        data: { responseStatus: attendee.responseStatus },
      });
    }

    // RELATED_TO: event -> the mail thread it came from.
    if (event.linked_thread_id && event.linked_thread_account_id) {
      edges.push({
        type: "RELATED_TO",
        fromType: "calendar.event",
        fromSourceId: eventSourceId,
        toType: "mail.thread",
        toSourceId: mailThreadSourceId(event.linked_thread_account_id, event.linked_thread_id),
      });
    }

    // HAS_MEETING: event -> its Toastovač meeting record.
    if (event.meeting_record_id) {
      edges.push({
        type: "HAS_MEETING",
        fromType: "calendar.event",
        fromSourceId: eventSourceId,
        toType: "meeting.record",
        toSourceId: meetingRecordSourceId(event.account_id, event.meeting_record_id),
      });
    }
  }

  return { entities, edges, provenance: [] };
}

/** Meeting records (Toastovač Meeting Scribe) entities. */
export async function collectMeetingEntities(): Promise<CollectedGraphData> {
  const db = await getDb();
  const records = await db.select<{
    id: string;
    event_id: string;
    source: string;
    record_url: string | null;
    title: string | null;
    summary: string | null;
    decisions_json: string | null;
    action_items_json: string | null;
    account_id: string;
  }[]>(
    `SELECT mr.id, mr.event_id, mr.source, mr.record_url, mr.title, mr.summary,
            mr.decisions_json, mr.action_items_json, e.account_id
     FROM meeting_records mr
     INNER JOIN calendar_events e ON e.id = mr.event_id
     ORDER BY mr.synced_at DESC
     LIMIT 500`,
  );

  const entities: GraphEntity[] = [];
  const edges: GraphEdge[] = [];

  for (const record of records) {
    const recordSourceId = meetingRecordSourceId(record.account_id, record.id);
    entities.push({
      type: "meeting.record",
      sourceId: recordSourceId,
      data: {
        record_id: record.id,
        event: calendarEventSourceId(record.account_id, record.event_id),
        record_url: record.record_url,
        title: record.title,
        summary: record.summary,
        decisions: parseJsonArray(record.decisions_json),
        action_items: parseJsonArray(record.action_items_json),
      },
    });
    edges.push({
      type: "HAS_MEETING",
      fromType: "calendar.event",
      fromSourceId: calendarEventSourceId(record.account_id, record.event_id),
      toType: "meeting.record",
      toSourceId: recordSourceId,
    });
  }

  return { entities, edges, provenance: [] };
}

function parseJsonArray(json: string | null): unknown[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}