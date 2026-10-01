import { isAiAvailable } from "./providerManager";
import { categorizeThreads } from "./aiService";
import { getSetting } from "@/services/db/settings";
import { notifyAiEvent } from "@/services/notifications/notificationManager";
import {
  getCategoriesForThreads,
  getRecentRuleCategorizedThreadIds,
  setThreadCategoriesBatch,
} from "@/services/db/threadCategories";

export async function categorizeNewThreads(accountId: string): Promise<void> {
  try {
    // Check if AI and auto-categorize are enabled
    const aiAvail = await isAiAvailable();
    if (!aiAvail) return;

    const autoCat = await getSetting("ai_auto_categorize");
    if (autoCat === "false") return;

    // Get recently rule-categorized inbox threads (AI refines, not replaces)
    const threads = await getRecentRuleCategorizedThreadIds(accountId, 20);
    if (threads.length === 0) return;

    // Categorize via AI (refines rule-based results)
    const categories = await categorizeThreads(
      threads.map((t) => ({
        id: t.id,
        subject: t.subject ?? "",
        snippet: t.snippet ?? "",
        fromAddress: t.fromAddress ?? "",
      })),
    );

    if (categories.size === 0) return;

    // The same recent inbox threads are re-classified on every sync, so a
    // notification must only fire when the pass actually moved something —
    // otherwise every sync announces "sorted N threads" that did not change
    const before = await getCategoriesForThreads(accountId, [...categories.keys()]);
    const changedCount = [...categories.entries()].filter(
      ([threadId, category]) => before.get(threadId) !== category,
    ).length;

    // Store results (setThreadCategoriesBatch respects manual overrides)
    await setThreadCategoriesBatch(accountId, categories);

    // One announcement for the whole pass — an AI processing event the user
    // would otherwise never see, batched so a busy inbox stays a single ping
    if (changedCount > 0) {
      notifyAiEvent(
        "AI categorization",
        `Recategorized ${changedCount} email thread${changedCount === 1 ? "" : "s"} into inbox categories`,
      );
    }
  } catch (err) {
    // Non-blocking — log and continue
    console.error("Auto-categorization failed:", err);
  }
}
