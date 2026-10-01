import * as openpgp from "openpgp";
import {
  upsertPgpKey,
  deletePgpKey,
  getPgpKeysForAccount,
  getDecryptedPrivateKey,
  type DbPgpKey,
} from "@/services/db/pgpKeys";
import { logAudit } from "@/services/db/auditLog";

export interface PgpKeySummary {
  fingerprint: string;
  email: string | null;
  createdAt: number;
  hasPrivate: boolean;
}

export interface PgpDecryptResult {
  success: boolean;
  plaintext: string;
  signedBy: string | null;
  verified: boolean;
  error?: string;
}

/**
 * PGP wrapper over the pure-JS OpenPGP.js library. Keys live only in the
 * local SQLite database (private keys encrypted with the keychain-bound
 * AES key); nothing ever leaves the machine except the mail itself.
 *
 * The library is loaded lazily so the ~1.7MB wasm/JS only enters the bundle
 * when a PGP feature is actually used.
 */
async function load(): Promise<typeof openpgp> {
  return import("openpgp");
}

/** Generate a brand-new keypair for an account and store both halves. */
export async function generatePgpKey(
  accountId: string,
  name: string,
  email: string,
  passphrase: string,
): Promise<PgpKeySummary> {
  const lib = await load();
  const { privateKey, publicKey } = await lib.generateKey({
    type: "curve25519",
    userIDs: [{ name, email }],
    passphrase,
    format: "armored",
  });
  // Unlock now and re-armor without a passphrase: the private half is already
  // encrypted at rest with the keychain-bound AES key, so a second passphrase
  // would only force the user to type it on every decrypt.
  const key = await lib.readPrivateKey({ armoredKey: privateKey });
  const unlocked = await lib.decryptKey({ privateKey: key, passphrase });
  const unlockedArmor = unlocked.armor();
  const fingerprint = unlocked.getFingerprint();
  await upsertPgpKey({
    accountId,
    fingerprint,
    email,
    publicKey,
    privateKey: unlockedArmor,
  });
  await logAudit("pgp_key_added", { email, fingerprint }, accountId);
  return {
    fingerprint,
    email,
    createdAt: Date.now(),
    hasPrivate: true,
  };
}

/** Import an armored public or private key. */
export async function importPgpKey(
  accountId: string,
  armored: string,
  passphrase?: string,
): Promise<PgpKeySummary> {
  const lib = await load();
  const key = await lib.readKey({ armoredKey: armored.trim() });
  const fingerprint = key.getFingerprint();
  const isPrivate = key.isPrivate();
  let privateKey: string | null = null;
  if (isPrivate) {
    // Unlock (validating the passphrase) and re-armor without one — the DB
    // layer already encrypts the stored value with the keychain AES key.
    let unlocked = key as openpgp.PrivateKey;
    try {
      unlocked = await lib.decryptKey({
        privateKey: unlocked,
        passphrase: passphrase ?? "",
      });
    } catch (err) {
      // "Key packet is already decrypted" — an unlocked key imported as-is.
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("already decrypted")) throw err;
    }
    privateKey = unlocked.armor();
  }
  const emails = key.getUserIDs();
  await upsertPgpKey({
    accountId,
    fingerprint,
    email: emails[0] ?? null,
    publicKey: key.toPublic().armor(),
    privateKey,
  });
  await logAudit("pgp_key_added", { fingerprint, imported: true }, accountId);
  return {
    fingerprint,
    email: emails[0] ?? null,
    createdAt: Date.now(),
    hasPrivate: isPrivate,
  };
}

export async function removePgpKey(
  accountId: string,
  fingerprint: string,
): Promise<void> {
  await deletePgpKey(accountId, fingerprint);
  await logAudit("pgp_key_removed", { fingerprint }, accountId);
}

