import { useState, useEffect, useCallback } from "react";
import { History } from "lucide-react";
import { getAuditLog, type DbAuditLogEntry } from "@/services/db/auditLog";
import { useI18n } from "@/i18n";
import { formatDateTime } from "@/utils/date";

const ACTION_KEYS: Record<string, string> = {
  send_email: "audit.action.send_email",
  delete_thread: "audit.action.delete_thread",
  permanent_delete_thread: "audit.action.permanent_delete_thread",
  export_thread_eml: "audit.action.export_thread_eml",
  export_account_mbox: "audit.action.export_account_mbox",
  pgp_key_added: "audit.action.pgp_key_added",
  pgp_key_removed: "audit.action.pgp_key_removed",
  access_role_changed: "audit.action.access_role_changed",
  account_removed: "audit.action.account_removed",
};

/**
 * The CTO's "what happened" view: a bounded, append-only trail of
 * consequential actions (sends, deletes, exports, key/role changes).
 */
export function AuditLogView() {
  const { t } = useI18n();
  const [entries, setEntries] = useState<DbAuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setEntries(await getAuditLog(100));
    } catch (err) {
      console.error("Failed to load audit log:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return <p className="text-xs text-text-tertiary">{t("common.loading")}</p>;
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center py-6 text-center">
        <History size={20} className="text-text-tertiary/50 mb-2" />
        <p className="text-xs text-text-tertiary">{t("audit.empty")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
      {entries.map((entry) => {
        let detail = "";
        try {
          const parsed = JSON.parse(entry.details_json ?? "{}") as Record<string, unknown>;
          detail = Object.entries(parsed)
            .map(([k, v]) => `${k}: ${String(v)}`)
            .join(", ");
        } catch {
          detail = entry.details_json ?? "";
        }
        return (
          <div
            key={entry.id}
            className="flex items-start justify-between gap-2 py-1.5 px-2 bg-bg-secondary rounded-md"
          >
            <div className="min-w-0">
              <div className="text-xs text-text-primary truncate">
                {t(ACTION_KEYS[entry.action] ?? entry.action)}
              </div>
              {detail && (
                <div className="text-[0.625rem] text-text-tertiary truncate">{detail}</div>
              )}
            </div>
            <span className="shrink-0 text-[0.625rem] text-text-tertiary">
              {formatDateTime(entry.created_at * 1000)}
            </span>
          </div>
        );
      })}
    </div>
  );
}