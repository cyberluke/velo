import { useState, useEffect, useCallback } from "react";
import { KeyRound, Trash2, Plus, KeySquare } from "lucide-react";
import {
  listPgpKeys,
  generatePgpKey,
  importPgpKey,
  removePgpKey,
  type PgpKeySummary,
} from "@/services/pgp/pgpService";
import { useAccountStore } from "@/stores/accountStore";
import { notify, reportError } from "@/stores/toastStore";
import { useI18n } from "@/i18n";

/**
 * PGP key management per account. Keys are generated or imported here and
 * stay local (private halves encrypted in SQLite). Reading-pane decryption
 * and composer encryption use the same store.
 */
export function PgpSettings() {
  const { t } = useI18n();
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const [keys, setKeys] = useState<PgpKeySummary[]>([]);
  const [showImport, setShowImport] = useState(false);
  const [importArmor, setImportArmor] = useState("");
  const [importPassphrase, setImportPassphrase] = useState("");
  const [showGenerate, setShowGenerate] = useState(false);
  const [genName, setGenName] = useState("");
  const [genEmail, setGenEmail] = useState("");
  const [genPassphrase, setGenPassphrase] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!activeAccountId) return;
    try {
      setKeys(await listPgpKeys(activeAccountId));
    } catch (err) {
      console.error("Failed to list PGP keys:", err);
    }
  }, [activeAccountId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!activeAccountId) return null;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      await load();
    } catch (err) {
      reportError(t("pgp.decryptFailed"), err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-text-tertiary">{t("pgp.desc")}</p>

      {keys.length === 0 && (
        <p className="text-xs text-text-secondary bg-bg-tertiary rounded-md px-3 py-2">
          {t("pgp.noKeys")}
        </p>
      )}

      {keys.map((key) => (
        <div
          key={key.fingerprint}
          className="flex items-center justify-between gap-2 py-1.5 px-3 bg-bg-secondary rounded-md"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-xs text-text-primary">
              <KeyRound size={11} className="text-accent shrink-0" />
              <span className="truncate">{key.email ?? t("pgp.selectKey")}</span>
            </div>
            <div className="text-[0.625rem] text-text-tertiary font-mono truncate">
              {key.fingerprint.slice(0, 32)}…
              {key.hasPrivate ? " (private)" : " (public)"}
            </div>
          </div>
          <button
            onClick={() =>
              run(async () => {
                await removePgpKey(activeAccountId, key.fingerprint);
                notify("success", t("pgp.keyRemoved"));
              })
            }
            disabled={busy}
            className="shrink-0 p-1 text-text-tertiary hover:text-danger transition-colors disabled:opacity-50"
            title={t("settings.remove")}
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}

      <div className="flex gap-2">
        <button
          onClick={() => {
            setShowImport((v) => !v);
            setShowGenerate(false);
          }}
          className="flex items-center gap-1 text-xs text-accent hover:text-accent-hover transition-colors"
        >
          <KeySquare size={12} />
          {t("pgp.addKey")}
        </button>
        <button
          onClick={() => {
            setShowGenerate((v) => !v);
            setShowImport(false);
          }}
          className="flex items-center gap-1 text-xs text-accent hover:text-accent-hover transition-colors"
        >
          <Plus size={12} />
          {t("pgp.generateKey")}
        </button>
      </div>

      {showImport && (
        <div className="border border-border-primary rounded-md p-3 space-y-2">
          <textarea
            value={importArmor}
            onChange={(e) => setImportArmor(e.target.value)}
            placeholder={t("pgp.importPaste")}
            rows={4}
            className="w-full px-2.5 py-1.5 bg-bg-tertiary border border-border-primary rounded-md text-xs text-text-primary outline-none focus:border-accent font-mono"
          />
          <input
            type="password"
            value={importPassphrase}
            onChange={(e) => setImportPassphrase(e.target.value)}
            placeholder={t("pgp.generatePassphrase")}
            className="w-full px-2.5 py-1.5 bg-bg-tertiary border border-border-primary rounded-md text-xs text-text-primary outline-none focus:border-accent"
          />
          <button
            onClick={() =>
              run(async () => {
                await importPgpKey(activeAccountId, importArmor, importPassphrase);
                setImportArmor("");
                setImportPassphrase("");
                setShowImport(false);
                notify("success", t("pgp.keyAdded"));
              })
            }
            disabled={busy || !importArmor.trim()}
            className="px-3 py-1.5 text-xs font-medium text-on-accent bg-accent hover:bg-accent-hover rounded-md transition-colors disabled:opacity-50"
          >
            {busy ? t("pgp.importRunning") : t("pgp.addKey")}
          </button>
        </div>
      )}

      {showGenerate && (
        <div className="border border-border-primary rounded-md p-3 space-y-2">
          <input
            value={genName}
            onChange={(e) => setGenName(e.target.value)}
            placeholder={t("pgp.generateName")}
            className="w-full px-2.5 py-1.5 bg-bg-tertiary border border-border-primary rounded-md text-xs text-text-primary outline-none focus:border-accent"
          />
          <input
            type="email"
            value={genEmail}
            onChange={(e) => setGenEmail(e.target.value)}
            placeholder={t("pgp.generateEmail")}
            className="w-full px-2.5 py-1.5 bg-bg-tertiary border border-border-primary rounded-md text-xs text-text-primary outline-none focus:border-accent"
          />
          <input
            type="password"
            value={genPassphrase}
            onChange={(e) => setGenPassphrase(e.target.value)}
            placeholder={t("pgp.generatePassphrase")}
            className="w-full px-2.5 py-1.5 bg-bg-tertiary border border-border-primary rounded-md text-xs text-text-primary outline-none focus:border-accent"
          />
          <button
            onClick={() =>
              run(async () => {
                await generatePgpKey(activeAccountId, genName.trim(), genEmail.trim(), genPassphrase);
                setShowGenerate(false);
                setGenName("");
                setGenEmail("");
                setGenPassphrase("");
                notify("success", t("pgp.keyAdded"));
              })
            }
            disabled={busy || !genName.trim() || !genEmail.trim() || !genPassphrase}
            className="px-3 py-1.5 text-xs font-medium text-on-accent bg-accent hover:bg-accent-hover rounded-md transition-colors disabled:opacity-50"
          >
            {busy ? t("pgp.generateRunning") : t("pgp.generateKey")}
          </button>
        </div>
      )}
    </div>
  );
}