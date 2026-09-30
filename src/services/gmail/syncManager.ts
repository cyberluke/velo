import { getGmailClient } from "./tokenManager";
import { initialSync, deltaSync, type SyncProgress } from "./sync";
import { getAccount, clearAccountHistoryId } from "../db/accounts";
import { getSetting } from "../db/settings";
import { getThreadCountForAccount, deleteAllThreadsForAccount, getThreadsWithoutUrgency } from "../db/threads";
import { deleteAllMessagesForAccount, getMessagesForThread } from "../db/messages";
import { imapInitialSync, imapDeltaSync } from "../imap/imapSync";
import { jmapInitialSync, jmapDeltaSync } from "../jmap/jmapSync";
import { createJmapClientForAccount } from "../jmap/clientFactory";
import { getJmapSyncState } from "../db/jmapSyncState";
import { clearAllFolderSyncStates } from "../db/folderSyncState";
import { ensureFreshToken } from "../oauth/oauthTokenManager";
import { batchScoreUrgency } from "../ai/aiService";
import { extractTask } from "../ai/taskExtraction";
import { insertTask, getTasksForThread } from "../db/tasks";
import { mineContactsForAllAccounts } from "../contacts/contactMining";

/** Map IMAP sync phases to the SyncProgress phases the UI understands. */
function mapImapPhase(phase: string): "labels" | "threads" | "messages" | "done" {
  if (phase === "folders") return "labels";
  if (phase === "threading" || phase === "storing_threads") return "threads";
  if (phase === "messages") return "messages";
  if (phase === "done") return "done";
  return phase as "labels" | "threads" | "messages" | "done";
}

let syncPromise: Promise<void> | null = null;
let pendingAccountIds: string[] | null = null;

export type SyncStatusCallback = (
  accountId: string,
  status: "syncing" | "done" | "error",
  progress?: SyncProgress,
  error?: string,
) => void;

let statusCallback: SyncStatusCallback | null = null;
let batchCompleteCallback: SyncBatchCompleteCallback | null = null;

/** True while a sync pass is running (used by background tasks to yield). */
export function isSyncInProgress(): boolean {
  return syncPromise !== null;
}

export interface SyncBatchResult {
  accountIds: string[];
  failedAccountIds: string[];
}

export type SyncBatchCompleteCallback = (result: SyncBatchResult) => void;

export function onSyncStatus(cb: SyncStatusCallback): () => void {
  statusCallback = cb;
  return () => {
    statusCallback = null;
  };
}

/** Subscribe to the UI-visible boundary of a sync: once per account batch. */
export function onSyncBatchComplete(cb: SyncBatchCompleteCallback): () => void {
  batchCompleteCallback = cb;
  return () => {
    batchCompleteCallback = null;
  };
}

/**
 * Run a sync for a single Gmail API account (initial or delta).
 */
async function syncGmailAccount(accountId: string): Promise<void> {
  const client = await getGmailClient(accountId);
  const account = await getAccount(accountId);

  if (!account) {
    throw new Error("Account not found");
  }

  const syncPeriodStr = await getSetting("sync_period_days");
  const syncDays = parseInt(syncPeriodStr ?? "365", 10) || 365;

  if (account.history_id) {
    // Delta sync
    try {
      await deltaSync(client, accountId, account.history_id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err ?? "");
      if (message === "HISTORY_EXPIRED") {
        // Fallback to full sync
        await initialSync(client, accountId, syncDays, (progress) => {
          statusCallback?.(accountId, "syncing", progress);
        });
      } else {
        throw err;
      }
    }
  } else {
    // First time — full initial sync
    await initialSync(client, accountId, syncDays, (progress) => {
      statusCallback?.(accountId, "syncing", progress);
    });
  }
}

/**
 * Run a sync for a single IMAP account (initial or delta).
 */
