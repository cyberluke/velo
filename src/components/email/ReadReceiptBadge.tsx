import { CheckCheck, Hourglass } from "lucide-react";
import { formatFullDate } from "@/utils/date";
import type { DbMessage } from "@/services/db/messages";
import { useI18n } from "@/i18n";

interface ReadReceiptBadgeProps {
  message: DbMessage;
  /** Only the user's own mail can be waiting on, or have received, a receipt. */
  isOwnMessage: boolean;
}

/**
 * Where a message stands with its read receipt, as a mark on the header.
 *
 * A receipt is an answer about a message the user already has, so it belongs
 * here rather than arriving as another mail in the inbox: an hourglass while
 * one was asked for and none has come back, a double check once it has.
 * Nothing at all when no receipt was requested.
 */
export function ReadReceiptBadge({ message, isOwnMessage }: ReadReceiptBadgeProps) {
  const { t } = useI18n();
  if (!isOwnMessage) return null;

  const count = message.read_receipt_count ?? 0;
  if (count > 0) {
    return (
      <span
        className="inline-flex items-center gap-0.5 text-[0.625rem] px-1.5 py-px rounded-full bg-success/15 text-success shrink-0"
        title={`${t("email.receiptReceived")}${
          message.read_receipt_last_at ? t("email.receiptLast").replace("{date}", formatFullDate(message.read_receipt_last_at)) : ""
        }`}
      >
        <CheckCheck size={10} />
        {count > 1 ? t("email.openedCount").replace("{count}", String(count)) : t("email.opened")}
      </span>
    );
  }

  const requested = !!message.disposition_notification_to;
  if (!requested) return null;

  return (
    <span
      className="inline-flex items-center gap-0.5 text-[0.625rem] px-1.5 py-px rounded-full bg-bg-tertiary text-text-tertiary shrink-0"
      title={t("email.receiptAwaiting")}
    >
      <Hourglass size={10} />
      {t("email.awaiting")}
    </span>
  );
}