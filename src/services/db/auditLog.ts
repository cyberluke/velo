import { getDb } from "./connection";

export interface DbAuditLogEntry {
  id: string;
  account_id: string | null;
  action: string;
  details_json: string | null;
  created_at: number;
}

export type AuditAction =
  | "send_email"
  | "delete_thread"
  | "permanent_delete_thread"
  | "export_thread_eml"
  | "export_account_mbox"
  | "pgp_key_added"
  | "pgp_key_removed"
  | "access_role_changed"
  | "account_removed";

/**
 * Append-only audit trail for consequential actions. Never edited or deleted
 * by application code — it is the CTO/legal surface for "what happened and
 * when" (and the proof that exports/keys were handled deliberately).
 */
export async function logAudit(
  action: AuditAction,
  details: Record<string, unknown> = {},
  accountId: string | null = null,
): Promise<void> {
  try {
    const db = await getDb();
    await db.execute(
      `INSERT INTO audit_log (id, account_id, action, details_json)
       VALUES ($1, $2, $3, $4)`,
      [crypto.randomUUID(), accountId, action, JSON.stringify(details)],
    );
  } catch (err) {
    // Auditing must never break the action it records.
    console.error("[audit] Failed to write log entry:", err);
  }
}

export async function getAuditLog(
  limit = 200,
  accountId: string | null = null,
): Promise<DbAuditLogEntry[]> {
  const db = await getDb();
  if (accountId) {
    return db.select<DbAuditLogEntry[]>(
      `SELECT * FROM audit_log WHERE account_id = $1
       ORDER BY created_at DESC, id DESC LIMIT $2`,
      [accountId, limit],
    );
  }
  return db.select<DbAuditLogEntry[]>(
    "SELECT * FROM audit_log ORDER BY created_at DESC, id DESC LIMIT $1",
    [limit],
  );
}