async function syncImapAccount(accountId: string): Promise<void> {
  const account = await getAccount(accountId);

  if (!account) {
    throw new Error("Account not found");
  }

  // Refresh OAuth2 token before syncing (if applicable)
  if (account.auth_method === "oauth2") {
    await ensureFreshToken(account);
  }

  const syncPeriodStr = await getSetting("sync_period_days");
  const syncDays = parseInt(syncPeriodStr ?? "365", 10) || 365;

  if (account.history_id) {
    // Delta sync — IMAP uses folder-level UID tracking
    const result = await imapDeltaSync(accountId, syncDays);

    // Recovery: if delta sync found nothing new but the DB has no threads,
    // the previous initial sync likely failed or stored data incorrectly.
    // Force a full re-sync to recover.
    if (result.messages.length === 0) {
      const threadCount = await getThreadCountForAccount(accountId);
      if (threadCount === 0) {
        console.warn(`[syncManager] IMAP delta sync returned 0 new messages and DB has 0 threads for ${accountId} — forcing full re-sync`);
        await clearAccountHistoryId(accountId);
        await clearAllFolderSyncStates(accountId);
        await imapInitialSync(accountId, syncDays, (progress) => {
          statusCallback?.(accountId, "syncing", {
            phase: mapImapPhase(progress.phase),
            current: progress.current,
            total: progress.total,
          });
        });
      }
    }
  } else {
    // First time — full initial sync
    await imapInitialSync(accountId, syncDays, (progress) => {
      statusCallback?.(accountId, "syncing", {
        phase: mapImapPhase(progress.phase),
        current: progress.current,
        total: progress.total,
      });
    });
  }
}

/**
 * Run a sync for a single JMAP account (initial or delta).
 */
async function syncJmapAccount(accountId: string): Promise<void> {
  const account = await getAccount(accountId);

  if (!account) {
    throw new Error("Account not found");
  }

  const client = await createJmapClientForAccount(account);

  const syncPeriodStr = await getSetting("sync_period_days");
  const syncDays = parseInt(syncPeriodStr ?? "365", 10) || 365;

  const emailSyncState = await getJmapSyncState(accountId, "Email");

  if (account.history_id && emailSyncState) {
    // Delta sync
    try {
      await jmapDeltaSync(client, accountId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err ?? "");
      if (message === "JMAP_STATE_EXPIRED" || message === "JMAP_NO_STATE") {
        // State too old — fall back to a full resync
        await clearAccountHistoryId(accountId);
        await jmapInitialSync(client, accountId, syncDays, (progress) => {
          statusCallback?.(accountId, "syncing", {
            phase: mapJmapPhase(progress.phase),
            current: progress.current,
            total: progress.total,
          });
        });
      } else {
        throw err;
      }
    }
  } else {
    // First time — full initial sync
    await jmapInitialSync(client, accountId, syncDays, (progress) => {
      statusCallback?.(accountId, "syncing", {
        phase: mapJmapPhase(progress.phase),
        current: progress.current,
        total: progress.total,
      });
    });
  }
}

/**
 * Map JMAP sync phases to the SyncProgress phases the UI understands.
 */
function mapJmapPhase(phase: string): "labels" | "threads" | "messages" | "done" {
  if (phase === "mailboxes") return "labels";
  if (phase === "messages") return "messages";
  if (phase === "done") return "done";
  return phase as "labels" | "threads" | "messages" | "done";
}

/**
 * Run a sync for a single account (initial or delta).
 * Routes to Gmail, IMAP or JMAP sync based on account provider.
 */
async function syncAccountInternal(accountId: string): Promise<boolean> {
  try {
    const account = await getAccount(accountId);

    if (!account) {
      throw new Error("Account not found");
    }

    statusCallback?.(accountId, "syncing");

    console.log(`[syncManager] Syncing account ${accountId} (provider=${account.provider}, history_id=${account.history_id ?? "null"})`);

    if (account.provider === "caldav") {
      // Calendar-only accounts are synchronized by the Calendar page.
      return true;
    }

    if (account.provider === "imap") {
      await syncImapAccount(accountId);
    } else if (account.provider === "jmap") {
      await syncJmapAccount(accountId);
    } else {
      await syncGmailAccount(accountId);
    }

    // Always emit "done" when an initial sync completes (clears the bar).
    // Also emit for delta syncs that fell back to initial (recovery re-sync)
    // since those emit progress via statusCallback inside syncImapAccount.
    statusCallback?.(accountId, "done");

    // Run AI post-sync processing (non-blocking — AI errors never affect sync)
    runPostSyncAi(accountId).catch((err) => {
      console.warn(`[syncManager] AI post-sync processing error for ${accountId}:`, err);
    });

    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err ?? "Unknown error");
    console.error(`[syncManager] Sync failed for account ${accountId}:`, message);
    statusCallback?.(accountId, "error", undefined, message);
    return false;
  }
}

/**
 * Run AI post-sync processing for an account: urgency scoring and auto task extraction.
 * Both features are guarded by settings and wrapped in try/catch — sync never fails due to AI errors.
 */
