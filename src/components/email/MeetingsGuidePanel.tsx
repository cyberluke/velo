import { useCallback, useEffect, useState } from "react";
import {
  CalendarDays,
  ExternalLink,
  Link2,
  Loader2,
  MailSearch,
  PartyPopper,
} from "lucide-react";
import {
  getUnpairedMeetingEvents,
  type DbCalendarEvent,
} from "@/services/db/calendarEvents";
import {
  pairMeetingsWithEmails,
  tryPairEvent,
} from "@/services/calendar/meetingPairing";
import { getSetting } from "@/services/db/settings";
import { navigateToLabel, navigateToSettings, navigateToThread } from "@/router/navigate";
import { openExternalLink } from "@/services/links/emailNavigation";
import { formatRelativeDate } from "@/utils/date";
import { useI18n } from "@/i18n";

/**
 * The Meetings tab's guide panel.
 *
 * Sits above the thread list when the Meetings category is open. It pairs
 * calendar events with their confirmation emails (Calendly, Google Calendar,
 * Zoom, ...) — recording where each came from — and lists the meetings that
 * are still missing a confirmation email, with a one-click "find in email"
 * action. The "Schedule a meeting" button opens the user's booking link when
 * one is configured, and falls back to the Calendar page otherwise.
 */
export function MeetingsGuidePanel() {
  const { t } = useI18n();
  const [unpaired, setUnpaired] = useState<(DbCalendarEvent & { account_email: string | null })[]>([]);
  const [bookingUrl, setBookingUrl] = useState("");
  const [pairing, setPairing] = useState(true);
  const [pairingTried, setPairingTried] = useState(false);
  const [busyEventId, setBusyEventId] = useState<string | null>(null);
  const [notFoundId, setNotFoundId] = useState<string | null>(null);

  const refreshUnpaired = useCallback(async () => {
    try {
      setUnpaired(await getUnpairedMeetingEvents(Math.floor(Date.now() / 1000)));
    } catch {
      setUnpaired([]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const url = await getSetting("meeting_booking_url");
        if (!cancelled) setBookingUrl(url ?? "");
      } catch {
        /* default to no booking link */
      }
      // Best-effort pairing pass: link what can be linked, then show what is
      // still missing a confirmation. Never blocks the list on a failure.
      try {
        await pairMeetingsWithEmails();
      } catch {
        /* pairing is best-effort */
      }
      if (cancelled) return;
      setPairing(false);
      setPairingTried(true);
      await refreshUnpaired();
    })();

    return () => {
      cancelled = true;
    };
  }, [refreshUnpaired]);

  const handleFindInEmail = async (event: DbCalendarEvent) => {
    setBusyEventId(event.id);
    setNotFoundId(null);
    try {
      const result = await tryPairEvent(event);
      if (result) {
        await refreshUnpaired();
        navigateToThread(result.threadId);
        return;
      }
      setNotFoundId(event.id);
    } catch {
      setNotFoundId(event.id);
    } finally {
      setBusyEventId(null);
    }
  };

  const handleSchedule = () => {
    if (bookingUrl) {
      void openExternalLink(bookingUrl);
      return;
    }
    navigateToLabel("calendar");
  };

  return (
    <div className="px-3 py-2.5 border-b border-border-secondary bg-bg-secondary/60">
      {/* Guide */}
      <div className="flex items-start gap-2.5">
        <CalendarDays size={16} className="text-accent shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-primary">{t("meetings.guideTitle")}</p>
          <p className="text-xs text-text-tertiary mt-0.5 leading-relaxed">{t("meetings.guideDesc")}</p>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <button
              onClick={handleSchedule}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-accent text-on-accent hover:bg-accent-hover transition-colors"
            >
              <ExternalLink size={12} />
              {t("meetings.schedule")}
            </button>
            {!bookingUrl && (
              <button
                onClick={() => navigateToSettings("general")}
                className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border border-border-primary text-text-secondary hover:text-text-primary hover:border-accent transition-colors"
              >
                <Link2 size={12} />
                {t("meetings.setBookingLink")}
              </button>
            )}
            {pairing && (
              <span className="inline-flex items-center gap-1.5 text-xs text-text-tertiary">
                <Loader2 size={12} className="animate-spin" />
                {t("meetings.pairingRun")}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Unpaired meetings */}
      {!pairing && pairingTried && (
        <div className="mt-2.5 pl-[26px]">
          {unpaired.length === 0 ? (
            <p className="text-xs text-success inline-flex items-center gap-1.5">
              <PartyPopper size={12} />
              {t("meetings.unpairedEmpty")}
            </p>
          ) : (
            <>
              <p className="text-xs font-medium text-text-secondary mb-1.5">
                {t("meetings.unpairedTitle").replace("{count}", String(unpaired.length))}
              </p>
              <ul className="space-y-1.5">
                {unpaired.map((event) => (
                  <li
                    key={event.id}
                    className="flex items-center gap-2 text-xs rounded-lg border border-border-primary bg-bg-tertiary/50 px-2.5 py-1.5"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-text-primary truncate">
                        {event.summary || t("meetings.noTitle")}
                      </p>
                      <p className="text-text-tertiary truncate">
                        {formatRelativeDate(event.start_time * 1000)}
                        {event.account_email ? ` · ${event.account_email}` : ""}
                      </p>
                    </div>
                    {notFoundId === event.id ? (
                      <span className="text-text-tertiary shrink-0">{t("meetings.notFound")}</span>
                    ) : (
                      <button
                        onClick={() => void handleFindInEmail(event)}
                        disabled={busyEventId === event.id}
                        className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-border-primary text-text-secondary hover:text-text-primary hover:border-accent transition-colors disabled:opacity-50"
                        title={t("meetings.findInEmail")}
                      >
                        {busyEventId === event.id ? (
                          <Loader2 size={11} className="animate-spin" />
                        ) : (
                          <MailSearch size={11} />
                        )}
                        {t("meetings.findInEmail")}
                      </button>
                    )}
                    <button
                      onClick={() => navigateToLabel("calendar")}
                      className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-border-primary text-text-secondary hover:text-text-primary hover:border-accent transition-colors"
                      title={t("meetings.open")}
                    >
                      {t("meetings.open")}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}