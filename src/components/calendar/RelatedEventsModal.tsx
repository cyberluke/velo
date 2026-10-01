import { useEffect, useState, useCallback } from "react";
import { CalendarDays, Clock, Video } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import type { DbCalendarEvent } from "@/services/db/calendarEvents";
import type { DbCalendar } from "@/services/db/calendars";
import { getVisibleCalendars } from "@/services/db/calendars";
import { findEventsForThread } from "@/services/calendar/eventThreadLinks";
import { EventDetailModal } from "./EventDetailModal";
import { useI18n } from "@/i18n";

/**
 * The mail thread -> meeting direction of the cross-links: lists the events
 * related to an open thread (linked explicitly or matched by participants
 * and subject) and lets the user open any of them in the event detail.
 */
export function RelatedEventsModal({
  accountId,
  threadId,
  onClose,
}: {
  accountId: string;
  threadId: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [events, setEvents] = useState<DbCalendarEvent[] | null>(null);
  const [calendars, setCalendars] = useState<DbCalendar[]>([]);
  const [openEvent, setOpenEvent] = useState<DbCalendarEvent | null>(null);

  const load = useCallback(async () => {
    const [found, cals] = await Promise.all([
      findEventsForThread(accountId, threadId),
      getVisibleCalendars(accountId),
    ]);
    setEvents(found);
    setCalendars(cals);
  }, [accountId, threadId]);

  useEffect(() => {
    void load();
  }, [load]);

  const calendarFor = (event: DbCalendarEvent) =>
    calendars.find((c) => c.id === event.calendar_id);

  return (
    <>
      <Modal isOpen={true} onClose={onClose} title={t("calendar.relatedMeetings")} width="w-full max-w-md">
        <div className="p-4">
          {events === null ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : events.length === 0 ? (
            <p className="text-sm text-text-tertiary py-6 text-center">
              {t("calendar.noRelatedEvents")}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {events.map((event) => {
                const calendar = calendarFor(event);
                return (
                  <li key={event.id}>
                    <button
                      onClick={() => setOpenEvent(event)}
                      className="w-full flex items-start gap-2.5 px-3 py-2 rounded-lg hover:bg-bg-hover text-left group"
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full mt-1.5 shrink-0"
                        style={{ backgroundColor: calendar?.color ?? "var(--color-accent)" }}
                      />
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm text-text-primary truncate">
                          {event.summary ?? "(No title)"}
                        </span>
                        <span className="flex items-center gap-3 text-xs text-text-tertiary mt-0.5">
                          <span className="flex items-center gap-1">
                            <Clock size={11} />
                            {new Date(event.start_time * 1000).toLocaleString(undefined, {
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </span>
                          {event.meeting_link && (
                            <span className="flex items-center gap-1 text-accent">
                              <Video size={11} /> Meeting
                            </span>
                          )}
                        </span>
                      </span>
                      <CalendarDays size={14} className="text-text-tertiary mt-1 shrink-0 group-hover:text-accent" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Modal>

      {openEvent && (
        <EventDetailModal
          event={openEvent}
          calendars={calendars}
          accountId={accountId}
          onClose={() => setOpenEvent(null)}
          onUpdated={() => {
            setOpenEvent(null);
            void load();
          }}
        />
      )}
    </>
  );
}