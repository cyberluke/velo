import { getDb, selectFirstBy } from "./connection";

export interface DbMeetingRecord {
  id: string;
  event_id: string;
  source: string;
  record_url: string | null;
  title: string | null;
  transcript: string | null;
  summary: string | null;
  decisions_json: string | null;
  action_items_json: string | null;
  synced_at: number;
}

export interface MeetingRecordInput {
  eventId: string;
  source?: string;
  recordUrl?: string | null;
  title?: string | null;
  transcript?: string | null;
  summary?: string | null;
  decisions?: string[];
  actionItems?: string[];
}

/**
 * Upsert a meeting record for an event. Idempotent: passing the same
 * record again replaces the previous content in place, and the event's
 * meeting_record_id/url are kept in sync so the graph edge stays valid.
 */
export async function upsertMeetingRecord(input: MeetingRecordInput): Promise<string> {
  const db = await getDb();
  const existing = await selectFirstBy<DbMeetingRecord>(
    "SELECT * FROM meeting_records WHERE event_id = $1",
    [input.eventId],
  );
  const id = existing?.id ?? crypto.randomUUID();

  await db.execute(
    `INSERT INTO meeting_records (id, event_id, source, record_url, title, transcript, summary, decisions_json, action_items_json, synced_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, unixepoch())
     ON CONFLICT(id) DO UPDATE SET
       source = $3, record_url = $4, title = $5, transcript = $6, summary = $7,
       decisions_json = $8, action_items_json = $9, synced_at = unixepoch()`,
    [
      id,
      input.eventId,
      input.source ?? "toastovac",
      input.recordUrl ?? null,
      input.title ?? null,
      input.transcript ?? null,
      input.summary ?? null,
      input.decisions ? JSON.stringify(input.decisions) : null,
      input.actionItems ? JSON.stringify(input.actionItems) : null,
    ],
  );

  await db.execute(
    "UPDATE calendar_events SET meeting_record_id = $1, meeting_record_url = $2, updated_at = unixepoch() WHERE id = $3",
    [id, input.recordUrl ?? null, input.eventId],
  );

  return id;
}

export async function getMeetingRecordForEvent(eventId: string): Promise<DbMeetingRecord | null> {
  return selectFirstBy<DbMeetingRecord>(
    "SELECT * FROM meeting_records WHERE event_id = $1",
    [eventId],
  );
}

export async function getMeetingRecordById(recordId: string): Promise<DbMeetingRecord | null> {
  return selectFirstBy<DbMeetingRecord>(
    "SELECT * FROM meeting_records WHERE id = $1",
    [recordId],
  );
}

export async function deleteMeetingRecord(recordId: string): Promise<void> {
  const db = await getDb();
  const record = await getMeetingRecordById(recordId);
  await db.execute("DELETE FROM meeting_records WHERE id = $1", [recordId]);
  if (record) {
    await db.execute(
      "UPDATE calendar_events SET meeting_record_id = NULL, meeting_record_url = NULL, updated_at = unixepoch() WHERE id = $1",
      [record.event_id],
    );
  }
}

/** JSON-safe accessors for the string columns. */
export function meetingRecordDecisions(record: DbMeetingRecord): string[] {
  return parseArray(record.decisions_json);
}

export function meetingRecordActionItems(record: DbMeetingRecord): string[] {
  return parseArray(record.action_items_json);
}

function parseArray(json: string | null): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}