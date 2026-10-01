import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useI18n } from "@/i18n";

interface SpamBannerProps {
  onNotSpam: () => void;
  restoring?: boolean;
}

export function SpamBanner({ onNotSpam, restoring = false }: SpamBannerProps) {
  const { t } = useI18n();
  return (
    <div
      className="flex items-center gap-3 border-b border-danger/30 bg-danger/10 px-6 py-3"
      role="status"
    >
      <AlertTriangle size={18} className="shrink-0 text-danger" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-danger">{t("email.thisIsSpam")}</p>
        <p className="mt-0.5 text-xs text-text-secondary">
          {t("email.spamFolderCaution")}
        </p>
      </div>
      <Button
        type="button"
        variant="secondary"
        onClick={onNotSpam}
        disabled={restoring}
        className="shrink-0 border border-danger/30 bg-bg-primary text-danger hover:bg-danger/5 hover:text-danger"
      >
        {restoring ? t("email.moving") : t("email.notSpam")}
      </Button>
    </div>
  );
}