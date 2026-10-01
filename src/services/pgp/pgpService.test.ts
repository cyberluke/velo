// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { generatePgpKey, encryptPgp, decryptPgp, importPgpKey } from "./pgpService";
import {
  upsertPgpKey,
  getPgpKeysForAccount,
  getDecryptedPrivateKey,
  deletePgpKey,
} from "@/services/db/pgpKeys";

vi.mock("@/services/db/pgpKeys", () => ({
  upsertPgpKey: vi.fn(),
  getPgpKeysForAccount: vi.fn(),
  getDecryptedPrivateKey: vi.fn(),
  deletePgpKey: vi.fn(),
}));
vi.mock("@/services/db/auditLog", () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}));

const mockUpsert = upsertPgpKey as unknown as ReturnType<typeof vi.fn>;
const mockList = getPgpKeysForAccount as unknown as ReturnType<typeof vi.fn>;
const mockPrivate = getDecryptedPrivateKey as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetAllMocks();
});

describe("pgpService roundtrip", () => {
  it("generates a key, encrypts for it, and decrypts with it (no network, pure openpgp)", async () => {
    // Step 1: generate a keypair (real openpgp, in-memory)
    const summary = await generatePgpKey("acc-1", "Alice", "alice@example.com", "test-pass");
    expect(summary.fingerprint).toHaveLength(40); // curve25519 → 40 hex chars
    expect(summary.hasPrivate).toBe(true);

    const stored = mockUpsert.mock.calls[0]![0] as {
      accountId: string;
      fingerprint: string;
      email: string;
      publicKey: string;
      privateKey: string;
    };
    expect(stored.publicKey).toContain("BEGIN PGP");
    expect(stored.privateKey).toContain("BEGIN PGP PRIVATE KEY");

    // Step 2: simulate the DB returning the stored key for encryption
    mockList.mockResolvedValue([
      {
        account_id: "acc-1",
        fingerprint: summary.fingerprint,
        email: "alice@example.com",
        public_key: stored.publicKey,
        private_key_encrypted: "enc:" + stored.privateKey,
      },
    ]);

    // Step 3: encrypt for alice@example.com
    const armored = await encryptPgp("acc-1", "Hello secret world", ["alice@example.com"]);
    expect(armored).toContain("BEGIN PGP MESSAGE");

    // Step 4: decrypt with the private key
    mockPrivate.mockResolvedValue(stored.privateKey);
    const result = await decryptPgp("acc-1", armored);
    expect(result.success).toBe(true);
    expect(result.plaintext).toBe("Hello secret world");
  });

  it("imports an armored private key and reports it as private", async () => {
    await generatePgpKey("acc-2", "Bob", "bob@example.com", "bob-pass");
    const stored = mockUpsert.mock.calls[0]![0] as {
      privateKey: string;
    };
    const summary = await importPgpKey("acc-2", stored.privateKey, "bob-pass");
    expect(summary.hasPrivate).toBe(true);
    // Re-imported key re-armors without a passphrase but must remain usable
    expect(mockUpsert.mock.calls[1]![0].privateKey).toContain("BEGIN PGP PRIVATE KEY BLOCK");
  });

  it("rejects decrypt with a mismatched key", async () => {
    const alice = await generatePgpKey("acc-3", "Alice", "alice@example.com", "p");
    const stored = mockUpsert.mock.calls[0]![0] as { publicKey: string };
    mockList.mockResolvedValue([
      {
        account_id: "acc-3",
        fingerprint: alice.fingerprint,
        email: "alice@example.com",
        public_key: stored.publicKey,
        private_key_encrypted: null,
      },
    ]);
    const armored = await encryptPgp("acc-3", "secret", ["alice@example.com"]);
    // Wrong (absent) private key → failure
    mockPrivate.mockResolvedValue(null);
    const result = await decryptPgp("acc-3", armored);
    expect(result.success).toBe(false);
  });

  it("removes a key", async () => {
    await deletePgpKey("acc-1", "fp");
    expect(deletePgpKey).toHaveBeenCalledWith("acc-1", "fp");
  });
});