import type {
  CalendarEventData,
  CalendarInfo,
  CalendarProvider,
  CalendarSyncResult,
  CreateEventInput,
  UpdateEventInput,
} from "./types";
import {
  deleteEventByAccountAndRemoteId,
  getCalendarEventsInRange,
  updateEventByRemoteId,
  upsertCalendarEvent,
  type DbCalendarEvent,
} from "@/services/db/calendarEvents";

export const LOCAL_CALENDAR_REMOTE_ID = "local";
export const LOCAL_CALENDAR_DISPLAY_NAME = "My Calendar";
export const LOCAL_CALENDAR_COLOR = "#4f46e5";

function toTimestamp(iso: string): number {
  return Math.floor(new Date(iso).getTime() / 1000);
}

function toData(event: DbCalendarEvent): CalendarEventData {
  return {
    remoteEventId: event.remote_event_id ?? event.google_event_id,
    uid: event.uid,
    etag: event.etag,
    summary: event.summary,
    description: event.description,
    location: event.location,
    startTime: event.start_time,
    endTime: event.end_time,
    isAllDay: event.is_all_day === 1,
    status: event.status,
    organizerEmail: event.organizer_email,
    attendeesJson: event.attendees_json,
    htmlLink: event.html_link,
    icalData: event.ical_data,
    meetingLink: event.meeting_link,
    recurringEventId: event.recurring_event_id,
    recurrenceRule: event.recurrence_rule,
    remindersJson: event.reminders_json,
  };
}

/**
 * A calendar with no server behind it: events live directly in the local
 * SQLite `calendar_events` table, which is both the source of truth and the
 * cache. Every write goes through the same table the Calendar page reads, so
 * create/update/delete are visible immediately, and sync is a no-op — there
 * is nothing to fetch or push.
 */
export class LocalCalendarProvider implements CalendarProvider {
  readonly accountId: string;
  readonly type = "local" as const;

  constructor(accountId: string) {
    this.accountId = accountId;
  }

  async listCalendars(): Promise<CalendarInfo[]> {
    return [
      {
        remoteId: LOCAL_CALENDAR_REMOTE_ID,
        displayName: LOCAL_CALENDAR_DISPLAY_NAME,
        color: LOCAL_CALENDAR_COLOR,
        isPrimary: true,
      },
    ];
  }

  async fetchEvents(
    _calendarRemoteId: string,
    timeMin: string,
    timeMax: string,
  ): Promise<CalendarEventData[]> {
    const rows = await getCalendarEventsInRange(
      this.accountId,
      toTimestamp(timeMin),
      toTimestamp(timeMax),
    );
    return rows.map(toData);
  }

  async createEvent(
    _calendarRemoteId: string,
    event: CreateEventInput,
  ): Promise<CalendarEventData> {
    const data: CalendarEventData = {
      remoteEventId: `local-${crypto.randomUUID()}`,
      uid: null,
      etag: null,
      summary: event.summary,
      description: event.description ?? null,
      location: event.location ?? null,
      startTime: toTimestamp(event.startTime),
      endTime: toTimestamp(event.endTime),
      isAllDay: event.isAllDay ?? false,
      status: "confirmed",
      organizerEmail: null,
      attendeesJson: null,
      htmlLink: null,
      icalData: null,
      meetingLink: null,
      recurringEventId: null,
      recurrenceRule: null,
      remindersJson: null,
    };
    await this.persist(data);
    return data;
  }

  async updateEvent(
    _calendarRemoteId: string,
    remoteEventId: string,
    event: UpdateEventInput,
  ): Promise<CalendarEventData> {
    const updated = await updateEventByRemoteId(this.accountId, remoteEventId, {
      summary: event.summary,
      description: event.description,
      location: event.location,
      startTime: event.startTime ? toTimestamp(event.startTime) : undefined,
      endTime: event.endTime ? toTimestamp(event.endTime) : undefined,
      isAllDay: event.isAllDay,
    });
    if (!updated) {
      throw new Error(`Local event ${remoteEventId} not found`);
    }
    return toData(updated);
  }

  async deleteEvent(
    _calendarRemoteId: string,
    remoteEventId: string,
  ): Promise<void> {
    await deleteEventByAccountAndRemoteId(this.accountId, remoteEventId);
  }

  async syncEvents(
    _calendarRemoteId: string,
    _syncToken?: string,
  ): Promise<CalendarSyncResult> {
    // The local table is the source of truth — there is nothing to fetch,
    // and no token to advance.
    return {
      created: [],
      updated: [],
      deletedRemoteIds: [],
      newSyncToken: null,
      newCtag: null,
    };
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    return { success: true, message: "Local calendar is always available" };
  }

  private async persist(data: CalendarEventData): Promise<void> {
    await upsertCalendarEvent({
      accountId: this.accountId,
      googleEventId: data.remoteEventId,
      summary: data.summary,
      description: data.description,
      location: data.location,
      startTime: data.startTime,
      endTime: data.endTime,
      isAllDay: data.isAllDay,
      status: data.status,
      organizerEmail: data.organizerEmail,
      attendeesJson: data.attendeesJson,
      htmlLink: data.htmlLink,
      calendarId: null,
      remoteEventId: data.remoteEventId,
      etag: null,
      icalData: null,
      uid: null,
      meetingLink: null,
      recurringEventId: null,
      recurrenceRule: null,
      remindersJson: null,
    });
  }
}