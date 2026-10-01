import { useState, useEffect, useCallback, useMemo } from "react";
import { Clock, Mail, Inbox, CheckCircle2, Star } from "lucide-react";
import { useAccountStore, listedAccountIds } from "@/stores/accountStore";
import { getFollowThroughItems, type FollowThroughItem } from "@/services/followup/followThrough";
import { navigateToThread } from "@/router/navigate";
import { useOwnAddresses } from "@/hooks/useOwnAddresses";
import { markThreadRead } from "@/services/emailActions";
import { playSound } from "@/services/sounds/soundManager";
import { useI18n } from "@/i18n";
import { formatRelativeDate } from "@/utils/date";

/**
 * Follow-through dashboard: every conversation that has been waiting on the
 * user for 2+ days, newest first. The CEO's "what did I miss" view — the list
 * of people who replied and are still waiting for an answer.
 */
export function FollowThroughPanel() {
  const { t } = useI18n();
  const accounts = useAccountStore((s) => s.accounts);
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const unifiedInbox = useAccountStore((s) => s.unifiedInbox);
  const accountIds = useMemo(
    () => listedAccountIds({ accounts, activeAccountId, unifiedInbox }),
    [accounts, activeAccountId, unifiedInbox],
  );

  const [items, setItems] = useState<FollowThroughItem[]>([]);
  const [loading, setLoading] = useState(true);

  const ownAddresses = useOwnAddresses(accountIds);
  // useOwnAddresses returns a Set for the whole scope; reuse it for every account
  const effectiveOwn = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    for (const id of accountIds) {
      map[id] = ownAddresses;
    }
    return map;
  }, [accountIds, ownAddresses]);

  const load = useCallback(async () => {
    if (accountIds.length === 0) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await getFollowThroughItems(accountIds, effectiveOwn, 2);
      setItems(result);
    } catch (err) {
      console.error("Failed to load follow-through:", err);
    } finally {
      setLoading(false);
    }
  }, [accountIds.join(","), effectiveOwn]);

  useEffect(() => {
    load();
  }, [load]);

  const handleOpen = useCallback((item: FollowThroughItem) => {
    navigateToThread(item.threadId);
    void markThreadRead(item.accountId, item.threadId, [], true);
  }, []);

  const handleDismiss = useCallback(
    async (item: FollowThroughItem) => {
      await markThreadRead(item.accountId, item.threadId, [], true);
      void playSound("clear");
      setItems((prev) => prev.filter((i) => i.threadId !== item.threadId));
    },
    [],
  );

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-5 py-3">
        <div className="flex items-center gap-2 mb-3 text-text-secondary">
          <Clock size={14} className="text-accent" />
          <span className="text-xs">{t("followThrough.subtitle")}</span>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-text-tertiary py-8 justify-center">
            <div className="w-3 h-3 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
            <span className="text-xs">{t("common.loading")}</span>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Inbox size={28} className="text-text-tertiary mb-2" />
            <p className="text-sm text-text-secondary">{t("followThrough.empty")}</p>
            <p className="text-xs text-text-tertiary mt-1">{t("followThrough.emptyHint")}</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {items.map((item) => (
              <div
                key={`${item.accountId}-${item.threadId}`}
                className="group flex items-center gap-3 px-3 py-2.5 rounded-lg bg-bg-secondary/70 border border-border-secondary hover:bg-bg-hover transition-colors cursor-pointer"
                onClick={() => handleOpen(item)}
              >
                <div className="shrink-0 w-8 h-8 rounded-full bg-accent/10 text-accent flex items-center justify-center">
                  <Mail size={14} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text-primary truncate">
                      {item.peerName ?? item.peerAddress ?? t("email.unknown")}
                    </span>
                    {item.isStarred === 1 && <Star size={11} className="text-warning shrink-0" />}
                    <span className="shrink-0 text-[0.625rem] bg-danger/10 text-danger px-1.5 py-0.5 rounded-full">
                      {t("followThrough.waiting").replace("{days}", String(item.daysWaiting))}
                    </span>
                  </div>
                  <div className="text-xs text-text-secondary truncate">
                    {item.subject ?? t("email.noSubject")}
                  </div>
                </div>
                <div className="shrink-0 text-[0.625rem] text-text-tertiary hidden sm:block">
                  {formatRelativeDate(item.lastMessageAt * 1000)}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleDismiss(item);
                  }}
                  className="shrink-0 p-1 text-text-tertiary opacity-0 group-hover:opacity-100 hover:text-accent transition-opacity"
                  title={t("followThrough.dismiss")}
                >
                  <CheckCircle2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}