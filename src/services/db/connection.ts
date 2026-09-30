import Database from "@tauri-apps/plugin-sql";

let db: Database | null = null;

export async function getDb(): Promise<Database> {
  if (!db) {
    // Dev uses its own database file so a running installed build (same
    // bundle identifier, same data directory) can never lock it — two
    // processes on one SQLite file race on every write. Copy the release
    // velo.db* files to velo-dev.db* once (apps closed) to develop against
    // real data: stored tokens still decrypt because the keychain service
    // name is hardcoded, not derived from the database path.
    const dbName = import.meta.env.DEV ? "sqlite:velo-dev.db" : "sqlite:velo.db";
    db = await Database.load(dbName);
    // WAL + busy timeout + synchronous: even the isolated dev file can be
    // touched by a second dev instance, and SQLite aborts with "database is
    // locked" the moment a writer collides. WAL keeps readers concurrent
    // with the single writer; busy_timeout makes a writer wait out a brief
    // lock instead of failing instantly. journal_mode is persisted in the
    // database file, so it applies to every pooled connection; busy_timeout
    // and synchronous are per-connection and best-effort (sqlx already
    // defaults every connection to a 5s busy_timeout). All non-fatal if
    // unsupported.
    try {
      await db.execute("PRAGMA journal_mode=WAL");
    } catch {
      // pragma unsupported — nothing to do
    }
    try {
      await db.execute("PRAGMA busy_timeout=15000");
    } catch {
      // pragma unsupported — nothing to do
    }
    try {
      await db.execute("PRAGMA synchronous=NORMAL");
    } catch {
      // pragma unsupported — nothing to do
    }
  }
  return db;
}

/**
 * Build a dynamic SQL UPDATE statement from a set of field updates.
 * Returns null if no fields to update.
 */
export function buildDynamicUpdate(
  table: string,
  idColumn: string,
  id: unknown,
  fields: [string, unknown][],
): { sql: string; params: unknown[] } | null {
  if (fields.length === 0) return null;

  const sets: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  for (const [column, value] of fields) {
    sets.push(`${column} = $${idx++}`);
    params.push(value);
  }

  params.push(id);
  return {
    sql: `UPDATE ${table} SET ${sets.join(", ")} WHERE ${idColumn} = $${idx}`,
    params,
  };
}

/**
 * Simple async mutex to prevent concurrent SQLite transactions.
 * SQLite only supports one writer at a time; overlapping BEGIN/COMMIT/ROLLBACK
 * on the same connection causes "cannot start a transaction within a transaction"
 * or "database is locked" errors.
 */
let txQueue: Promise<void> = Promise.resolve();

export async function withTransaction(fn: (db: Database) => Promise<void>): Promise<void> {
  // Queue this transaction behind any currently-running one.
  // This serialises all transactions without blocking non-transactional reads.
  const prev = txQueue;
  let resolve!: () => void;
  txQueue = new Promise<void>((r) => {
    resolve = r;
  });

  try {
    await prev; // wait for previous transaction to finish
  } catch {
    // previous transaction errored — that's fine, we can still proceed
  }

  const database = await getDb();
  try {
    // Note: Do NOT use explicit BEGIN/COMMIT here. tauri-plugin-sql maintains a 
    // connection pool in Rust. Executing raw transaction statements can cause pool 
    // deadlocks if subsequent queries check out a different connection.
    // The JS `txQueue` guarantees sequential execution of this block.
    await fn(database);
  } finally {
    resolve(); // always unblock the next queued transaction
  }
}

/**
 * Execute a SELECT query and return the first result or null.
 */
export async function selectFirstBy<T>(
  query: string,
  params: unknown[] = [],
): Promise<T | null> {
  const db = await getDb();
  const rows = await db.select<T[]>(query, params);
  return rows[0] ?? null;
}

/**
 * Execute a COUNT(*) query and return whether any rows exist.
 */
export async function existsBy(
  query: string,
  params: unknown[] = [],
): Promise<boolean> {
  const db = await getDb();
  const rows = await db.select<{ count: number }[]>(query, params);
  return (rows[0]?.count ?? 0) > 0;
}

/**
 * Convert a boolean to SQLite integer (0 or 1).
 */
export function boolToInt(value: boolean | undefined | null): number {
  return value ? 1 : 0;
}
