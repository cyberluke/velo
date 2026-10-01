import { getDb } from "@/services/db/connection";

export interface FollowThroughItem {
  threadId: string;
  accountId: string;
  subject: string | null;
  peerName: string | null;
  peerAddress: string | null;
  lastMessageAt: number;
  daysWaiting: number;
  messageCount: number;
  isStarred: number;
  hasTask: boolean;
}

/**
 * Threads where the ball is in the user's court: the last message came from
 * the peer and is older than `minDays` — with no user reply since. Newsletters
 * and promotions are excluded (they never expect a reply).
 *
 * `ownAddresses` = the account's own addresses (email + send-as aliases),
 * so a thread the user only sent into (peer replies pending) is not counted
 * as needing a reply.
 */
export async function getFollowThroughItems(
  accountIds: string[],
  ownAddressesByAccount: Record<string, Set<string>>,
  minDays = 2,
): Promise<FollowThroughItem[]> {
  if (accountIds.length === 0) return [];
  const db = await getDb();
  const placeholders = accountIds.map((_, i) => `$${i + 1}`).join(",");
  const cutoff = Math.floor(Date.now() / 1000) - minDays * 86400;

  const rows = await db.select<
    Array<{
      account_id: string;
      thread_id: string;
      subject: string | null;
      peer_name: string | null;
      peer_address: string | null;
      last_message_at: number | null;
      message_count: number | null;
      is_starred: number | null;
    }>
  >(
    `SELECT t.account_id, t.id AS thread_id, t.subject,
            m.from_name AS peer_name, m.from_address AS peer_address,
            m.date AS last_message_at, t.message_count, t.is_starred
     FROM threads t
     JOIN (
       SELECT account_id, thread_id, from_name, from_address, date,
              ROW_NUMBER() OVER (PARTITION BY account_id, thread_id ORDER BY date DESC) AS rn
       FROM messages
     ) m ON m.account_id = t.account_id AND m.thread_id = t.id AND m.rn = 1
     WHERE t.account_id IN (${placeholders})
       AND t.merged_into IS NULL
       AND t.last_message_at < $2
       AND NOT EXISTS (
         SELECT 1 FROM thread_labels tl
         WHERE tl.account_id = t.account_id AND tl.thread_id = t.id
           AND tl.label_id IN ('SPAM', 'TRASH', 'DRAFT', 'SENT')
       )
       AND NOT EXISTS (
         SELECT 1 FROM thread_labels tl2
         WHERE tl2.account_id = t.account_id AND tl2.thread_id = t.id
           AND tl2.label_id IN ('Newsletters', 'Promotions', 'Updates')
       )
     ORDER BY m.date DESC
     LIMIT 100`,
    [...accountIds, cutoff],
  );

  const items: FollowThroughItem[] = [];
  for (const row of rows) {
    const own = ownAddressesByAccount[row.account_id];
    const from = (row.peer_address ?? "").toLowerCase();
    if (own?.has(from)) continue; // last message was the user's own — nothing to answer
    if (!row.last_message_at) continue;
    const hasTaskRows = await db.select<{ id: string }[]>(
      "SELECT id FROM tasks WHERE thread_account_id = $1 AND thread_id = $2 AND is_completed = 0 LIMIT 1",
      [row.account_id, row.thread_id],
    );
    items.push({
      threadId: row.thread_id,
      accountId: row.account_id,
      subject: row.subject,
      peerName: row.peer_name,
      peerAddress: row.peer_address,
      lastMessageAt: row.last_message_at,
      daysWaiting: Math.max(
        0,
        Math.floor((Date.now() / 1000 - row.last_message_at) / 86400),
      ),
      messageCount: row.message_count ?? 0,
      isStarred: row.is_starred ?? 0,
      hasTask: hasTaskRows.length > 0,
    });
  }
  return items;
}

/**
 * The count shown in the sidebar badge: how many conversations are waiting on
 * the user for 2+ days. Cheap aggregate of the full list.
 */
export async function getFollowThroughCount(
  accountIds: string[],
  ownAddressesByAccount: Record<string, Set<string>>,
  minDays = 2,
): Promise<number> {
  return (await getFollowThroughItems(accountIds, ownAddressesByAccount, minDays)).length;
}