async function runPostSyncAi(accountId: string): Promise<void> {
  // Urgency scoring — run if enabled
  try {
    const urgencyEnabled = await getSetting("ai_urgency_enabled");
    if (urgencyEnabled === "true") {
      const threadsToScore = await getThreadsWithoutUrgency(accountId, 50);
      if (threadsToScore.length > 0) {
        const threadData = threadsToScore.map((t) => ({
          id: t.id,
          subject: t.subject ?? "",
          snippet: t.snippet ?? "",
          fromAddress: t.from_address ?? "",
        }));
        await batchScoreUrgency(accountId, threadData);
      }
    }
  } catch (e) {
    console.error("Urgency scoring failed (non-fatal):", e);
  }

  // Auto task extraction — run if enabled
  try {
    const autoTasksEnabled = await getSetting("ai_auto_tasks_enabled");
    if (autoTasksEnabled === "true") {
      // Get recent threads that don't already have tasks linked
      const recentThreads = await getThreadsWithoutUrgency(accountId, 20);
      for (const thread of recentThreads) {
        try {
          // Skip if tasks already exist for this thread
          const existingTasks = await getTasksForThread(accountId, thread.id);
          if (existingTasks.length > 0) continue;

          const messages = await getMessagesForThread(accountId, thread.id);
          if (messages.length === 0) continue;

          const extracted = await extractTask(thread.id, accountId, messages);
          await insertTask({
            accountId,
            title: extracted.title,
            description: extracted.description,
            priority: extracted.priority,
            dueDate: extracted.dueDate,
            threadId: thread.id,
            threadAccountId: accountId,
          });
        } catch {
          // Ignore per-thread failures — don't break the loop
        }
      }
    }
  } catch (e) {
    console.error("Auto task extraction failed (non-fatal):", e);
  }
}

async function runSync(accountIds: string[]): Promise<void> {
  if (syncPromise) {
    // Queue these accounts, merging with any already-pending IDs
    const existing = new Set(pendingAccountIds ?? []);
    for (const id of accountIds) existing.add(id);
    pendingAccountIds = [...existing];
    return syncPromise;
  }

  syncPromise = (async () => {
    const failedAccountIds: string[] = [];
    try {
      for (const id of accountIds) {
        if (!(await syncAccountInternal(id))) failedAccountIds.push(id);
      }
    } finally {
      syncPromise = null;
    }

    batchCompleteCallback?.({ accountIds, failedAccountIds });

    // Drain the queue — if something was queued while we were syncing, run it now
    if (pendingAccountIds) {
      const queued = pendingAccountIds;
      pendingAccountIds = null;
      await runSync(queued);
    } else {
      // Mine newly synced messages into contacts for recipient autocomplete.
      // Runs only once no sync is in flight and yields if another one starts,
      // so mining never competes with sync for the write lock.
      mineContactsForAllAccounts({ shouldYield: () => syncPromise !== null }).catch((err) => {
        console.warn("[syncManager] Contact mining error:", err);
      });
    }
  })();

  return syncPromise;
}

/**
 * Run sync for a single account, queuing if already running.
 */
export async function syncAccount(accountId: string): Promise<void> {
  return runSync([accountId]);
}

/**
 * Catch up once when the app starts. Subsequent Gmail and IMAP work is driven
 * by the push relay and IDLE notifications, with manual refresh as fallback.
 */
export function startInitialSync(accountIds: string[]): void {
  void runSync(accountIds);
}

/**
 * Trigger an immediate sync for all provided accounts.
 * Waits for completion even if another push or manual sync is in progress.
 */
export async function triggerSync(accountIds: string[]): Promise<void> {
  await runSync(accountIds);
}

/**
 * Clear history IDs and perform a full re-sync for all provided accounts.
 * This re-downloads all threads from scratch.
 */
export async function forceFullSync(accountIds: string[]): Promise<void> {
  for (const id of accountIds) {
    await clearAccountHistoryId(id);
  }
  await runSync(accountIds);
}

/**
 * Delete all local data for a single account and re-sync from scratch.
 * Removes all threads, messages, history ID, and IMAP folder sync states,
 * then runs a fresh initial sync.
 */
export async function resyncAccount(accountId: string): Promise<void> {
  await deleteAllThreadsForAccount(accountId);
  await deleteAllMessagesForAccount(accountId);
  await clearAccountHistoryId(accountId);
  await clearAllFolderSyncStates(accountId);
  await runSync([accountId]);
}
