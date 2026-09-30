/**
 * V271 Identity + Personal Graph integration types.
 *
 * V271 is the external identity/graph platform this application registers
 * with (one shared NAI client, Authorization Code + PKCE) and syncs a
 * summary of the user's mail and calendar into — never a second mail or
 * calendar store. The graph references NAI data through these adapters.
 *
 * All entities carry `sourceId`s built from NAI's own ids, which is what
 * makes repeated sync idempotent: the same source id always produces the
 * same entity, and the graph upserts on it.
 */

/** Mail entities synced to the graph. */
export const MAIL_ENTITIES = ["mail.thread", "mail.contact", "mail.message_ref"] as const;

/** Calendar entities synced to the graph. */
export const CALENDAR_ENTITIES = ["calendar.event", "calendar.participant"] as const;

/** Meeting records (Toastovač Meeting Scribe) synced to the graph. */
export const MEETING_ENTITIES = ["meeting.record"] as const;

export type GraphEntityType =
  | (typeof MAIL_ENTITIES)[number]
  | (typeof CALENDAR_ENTITIES)[number]
  | (typeof MEETING_ENTITIES)[number];

/** A single node pushed to the V271 Personal Graph. */
export interface GraphEntity {
  type: GraphEntityType;
  /** Provider/source id for idempotent sync, e.g. "gmail:acc123:thread456". */
  sourceId: string;
  /** Entity metadata. */
  data: Record<string, unknown>;
}

/** Relationship edges between entities. */
export type GraphRelationshipType = "ATTENDED" | "ORGANIZED" | "RELATED_TO" | "HAS_MEETING";

export interface GraphEdge {
  type: GraphRelationshipType;
  fromType: GraphEntityType;
  fromSourceId: string;
  toType: GraphEntityType;
  toSourceId: string;
  /** Optional edge metadata (e.g. responseStatus for ATTENDED). */
  data?: Record<string, unknown>;
}

/** One sync push payload. */
export interface GraphSyncPayload {
  client: string;
  entities: GraphEntity[];
  edges: GraphEdge[];
  syncedAt: number;
}

/** Provider/source ids for the entity kinds. */
export function mailThreadSourceId(accountId: string, threadId: string): string {
  return `${accountId}:thread:${threadId}`;
}

export function mailContactSourceId(accountId: string, email: string): string {
  return `${accountId}:contact:${email.toLowerCase()}`;
}

export function mailMessageSourceId(accountId: string, messageId: string): string {
  return `${accountId}:message:${messageId}`;
}

export function calendarEventSourceId(accountId: string, eventId: string): string {
  return `${accountId}:event:${eventId}`;
}

export function calendarParticipantSourceId(accountId: string, eventId: string, email: string): string {
  return `${accountId}:event:${eventId}:participant:${email.toLowerCase()}`;
}

export function meetingRecordSourceId(accountId: string, recordId: string): string {
  return `${accountId}:meeting:${recordId}`;
}

/** Field names used by the cross-source AI layer as provenance anchors. */
export interface ProvenanceRef {
  kind: "mail.thread" | "mail.message_ref" | "calendar.event" | "meeting.record";
  sourceId: string;
  title: string;
}