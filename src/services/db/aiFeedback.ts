import { getDb } from "./connection";

export interface DbAiFeedback {
  id: string;
  account_id: string;
  thread_id: string;
  kind: string;
  value: number;
  created_at: number;
}

/**
 * Record thumbs-up/down on an AI output (summary, smart reply, digest, ...).
 * Negative feedback invalidates the cached output so the next request
 * regenerates it. Feedback rows are append-only — they form the signal set
 * for future eval/eviction decisions.
 */
export async function recordAiFeedback(
  accountId: string,
  threadId: string,
  kind: string,
  value: 1 | -1,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO ai_feedback (id, account_id, thread_id, kind, value)
     VALUES ($1, $2, $3, $4, $5)`,
    [crypto.randomUUID(), accountId, threadId, kind, value],
  );
}

export async function getAiFeedback(
  accountId: string,
  threadId: string,
  kind: string,
): Promise<DbAiFeedback[]> {
  const db = await getDb();
  return db.select<DbAiFeedback[]>(
    `SELECT * FROM ai_feedback
     WHERE account_id = $1 AND thread_id = $2 AND kind = $3
     ORDER BY created_at ASC`,
    [accountId, threadId, kind],
  );
}

/** Most recent feedback value (1 / -1) for a scope, or null when never rated. */
export async function getLatestAiFeedback(
  accountId: string,
  threadId: string,
  kind: string,
): Promise<1 | -1 | null> {
  const rows = await getAiFeedback(accountId, threadId, kind);
  const latest = rows[rows.length - 1];
  return latest ? (latest.value === 1 ? 1 : -1) : null;
}

export async function deleteAiFeedback(
  id: string,
): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM ai_feedback WHERE id = $1", [id]);
}