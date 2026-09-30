import { getDb } from "@/services/db/connection";
import { reportError } from "@/stores/toastStore";
import {
  failSemanticSearchIndex,
  finishSemanticSearchIndex,
  gcSemanticSearch,
  getSemanticSearchStatus,
  reindexSemanticSearch,
  upsertSemanticSearchBatch,
  type IndexItem,
} from "@/services/search/semanticSearchRuntime";

// The gateway serializes NPU inference and indexes on the 512-token profile;
// small batches keep interactive query latency responsive during a reindex.
const BATCH_SIZE = 64;
// ~512 tokens at the profile budget; the gateway truncates further if needed.
const TEXT_LIMIT = 1500;
const DEFAULT_DATASETS = ["messages", "attachments", "calendar"];

interface MessageRow {
  id: string;
  subject: string | null;
  body_text: string | null;
  internal_date: number | null;
}

interface AttachmentRow {
  id: string;
  filename: string | null;
  mime_type: string | null;
  extracted_text: string | null;
  internal_date: number | null;
}

interface CalendarRow {
  id: string;
  summary: string | null;
  description: string | null;
  location: string | null;
  start_time: number | null;
}

function truncate(text: string, limit = TEXT_LIMIT): string {
  const trimmed = text.trim();
  return trimmed.length > limit ? trimmed.slice(0, limit) : trimmed;
}

function unixSeconds(ms: number | null | undefined): number | undefined {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return undefined;
  return Math.floor(ms / 1000);
}

function joinText(parts: Array<string | null | undefined>): string | null {
  const joined = parts
    .map((part) => (part == null ? "" : String(part).trim()))
    .filter(Boolean)
    .join("\n\n");
  return joined ? truncate(joined) : null;
}

/** Keyset-paged streams of indexable rows per dataset. */
async function* collectBatches(dataset: string): AsyncGenerator<IndexItem[]> {
  const db = await getDb();
  if (dataset === "messages") {
    let lastId = "";
    for (;;) {
      const rows = await db.select<MessageRow[]>(
        `SELECT id, subject, body_text, internal_date FROM messages
         WHERE body_text IS NOT NULL AND length(body_text) > 0 AND id > $1
         ORDER BY id LIMIT $2`,
        [lastId, BATCH_SIZE * 4],
      );
      if (rows.length === 0) break;
      lastId = rows[rows.length - 1]!.id;
      const items: IndexItem[] = [];
      for (const row of rows) {
        const text = joinText([row.subject, row.body_text]);
        if (!text) continue;
        items.push({
          id: row.id,
          text,
          title: row.subject ?? undefined,
          createdAt: unixSeconds(row.internal_date),
          kind: "message",
        });
      }
      if (items.length > 0) yield items;
    }
    return;
  }
  if (dataset === "attachments") {
    let lastId = "";
    for (;;) {
      const rows = await db.select<AttachmentRow[]>(
        `SELECT a.id, a.filename, a.mime_type, a.extracted_text, m.internal_date
         FROM attachments a
         LEFT JOIN messages m ON m.account_id = a.account_id AND m.id = a.message_id
         WHERE a.extracted_text IS NOT NULL AND a.extraction_error IS NULL
           AND length(a.extracted_text) > 0 AND a.id > $1
         ORDER BY a.id LIMIT $2`,
        [lastId, BATCH_SIZE * 4],
      );
      if (rows.length === 0) break;
      lastId = rows[rows.length - 1]!.id;
      const items: IndexItem[] = [];
      for (const row of rows) {
        const text = joinText([`Attachment: ${row.filename ?? "unknown file"}`, row.extracted_text]);
        if (!text) continue;
        items.push({
          id: row.id,
          text,
          title: row.filename ?? "Attachment",
          createdAt: unixSeconds(row.internal_date),
          kind: row.mime_type ?? "attachment",
        });
      }
      if (items.length > 0) yield items;
    }
    return;
  }
  if (dataset === "calendar") {
    let lastId = "";
    for (;;) {
      const rows = await db.select<CalendarRow[]>(
        `SELECT id, summary, description, location, start_time FROM calendar_events
         WHERE (summary IS NOT NULL OR description IS NOT NULL OR location IS NOT NULL)
           AND id > $1
         ORDER BY id LIMIT $2`,
        [lastId, BATCH_SIZE * 4],
      );
      if (rows.length === 0) break;
      lastId = rows[rows.length - 1]!.id;
      const items: IndexItem[] = [];
      for (const row of rows) {
        const text = joinText([row.summary, row.description, row.location]);
        if (!text) continue;
        items.push({
          id: row.id,
          text,
          title: row.summary ?? "Calendar event",
          createdAt: unixSeconds(row.start_time),
          kind: "calendar",
        });
      }
      if (items.length > 0) yield items;
    }
    return;
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error) || "Unknown error";
  } catch {
    return "Unknown error";
  }
}

/**
 * Full index pass through the NPU retrieval gateway. Idempotent: the gateway
 * derives stable point IDs, so re-running overwrites and never duplicates;
 * per-dataset GC then prunes points deleted from the local database.
 */
export async function runSemanticSearchIndexer(): Promise<void> {
  let status;
  try {
    status = await getSemanticSearchStatus();
  } catch {
    return; // the status observer reports IPC failures
  }
  if (!status.enabled || status.state !== "ready") return;
  try {
    await reindexSemanticSearch();
  } catch {
    return; // reported by the command wrapper
  }
  const datasets = status.datasets.length > 0 ? status.datasets : DEFAULT_DATASETS;
  try {
    for (const dataset of datasets) {
      for await (const batch of collectBatches(dataset)) {
        for (let i = 0; i < batch.length; i += BATCH_SIZE) {
          await upsertSemanticSearchBatch(dataset, batch.slice(i, i + BATCH_SIZE));
        }
      }
      await gcSemanticSearch(dataset);
    }
    await finishSemanticSearchIndex();
  } catch (error) {
    const detail = errorMessage(error);
    try {
      await failSemanticSearchIndex(detail);
    } catch {
      // the state may have moved on (disabled mid-run); nothing to add
    }
    reportError("Semantic search indexing failed", detail);
  }
}