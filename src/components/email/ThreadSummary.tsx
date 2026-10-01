import { useState, useCallback, useRef, useEffect } from "react";
import { Sparkles, ChevronDown, ChevronUp, RefreshCw, ThumbsUp, ThumbsDown } from "lucide-react";
import { isAiAvailable } from "@/services/ai/providerManager";
import { summarizeThread } from "@/services/ai/aiService";
import { deleteAiCache } from "@/services/db/aiCache";
import { recordAiFeedback, getLatestAiFeedback } from "@/services/db/aiFeedback";
import { notifyAiEvent } from "@/services/notifications/notificationManager";
import { notify } from "@/stores/toastStore";
import type { DbMessage } from "@/services/db/messages";
import { useI18n } from "@/i18n";

interface ThreadSummaryProps {
  threadId: string;
  accountId: string;
  messages: DbMessage[];
}

export function ThreadSummary({ threadId, accountId, messages }: ThreadSummaryProps) {
  const { t } = useI18n();
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [available, setAvailable] = useState(false);
  const [feedback, setFeedback] = useState<1 | -1 | null>(null);
  const checkedRef = useRef(false);

  useEffect(() => {
    if (checkedRef.current) return;
    checkedRef.current = true;
    if (messages.length < 2) return;
    isAiAvailable().then(setAvailable);
  }, [messages.length]);

  const loadingRef = useRef(false);
  const loadSummary = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const result = await summarizeThread(threadId, accountId, messages);
      setSummary(result);
    } catch (err) {
      console.error("Failed to summarize thread:", err);
      setSummary(null);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [threadId, accountId, messages]);

  // Auto-load summary when available
  useEffect(() => {
    if (!available || messages.length < 2 || summary !== null || loadingRef.current) return;
    loadSummary();
  }, [available, messages.length, summary, loadSummary]);

  // Load the last feedback for this summary when it becomes available
  useEffect(() => {
    if (!available || messages.length < 2) return;
    getLatestAiFeedback(accountId, threadId, "summary").then((value) => {
      if (value !== null) setFeedback(value);
    });
  }, [available, messages.length, accountId, threadId]);

  const handleFeedback = useCallback(
    async (value: 1 | -1) => {
      await recordAiFeedback(accountId, threadId, "summary", value);
      setFeedback(value);
      if (value === -1) {
        // Regenerate: a "not helpful" answer should not be served from cache.
        await deleteAiCache(accountId, threadId, "summary");
        setSummary(null);
        setLoading(true);
        try {
          const result = await summarizeThread(threadId, accountId, messages);
          setSummary(result);
          notify("success", t("feedback.invalidated"));
        } catch (err) {
          console.error("Failed to regenerate summary:", err);
        } finally {
          setLoading(false);
        }
      } else {
        notify("success", t("feedback.thanks"));
      }
    },
    [accountId, threadId, messages, t],
  );

  const handleRefresh = useCallback(async () => {
    await deleteAiCache(accountId, threadId, "summary");
    setSummary(null);
    setLoading(true);
    try {
      const result = await summarizeThread(threadId, accountId, messages);
      setSummary(result);
      // The auto-load on thread open is silent (the summary appears in front
      // of the reader); a manual regenerate is a real AI processing event
      notifyAiEvent(t("feedback.notifyTitle"), t("feedback.notifyBody"), {
        threadId,
        accountId,
      });
    } catch (err) {
      console.error("Failed to refresh summary:", err);
    } finally {
      setLoading(false);
    }
  }, [threadId, accountId, messages, t]);

  if (!available || messages.length < 2) return null;

  return (
    <div className="mx-4 my-2 p-3 rounded-lg bg-accent/5 border border-accent/20">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-2 w-full text-left"
      >
        <Sparkles size={14} className="text-accent shrink-0" />
        <span className="text-xs font-medium text-accent flex-1">{t("email.aiSummary")}</span>
        {summary && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); handleRefresh(); }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); handleRefresh(); } }}
            className="p-0.5 text-text-tertiary hover:text-accent transition-colors cursor-pointer"
            title={t("email.refreshSummary")}
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          </span>
        )}
        {summary && (
          <span className="flex items-center gap-0.5">
            <button
              onClick={(e) => { e.stopPropagation(); void handleFeedback(1); }}
              className={`p-0.5 transition-colors cursor-pointer ${feedback === 1 ? "text-accent" : "text-text-tertiary hover:text-accent"}`}
              title={t("feedback.helpful")}
            >
              <ThumbsUp size={11} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); void handleFeedback(-1); }}
              className={`p-0.5 transition-colors cursor-pointer ${feedback === -1 ? "text-danger" : "text-text-tertiary hover:text-danger"}`}
              title={t("feedback.notHelpful")}
            >
              <ThumbsDown size={11} />
            </button>
          </span>
        )}
        {collapsed ? <ChevronDown size={14} className="text-text-tertiary" /> : <ChevronUp size={14} className="text-text-tertiary" />}
      </button>
      {!collapsed && (
        <div className="mt-2 text-sm text-text-secondary">
          {loading && !summary && (
            <div className="flex items-center gap-2 text-text-tertiary">
              <div className="w-3 h-3 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
              <span className="text-xs">{t("email.generatingSummary")}</span>
            </div>
          )}
          {summary && <p className="text-xs leading-relaxed">{summary}</p>}
        </div>
      )}
    </div>
  );
}
