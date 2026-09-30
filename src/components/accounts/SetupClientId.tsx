import { useState } from "react";
import { ExternalLink, Copy, Check } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { setSetting, setSecureSetting } from "@/services/db/settings";
import { validateClientId, validateClientSecret } from "@/services/gmail/clientCredentials";
import { Modal } from "@/components/ui/Modal";
import { useI18n } from "@/i18n";

const GMAIL_API_URL = "https://console.cloud.google.com/apis/library/gmail.googleapis.com";
const OAUTH_CREDENTIALS_URL = "https://console.cloud.google.com/apis/credentials/oauthclient";
const REDIRECT_URI = "http://127.0.0.1:17248";

interface SetupClientIdProps {
  onComplete: () => void;
  onCancel: () => void;
  /** Stacking context — raise it when opened from another overlay */
  zIndex?: string;
}

export function SetupClientId({ onComplete, onCancel, zIndex }: SetupClientIdProps) {
  const { t } = useI18n();
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  // Only complain once there is something to complain about
  const idError = clientId.trim() ? validateClientId(clientId) : null;
  const secretError = clientSecret.trim() ? validateClientSecret(clientSecret) : null;
  const canSave = !!clientId.trim() && !!clientSecret.trim() && !idError && !secretError;

  const handleSave = async () => {
    const trimmedId = clientId.trim();
    const trimmedSecret = clientSecret.trim();
    if (!canSave) return;

    setSaving(true);
    try {
      await setSetting("google_client_id", trimmedId);
      await setSecureSetting("google_client_secret", trimmedSecret);
      onComplete();
    } catch {
      setSaving(false);
    }
  };

  const handleCopyUri = async () => {
    try {
      await navigator.clipboard.writeText(REDIRECT_URI);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — the URI is visible on screen anyway
    }
  };

  return (
    <Modal
      isOpen={true}
      onClose={onCancel}
      title={t("setupClientId.title")}
      width="w-full max-w-lg"
      zIndex={zIndex}
    >
      <div className="p-4 space-y-5">
        <p className="text-text-secondary text-sm">
          {t("setupClientId.description")}
        </p>

        {/* Step 1 — Enable the Gmail API */}
        <div className="rounded-lg border border-border-primary p-4">
          <h3 className="text-sm font-medium text-text-primary mb-1">
            {t("setupClientId.step1Title")}
          </h3>
          <p className="text-xs text-text-tertiary mb-3">
            {t("setupClientId.step1Description")}
          </p>
          <button
            onClick={() => openUrl(GMAIL_API_URL)}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
          >
            <ExternalLink size={14} />
            {t("setupClientId.step1Button")}
          </button>
        </div>

        {/* Step 2 — Create OAuth credentials + redirect URI */}
        <div className="rounded-lg border border-border-primary p-4">
          <h3 className="text-sm font-medium text-text-primary mb-1">
            {t("setupClientId.step2Title")}
          </h3>
          <p className="text-xs text-text-tertiary mb-3">
            {t("setupClientId.step2Description")}
          </p>
          <button
            onClick={() => openUrl(OAUTH_CREDENTIALS_URL)}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
          >
            <ExternalLink size={14} />
            {t("setupClientId.step2Button")}
          </button>
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <span className="text-xs text-text-tertiary">
              {t("setupClientId.step2RedirectUri")}
            </span>
            <code className="bg-bg-tertiary px-2 py-0.5 rounded text-xs font-mono">
              {REDIRECT_URI}
            </code>
            <button
              onClick={handleCopyUri}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-xs text-accent hover:text-accent-hover transition-colors"
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? t("setupClientId.step2Copied") : t("setupClientId.step2CopyUri")}
            </button>
          </div>
        </div>

        {/* Step 3 — Paste credentials */}
        <div className="rounded-lg border border-border-primary p-4">
          <h3 className="text-sm font-medium text-text-primary mb-1">
            {t("setupClientId.step3Title")}
          </h3>
          <p className="text-xs text-text-tertiary mb-3">
            {t("setupClientId.step3Description")}
          </p>

          <input
            type="text"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder={t("setupClientId.clientIdPlaceholder")}
            className={`w-full px-3 py-2 bg-bg-secondary border rounded-lg text-sm outline-none focus:border-accent ${
              idError ? "border-danger mb-1" : "border-border-primary mb-3"
            }`}
          />
          {idError && <p className="text-danger text-xs mb-3">{idError}</p>}

          <input
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder={t("setupClientId.clientSecretPlaceholder")}
            className={`w-full px-3 py-2 bg-bg-secondary border rounded-lg text-sm mb-1 outline-none focus:border-accent ${
              secretError ? "border-danger" : "border-border-primary"
            }`}
          />
          <p className={`text-xs ${secretError ? "text-danger" : "text-text-tertiary"}`}>
            {secretError ?? t("setupClientId.clientSecretNote")}
          </p>
        </div>

        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave || saving}
            className="px-4 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? t("common.saving") : t("setupClientId.saveAndContinue")}
          </button>
        </div>
      </div>
    </Modal>
  );
}