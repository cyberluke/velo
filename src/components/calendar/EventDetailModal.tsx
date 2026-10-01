import { hourCycleOption } from "@/utils/date";
import { useState, useCallback, useEffect } from "react";
import { MapPin, Clock, User, Pencil, Trash2, Video, FileText, Mail, Repeat, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { TextField } from "@/components/ui/TextField";
import type { DbCalendarEvent } from "@/services/db/calendarEvents";
import type { DbCalendar } from "@/services/db/calendars";
import { getCalendarProvider } from "@/services/calendar/providerFactory";
import { deleteCalendarEvent as deleteCalendarEventDb } from "@/services/db/calendarEvents";
import {
  getMeetingRecordForEvent,
  meetingRecordDecisions,
  meetingRecordActionItems,
  type DbMeetingRecord,
} from "@/services/db/meetingRecords";
import { getLinkedThreadForEvent } from "@/services/calendar/eventThreadLinks";
import { tryPairEvent, type ConfirmationSource } from "@/services/calendar/meetingPairing";
import { cacheThreadForOpening } from "@/services/threads/openThread";
import { useThreadStore } from "@/stores/threadStore";
import { openExternalLink } from "@/services/links/emailNavigation";
import { useTimeFormat } from "@/hooks/useTimeFormat";
import { useI18n } from "@/i18n";

const SOURCE_KEYS: Record<ConfirmationSource, string> = {
  calendly: "meetings.source.calendly",
  google_calendar: "meetings.source.google_calendar",
  zoom: "meetings.source.zoom",
  teams: "meetings.source.teams",
  scheduler: "meetings.source.scheduler",
  email: "meetings.source.email",
};

interface EventDetailModalProps {
  event: DbCalendarEvent;
  calendars: DbCalendar[];
  accountId: string;
  onClose: () => void;
  onUpdated: () => void;
}

export function EventDetailModal({ event, calendars, accountId, onClose, onUpdated }: EventDetailModalProps) {
  const { t } = useI18n();
  // Repaint when the 12/24-hour preference changes
  useTimeFormat();
  const [editing, setEditing] = useState(false);
  const [summary, setSummary] = useState(event.summary ?? "");
  const [description, setDescription] = useState(event.description ?? "");
  const [location, setLocation] = useState(event.location ?? "");
  const [startTime, setStartTime] = useState(toLocalISOString(new Date(event.start_time * 1000)));
  const [endTime, setEndTime] = useState(toLocalISOString(new Date(event.end_time * 1000)));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [record, setRecord] = useState<DbMeetingRecord | null>(null);
  const [linkedThread, setLinkedThread] = useState<{ threadId: string; accountId: string } | null>(null);
  const [pairingEvent, setPairingEvent] = useState(false);

  const loadPairing = useCallback(async () => {
    const [meetingRecord, thread] = await Promise.all([
      getMeetingRecordForEvent(event.id),
      getLinkedThreadForEvent(event),
    ]);
    setRecord(meetingRecord);
    setLinkedThread(thread);
  }, [event]);

  useEffect(() => {
    void loadPairing();
  }, [loadPairing]);

  const handleFindConfirmation = useCallback(async () => {
    setPairingEvent(true);
    try {
      const result = await tryPairEvent(event);
      if (result) {
        setLinkedThread({ threadId: result.threadId, accountId: result.threadAccountId });
        onUpdated();
      }
    } catch {
      /* pairing is best-effort */
    } finally {
      setPairingEvent(false);
    }
  }, [event, onUpdated]);

  const confirmationSourceKey = (source: string | null): string => {
    if (source && SOURCE_KEYS[source as ConfirmationSource]) {
      return SOURCE_KEYS[source as ConfirmationSource];
    }
    return "meetings.source.email";
  };

  const calendar = calendars.find((c) => c.id === event.calendar_id);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const provider = await getCalendarProvider(accountId);
      const calendarRemoteId = calendar?.remote_id ?? "primary";
      const remoteEventId = event.remote_event_id ?? event.google_event_id;

      await provider.updateEvent(calendarRemoteId, remoteEventId, {
        summary,
        description: description || undefined,
        location: location || undefined,
        startTime: new Date(startTime).toISOString(),
        endTime: new Date(endTime).toISOString(),
      }, event.etag ?? undefined);

      onUpdated();
    } catch (err) {
      console.error("Failed to update event:", err);
    } finally {
      setSaving(false);
    }
  }, [accountId, calendar, event, summary, description, location, startTime, endTime, onUpdated]);

  const handleDelete = useCallback(async () => {
    setDeleting(true);
    try {
      const provider = await getCalendarProvider(accountId);
      const calendarRemoteId = calendar?.remote_id ?? "primary";
      const remoteEventId = event.remote_event_id ?? event.google_event_id;

      await provider.deleteEvent(calendarRemoteId, remoteEventId, event.etag ?? undefined);

      // Remove from local DB
      await deleteCalendarEventDb(event.id);

      onUpdated();
    } catch (err) {
      console.error("Failed to delete event:", err);
    } finally {
      setDeleting(false);
    }
  }, [accountId, calendar, event, onUpdated]);

  const handleOpenThread = useCallback(async () => {
    if (!linkedThread) return;
    await cacheThreadForOpening(linkedThread.accountId, linkedThread.threadId);
    useThreadStore.getState().selectThread(linkedThread.threadId);
    onClose();
  }, [linkedThread, onClose]);

  const formatTime = (ts: number) => {
    return new Date(ts * 1000).toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      ...hourCycleOption(),
    });
  };

  const attendees = event.attendees_json ? JSON.parse(event.attendees_json) as { email: string; displayName?: string }[] : [];

  if (editing) {
    return (
      <Modal isOpen={true} onClose={onClose} title={t("calendar.editEvent")} width="w-full max-w-md">
        <div className="p-4 space-y-3">
          <TextField
            label={t("calendar.titleField")}
            type="text"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            autoFocus
          />

          <div className="grid grid-cols-2 gap-3">
            <TextField
              label={t("calendar.start")}
              type="datetime-local"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
            <TextField
              label={t("calendar.end")}
              type="datetime-local"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </div>

          <TextField
            label={t("calendar.location")}
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder={t("calendar.addLocation")}
          />

          <div>
            <label className="text-xs text-text-secondary block mb-1">{t("calendar.description")}</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("calendar.addDescription")}
              rows={3}
              className="w-full px-3 py-1.5 bg-bg-tertiary border border-border-primary rounded text-sm text-text-primary outline-none focus:border-accent resize-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" size="md" onClick={() => setEditing(false)}>
              {t("composer.cancel")}
            </Button>
            <Button variant="primary" size="md" onClick={handleSave} disabled={saving || !summary.trim()}>
              {saving ? t("calendar.saving") : t("calendar.save")}
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal isOpen={true} onClose={onClose} title={event.summary ?? t("calendar.event")} width="w-full max-w-md">
      <div className="p-4 space-y-3">
        {calendar && (
          <div className="flex items-center gap-2 text-xs text-text-tertiary">
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: calendar.color ?? "var(--color-accent)" }}
            />
            {calendar.display_name}
            {event.recurrence_rule && (
              <span className="flex items-center gap-1 ml-auto" title={event.recurrence_rule}>
                <Repeat size={12} /> {t("calendar.recurring")}
              </span>
            )}
          </div>
        )}

        <div className="flex items-start gap-2.5 text-sm text-text-secondary">
          <Clock size={14} className="mt-0.5 shrink-0 text-text-tertiary" />
          <div>
            <div>{formatTime(event.start_time)}</div>
            <div>{formatTime(event.end_time)}</div>
          </div>
        </div>

        {event.location && (
          <div className="flex items-start gap-2.5 text-sm text-text-secondary">
            <MapPin size={14} className="mt-0.5 shrink-0 text-text-tertiary" />
            <span>{event.location}</span>
          </div>
        )}

        {event.meeting_link && (
          <div className="flex items-center gap-2 pt-1">
            <Button
              variant="primary"
              size="sm"
              icon={<Video size={14} />}
              onClick={() => void openExternalLink(event.meeting_link!)}
            >
              {t("calendar.joinMeeting")}
            </Button>
            {event.meeting_record_url && (
              <Button
                variant="secondary"
                size="sm"
                icon={<FileText size={14} />}
                onClick={() => void openExternalLink(event.meeting_record_url!)}
              >
                {t("calendar.meetingRecord")}
              </Button>
            )}
          </div>
        )}

        {event.description && (
          <div className="text-sm text-text-secondary whitespace-pre-wrap border-t border-border-primary pt-3">
            {event.description}
          </div>
        )}

        {attendees.length > 0 && (
          <div className="border-t border-border-primary pt-3">
            <div className="text-xs text-text-tertiary mb-1.5">{t("calendar.attendees")}</div>
            <div className="space-y-1">
              {attendees.map((a, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-text-secondary">
                  <User size={12} className="text-text-tertiary" />
                  <span>{a.displayName ?? a.email}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {linkedThread && (
          <div className="border-t border-border-primary pt-3">
            <div className="text-xs text-text-tertiary mb-1.5 flex items-center gap-1.5">
              <Mail size={12} /> {t("calendar.relatedThread")}
            </div>
            <Button variant="secondary" size="sm" onClick={() => void handleOpenThread()}>
              {t("calendar.openThread")}
            </Button>
          </div>
        )}

        {/* Where the meeting confirmation came from — or that it is missing */}
        <div className="border-t border-border-primary pt-3">
          <div className="text-xs text-text-tertiary mb-1.5 flex items-center gap-1.5">
            <Mail size={12} /> {t("meetings.guideTitle")}
          </div>
          {linkedThread ? (
            <span className="inline-flex items-center gap-1 text-xs text-success">
              <Check size={12} />
              {t("meetings.pairedSource").replace("{source}", t(confirmationSourceKey(event.confirmation_source)))}
            </span>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-tertiary">{t("meetings.unpairedSingle")}</span>
              <Button
                variant="secondary"
                size="sm"
                icon={pairingEvent ? <Loader2 size={12} className="animate-spin" /> : undefined}
                disabled={pairingEvent}
                onClick={() => void handleFindConfirmation()}
              >
                {t("meetings.findInEmail")}
              </Button>
            </div>
          )}
        </div>

        {record && (record.summary || meetingRecordDecisions(record).length > 0 || meetingRecordActionItems(record).length > 0) && (
          <div className="border-t border-border-primary pt-3 space-y-2">
            <div className="text-xs text-text-tertiary flex items-center gap-1.5">
              <FileText size={12} /> {t("calendar.meetingRecord")}
            </div>
            {record.summary && (
              <p className="text-sm text-text-secondary whitespace-pre-wrap">{record.summary}</p>
            )}
            {meetingRecordDecisions(record).length > 0 && (
              <div>
                <div className="text-xs text-text-tertiary mb-1">{t("calendar.decisions")}</div>
                <ul className="list-disc pl-4 text-sm text-text-secondary space-y-0.5">
                  {meetingRecordDecisions(record).map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              </div>
            )}
            {meetingRecordActionItems(record).length > 0 && (
              <div>
                <div className="text-xs text-text-tertiary mb-1">{t("calendar.actionItems")}</div>
                <ul className="list-disc pl-4 text-sm text-text-secondary space-y-0.5">
                  {meetingRecordActionItems(record).map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-between pt-2 border-t border-border-primary">
          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-danger">{t("calendar.deleteEventQuestion")}</span>
              <Button variant="danger" size="xs" onClick={handleDelete} disabled={deleting}>
                {deleting ? t("calendar.deleting") : t("calendar.yesDelete")}
              </Button>
              <Button variant="secondary" size="xs" onClick={() => setConfirmDelete(false)}>
                {t("composer.cancel")}
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              icon={<Trash2 size={14} />}
              onClick={() => setConfirmDelete(true)}
            >
              {t("email.deleteShort")}
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            icon={<Pencil size={14} />}
            onClick={() => setEditing(true)}
          >
            {t("calendar.edit")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function toLocalISOString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}