export async function listPgpKeys(accountId: string): Promise<PgpKeySummary[]> {
  const keys = await getPgpKeysForAccount(accountId);
  return keys.map((key) => ({
    fingerprint: key.fingerprint,
    email: key.email,
    createdAt: key.created_at,
    hasPrivate: !!key.private_key_encrypted,
  }));
}

/**
 * Encrypt a plaintext (or HTML) message for the given recipients' public keys.
 * Optionally signs with the account's own private key. Returns an armored
 * OpenPGP message ready to paste into a body.
 */
export async function encryptPgp(
  accountId: string,
  plaintext: string,
  recipientEmails: string[],
  signWithFingerprint?: string | null,
): Promise<string> {
  const lib = await load();
  const keys = await getPgpKeysForAccount(accountId);

  // Resolve a public key per recipient email (fall back to any stored key).
  const recipientKeys: openpgp.Key[] = [];
  for (const email of recipientEmails) {
    const needle = email.toLowerCase();
    const match = keys.find((k) => k.email?.toLowerCase() === needle);
    const pick = match ?? keys[0];
    if (pick) {
      const key = await lib.readKey({ armoredKey: pick.public_key });
      recipientKeys.push(key);
    }
  }
  if (recipientKeys.length === 0) {
    throw new Error("No recipient public key found");
  }

  const signingKey = signWithFingerprint
    ? await getDecryptedPrivateKey(accountId, signWithFingerprint)
    : null;
  let signingKeys: openpgp.PrivateKey[] = [];
  if (signingKey) {
    const privateKey = await lib.readPrivateKey({ armoredKey: signingKey });
    signingKeys = [privateKey];
  }

  const encrypted = await lib.encrypt({
    message: await lib.createMessage({ text: plaintext }),
    encryptionKeys: recipientKeys,
    signingKeys: signingKeys.length ? signingKeys : undefined,
    format: "armored",
  });
  return encrypted as string;
}

/**
 * Decrypt an armored PGP message using the account's private key, verifying
 * any signature. Returns plaintext plus signer info.
 */
export async function decryptPgp(
  accountId: string,
  armored: string,
): Promise<PgpDecryptResult> {
  const lib = await load();
  const keys = await getPgpKeysForAccount(accountId);
  const privateKeyArmored = keys[0]?.private_key_encrypted
    ? await getDecryptedPrivateKey(accountId, keys[0].fingerprint)
    : null;
  if (!privateKeyArmored) {
    return {
      success: false,
      plaintext: "",
      signedBy: null,
      verified: false,
      error: "No private key available for this account",
    };
  }
  try {
    const message = await lib.readMessage({ armoredMessage: armored.trim() });
    const privateKey = await lib.readPrivateKey({ armoredKey: privateKeyArmored });
    const { data, signatures } = await lib.decrypt({
      message,
      decryptionKeys: privateKey,
    });
    let verified = false;
    let signedBy: string | null = null;
    const firstSignature = signatures?.[0];
    if (firstSignature) {
      // openpgp's `verified` is a promise that rejects on an invalid signature.
      try {
        await firstSignature.verified;
        verified = true;
        signedBy = firstSignature.keyID?.toHex() ?? null;
      } catch {
        verified = false;
      }
    }
    return { success: true, plaintext: data as string, signedBy, verified };
  } catch (err) {
    return {
      success: false,
      plaintext: "",
      signedBy: null,
      verified: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Sign a plaintext and return an armored detached signature. */
export async function signPgp(
  accountId: string,
  plaintext: string,
  fingerprint: string,
): Promise<string> {
  const lib = await load();
  const privateKeyArmored = await getDecryptedPrivateKey(accountId, fingerprint);
  if (!privateKeyArmored) throw new Error("Private key not available");
  const privateKey = await lib.readPrivateKey({ armoredKey: privateKeyArmored });
  const signed = await lib.sign({
    message: await lib.createMessage({ text: plaintext }),
    signingKeys: privateKey,
    format: "armored",
  });
  return signed as string;
}

export type { DbPgpKey };