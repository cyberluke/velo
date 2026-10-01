import { getAllAccounts } from "@/services/db/accounts";
import { useAccountStore, type Account } from "@/stores/accountStore";
import { initializeClients, getGmailClient } from "@/services/gmail/tokenManager";
import { syncAccount } from "@/services/gmail/syncManager";
import { fetchSendAsAliases } from "@/services/gmail/sendAs";

/** Map DB account rows into the store shape (shared by every load path). */
export function mapDbAccountsToStore(dbAccounts: Awaited<ReturnType<typeof getAllAccounts>>): Account[] {
  return dbAccounts.map((a) => ({
    id: a.id,
    email: a.email,
    displayName: a.display_name,
    avatarUrl: a.avatar_url,
    isActive: a.is_active === 1,
    provider: a.provider,
    calendarProvider: a.calendar_provider,
    color: a.color,
    accessRole: a.access_role ?? "owner",
  }));
}

/** Reload the account list into the store from the database. */
export async function reloadAccountsIntoStore(): Promise<void> {
  const dbAccounts = await getAllAccounts();
  useAccountStore.getState().setAccounts(mapDbAccountsToStore(dbAccounts));
}

/**
 * Bring the app up to date after an account was added.
 *
 * Reloads accounts into the store, re-initializes provider clients, kicks off
 * an immediate sync for the new mail account. Shared
 * by every entry point that can add an account (sidebar switcher, settings).
 */
export async function refreshAfterAccountAdded(): Promise<void> {
  await reloadAccountsIntoStore();

  // Re-initialize clients for the new account
  await initializeClients();

  const mapped = useAccountStore.getState().accounts;
  const newest = mapped[mapped.length - 1];
  if (newest) {
    if (newest.provider !== "caldav") {
      // Calendar-only accounts wait until the Calendar page is opened.
      void syncAccount(newest.id);
    }

    // Fetch send-as aliases in the background (non-blocking, skip CalDAV-only accounts)
    if (newest.provider !== "caldav") {
      getGmailClient(newest.id)
        .then((client) => fetchSendAsAliases(client, newest.id))
        .catch((err) =>
          console.warn(`Failed to fetch send-as aliases for new account:`, err),
        );
    }
  }
}
