import { getDb } from "./connection";
import { encryptValue, decryptValue, isEncrypted } from "@/utils/crypto";

export interface DbPgpKey {
  id: string;
  account_id: string;
  fingerprint: string;
  email: string | null;
  public_key: string;
  private_key_encrypted: string | null;
  created_at: number;
  updated_at: number;
}

export async function getPgpKeysForAccount(
  accountId: string,
): Promise<DbPgpKey[]> {
  const db = await getDb();
  return db.select<DbPgpKey[]>(
    "SELECT * FROM pgp_keys WHERE account_id = $1 ORDER BY created_at ASC",
    [accountId],
  );
}

export async function getPgpKeyByFingerprint(
  accountId: string,
  fingerprint: string,
): Promise<DbPgpKey | null> {
  const db = await getDb();
  const rows = await db.select<DbPgpKey[]>(
    "SELECT * FROM pgp_keys WHERE account_id = $1 AND fingerprint = $2 LIMIT 1",
    [accountId, fingerprint],
  );
  return rows[0] ?? null;
}

/**
 * Insert or replace a key. `privateKey` (armored or raw) is encrypted with the
 * same keychain-bound AES-256-GCM used for OAuth tokens and IMAP passwords.
 */
export async function upsertPgpKey(key: {
  accountId: string;
  fingerprint: string;
  email?: string | null;
  publicKey: string;
  privateKey?: string | null;
}): Promise<void> {
  const db = await getDb();
  const encrypted =
    key.privateKey && key.privateKey.trim().length > 0
      ? await encryptValue(key.privateKey)
      : null;
  await db.execute(
    `INSERT INTO pgp_keys (id, account_id, fingerprint, email, public_key, private_key_encrypted)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT(account_id, fingerprint) DO UPDATE SET
       email = $4, public_key = $5, private_key_encrypted = $6,
       updated_at = unixepoch()`,
    [
      crypto.randomUUID(),
      key.accountId,
      key.fingerprint,
      key.email ?? null,
      key.publicKey,
      encrypted,
    ],
  );
}

export async function deletePgpKey(
  accountId: string,
  fingerprint: string,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "DELETE FROM pgp_keys WHERE account_id = $1 AND fingerprint = $2",
    [accountId, fingerprint],
  );
}

export async function getDecryptedPrivateKey(
  accountId: string,
  fingerprint: string,
): Promise<string | null> {
  const key = await getPgpKeyByFingerprint(accountId, fingerprint);
  if (!key?.private_key_encrypted) return null;
  if (!isEncrypted(key.private_key_encrypted)) {
    return key.private_key_encrypted; // legacy plaintext row
  }
  try {
    return await decryptValue(key.private_key_encrypted);
  } catch (err) {
    console.error("[pgp] Failed to decrypt private key:", err);
    return null;
  }
}