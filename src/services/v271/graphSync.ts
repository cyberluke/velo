import { createBackgroundChecker } from "@/services/backgroundCheckers";
import { getDb } from "@/services/db/connection";
import type { GraphEntity, GraphEdge, GraphSyncPayload } from "./types";
import { getV271Config, isV271Ready } from "./settings";
import { resolveGraphTransport, type GraphTransport } from "./transport";
import { collectMailEntities, collectCalendarEntities, collectMeetingEntities } from "./adapters";

/**
 * V271 Personal Graph sync engine.
 *
 * Collects mail/calendar/meeting entities through the adapters, hashes each
 * entity together with its outgoing edges, and pushes only what changed
 * since the last successful push. The `graph_entities` table records the
 * hash of the last pushed state per (type, sourceId), which makes repeated
 * syncs idempotent: unchanged data is never pushed again, and a push that
 * fails leaves the old hash in place so the change is retried next run.
 *
 * Updates (event moved, attendee responded, recurrence changed, thread
 * updated, contact updated) all surface as a changed hash. Cancellations
 * surface as a status change, and a locally deleted event is sent as a
 * tombstone so the graph forgets it too.
 */

export interface GraphSyncResult {
  skipped: boolean;
  reason?: string;
  collected: number;
  changed: number;
  pushed: number;
  ok: boolean;
  error?: string;
}

/** Stable JSON: object keys sorted so the same data always hashes the same. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface GraphRow {
  entity_type: string;
  source_id: string;
  payload_hash: string;
}

export async function syncGraph(transportOverride?: GraphTransport): Promise<GraphSyncResult> {
  const config = await getV271Config();
  if (!config.enabled) {
    return { skipped: true, reason: "V271 sync is disabled", collected: 0, changed: 0, pushed: 0, ok: true };
  }

  const [mail, calendar, meetings] = await Promise.all([
    collectMailEntities(),
    collectCalendarEntities(),
    collectMeetingEntities(),
  ]);

  // Merge entities, deduping by (type, sourceId) — later collections win.
  const entities = new Map<string, GraphEntity>();
  for (const entity of [...mail.entities, ...calendar.entities, ...meetings.entities]) {
    entities.set(`${entity.type}:${entity.sourceId}`, entity);
  }
  const edgesBySource = new Map<string, GraphEdge[]>();
  const addEdge = (edge: GraphEdge) => {
    const list = edgesBySource.get(edge.fromSourceId) ?? [];
    list.push(edge);
    edgesBySource.set(edge.fromSourceId, list);
  };
  for (const edge of [...mail.edges, ...calendar.edges, ...meetings.edges]) {
    addEdge(edge);
  }

  // Tombstones: a calendar event or meeting record that was synced before
  // and no longer exists locally is deleted on the graph.
  const db = await getDb();
  const aliveEventKeys = new Set(
    (await db.select<{ id: string; account_id: string }[]>(
      "SELECT id, account_id FROM calendar_events",
    )).map((e) => `calendar.event:${e.account_id}:event:${e.id}`),
  );
  const aliveRecordKeys = new Set(
    (await db.select<{ id: string; account_id: string }[]>(
      `SELECT mr.id, e.account_id FROM meeting_records mr
       INNER JOIN calendar_events e ON e.id = mr.event_id`,
    )).map((r) => `meeting.record:${r.account_id}:meeting:${r.id}`),
  );

  const previousRows = await db.select<GraphRow[]>(
    "SELECT entity_type, source_id, payload_hash FROM graph_entities",
  );
  const previous = new Map<string, GraphRow>();
  for (const row of previousRows) {
    previous.set(`${row.entity_type}:${row.source_id}`, row);
  }

  // Every previously synced calendar.event/meeting.record that is gone
  // locally becomes a tombstone payload.
  const tombstoned: GraphEntity[] = [];
  for (const [key, row] of previous) {
    if (
      (row.entity_type === "calendar.event" && !aliveEventKeys.has(key)) ||
      (row.entity_type === "meeting.record" && !aliveRecordKeys.has(key))
    ) {
      const sourceId = key.slice(row.entity_type.length + 1);
      tombstoned.push({
        type: row.entity_type as GraphEntity["type"],
        sourceId,
        data: { deleted: true },
      });
    }
  }

  const changedEntities: GraphEntity[] = [];
  const changedEdges: GraphEdge[] = [];
  let changedCount = 0;

  for (const [key, entity] of entities) {
    const edges = edgesBySource.get(entity.sourceId) ?? [];
    const nodeHash = await sha256Hex(
      stableStringify({ entity, edges: edges.map(stableStringify).sort() }),
    );
    const prior = previous.get(key);
    if (prior && prior.payload_hash === nodeHash) continue; // unchanged — idempotent
    changedCount++;
    changedEntities.push(entity);
    changedEdges.push(...edges);
  }
  for (const tombstone of tombstoned) {
    const key = `${tombstone.type}:${tombstone.sourceId}`;
    const prior = previous.get(key);
    const nodeHash = await sha256Hex(stableStringify({ entity: tombstone, edges: [] }));
    if (prior && prior.payload_hash === nodeHash) continue;
    changedCount++;
    changedEntities.push(tombstone);
  }

  if (changedCount === 0) {
    return { skipped: false, collected: entities.size, changed: 0, pushed: 0, ok: true };
  }

  const payload: GraphSyncPayload = {
    client: "naiemail",
    entities: changedEntities,
    edges: changedEdges,
    syncedAt: Date.now(),
  };

  const transport = transportOverride ?? (await resolveGraphTransport());
  const result = await transport.push(payload);
  if (!result.ok) {
    return {
      skipped: false,
      collected: entities.size,
      changed: changedCount,
      pushed: 0,
      ok: false,
      error: result.error ?? `HTTP ${result.status ?? "unknown"}`,
    };
  }

  // Only record hashes for what was actually pushed.
  const now = Math.floor(Date.now() / 1000);
  for (const entity of changedEntities) {
    const nodeHash = await sha256Hex(
      stableStringify({ entity, edges: (edgesBySource.get(entity.sourceId) ?? []).map(stableStringify).sort() }),
    );
    await db.execute(
      `INSERT INTO graph_entities (entity_type, source_id, payload_hash, last_synced_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT(entity_type, source_id) DO UPDATE SET
         payload_hash = $3, last_synced_at = $4`,
      [entity.type, entity.sourceId, nodeHash, now],
    );
  }

  return { skipped: false, collected: entities.size, changed: changedCount, pushed: changedEntities.length, ok: true };
}

let checker: ReturnType<typeof createBackgroundChecker> | null = null;

/**
 * Background loop: runs once immediately and then every 15 minutes. No-op
 * until the user enables V271 and configures the graph endpoint.
 */
export function startV271GraphChecker(): void {
  if (checker) return;
  checker = createBackgroundChecker(
    "v271-graph",
    async () => {
      if (!(await isV271Ready())) return;
      const result = await syncGraph();
      if (!result.ok) {
        console.warn("[v271-graph] Sync failed:", result.error);
      }
    },
    15 * 60_000,
  );
  checker.start();
}

export function stopV271GraphChecker(): void {
  checker?.stop();
  checker = null;
}