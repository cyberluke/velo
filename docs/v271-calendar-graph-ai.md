# V271 Calendar + Graph + AI Integration — Audit and Evidence

Source spec: `VAPE_MAIL_Calendar_V271_Graph_And_AI.md` (the "Vape Mail"
name in the spec is a typo for **Velo**, this repository).

## Phase 0 — Calendar capability audit

```
CALENDAR_PRESENT
```

Velo already contains a first-class calendar subsystem. Per the spec,
the existing subsystem was **extended** — no second calendar database and
no parallel UI were created.

| Spec audit item | Where it lives |
|---|---|
| Calendar UI | `src/components/calendar/` — `CalendarPage`, `CalendarToolbar`, `CalendarList` (agenda/upcoming), `DayView`, `WeekView`, `MonthView`, `EventCard`, `EventDetailModal` (detail/edit/delete), `EventCreateModal`, `CalendarAccountPicker`, `CalendarReauthBanner` |
| Calendar data model | `calendars` (migration 19) + `calendar_events` (migration 15) tables |
| Event store | `src/services/db/calendars.ts`, `src/services/db/calendarEvents.ts` (SQLite upserts keyed on `(account_id, remote_id)`) |
| Account/provider integration | `CalendarProvider` abstraction (`src/services/calendar/providerFactory.ts`, `hasCalendarSupport()`); Google Calendar API via the Gmail OAuth client (`googleCalendarProvider.ts`; scopes `calendar.readonly` + `calendar.events` already in `auth.ts`); CalDAV via `tsdav` (`caldavProvider.ts`, `AddCalDavAccount`) |
| Invite/attendee model | `attendees_json` (Google attendees + CalDAV `ATTENDEE`/`CN`/`PARTSTAT` in `icalHelper.ts`) |
| Reminders | **new** — provider reminders captured (`reminders_json`) and fired by `src/services/calendar/reminderChecker.ts` |
| Meeting links | **new** — `meeting_link` column; Google `hangoutLink`/`conferenceData` + CalDAV `CONFERENCE`/`X-GOOGLE-CONFERENCE`; "Join meeting" in `EventDetailModal`; `conferenceDataVersion=1` on Google event creation |
| ICS handling | `icalHelper.ts` (parse/generate VEVENT), `ical_data` column — extended with `RRULE`, `RECURRENCE-ID`, `CONFERENCE`, `VALARM TRIGGER` |
| Provider-specific calendar APIs | Google Calendar v3 sync tokens; CalDAV ctag + time-range fetch |
| Shared mail/calendar account model | single `accounts` table with `provider` `gmail_api`/`imap`/`caldav`; `CalendarAccountPicker` |
| Sync | `syncCalendar.ts` — per-calendar incremental sync, refused-token full resync, idempotent upserts (acceptance criterion 6) |

## What was implemented (spec → code)

### Meeting links + recurrence + reminders (migration 34)
- `calendar_events` gains `meeting_link`, `recurring_event_id`, `recurrence_rule`, `reminders_json`, `reminders_notified_at`, `linked_thread_id`, `linked_thread_account_id`, `meeting_record_id`, `meeting_record_url`.
- `src/services/calendar/types.ts`, `googleCalendarProvider.ts`, `icalHelper.ts` (used by `caldavProvider.ts`) populate them.
- `src/services/calendar/reminderChecker.ts` fires OS + in-app reminders once per event; started from `App.tsx`.

### Mail ↔ calendar cross-links
- `src/services/calendar/eventThreadLinks.ts`: auto-links events to threads (shared participant **and** distinctive subject token — conservative), `findEventsForThread`, `getLinkedThreadForEvent`.
- UI: `EventDetailModal` shows the linked thread (opens it); `ThreadView` header shows "Related meetings" → `RelatedEventsModal` (thread → events, opens event detail).

### V271 Identity (acceptance criteria 3, 10)
- `src/services/v271/settings.ts` — config (`v271_enabled`, `v271_identity_url`, `v271_graph_url`, `v271_client_id`) + token storage through secure settings (AES-256-GCM, key in OS credential store — same path as Gmail/IMAP credentials).
- `src/services/v271/identityClient.ts` — Authorization Code + PKCE against the configured identity server (generic Rust `start_oauth_server`/`oauth_exchange_token`/`oauth_refresh_token` commands), auto-refresh 5 min before expiry.

### V271 Personal Graph (acceptance criteria 4, 5, 6)
- `src/services/v271/types.ts` — entities `mail.thread`, `mail.contact`, `mail.message_ref`, `calendar.event`, `calendar.participant`, `meeting.record`; edges `ATTENDED`, `ORGANIZED`, `RELATED_TO`, `HAS_MEETING`; source IDs built from Velo ids for idempotent upserts.
- `src/services/v271/adapters.ts` — the defined adapter boundary: summarizes Velo stores, never a second store.
- `src/services/v271/transport.ts` — HTTP transport (`POST {graph_url}/graph/sync`, bearer token, one refresh retry on 401) + `RecordingGraphTransport` for tests/dry-run.
- `src/services/v271/graphSync.ts` — idempotent engine: per-entity SHA-256 hash vs `graph_entities` table; unchanged data is never pushed; failed pushes keep the old hash and retry; deleted events/records are sent as tombstones. Runs on calendar sync and every 15 min (`startV271GraphChecker`).

### Meeting Scribe link (acceptance criteria 7, 8)
- `src/services/db/meetingRecords.ts` — canonical meeting records per event (record URL, transcript, summary, decisions, action items), linked via `calendar_events.meeting_record_id`.
- `EventDetailModal` renders "Join meeting" (meeting link) and the record (summary/decisions/action items + "Meeting record" URL button).
- The graph edge `HAS_MEETING` carries event → record.

### Cross-source AI (acceptance criterion 9)
- `src/services/ai/prompts.ts` — `MEETINGS_PROMPT` (evidence + provenance).
- `src/services/ai/askMeetings.ts` — intent detection + evidence gathering for "meetings today", "decisions from yesterday's meeting with X", "which email thread led to this meeting", "draft a follow-up from the action items"; answers carry provenance refs.
- `src/services/ai/askInbox.ts` — calendar/meeting questions route to the cross-source path before the mailbox search; `AskInbox` UI shows provenance sources.

## Evidence

- Audit result: `CALENDAR_PRESENT` (this document).
- Calendar UI: `src/components/calendar/*` (13 components).
- V271 login: `identityClient.ts` (PKCE against configurable endpoint; live login requires a real V271 identity server — see External dependencies).
- Mail graph entity: `adapters.ts` `collectMailEntities()`.
- Calendar event entity: `adapters.ts` `collectCalendarEntities()` (event + participants + `RELATED_TO`/`HAS_MEETING` edges).
- Linked meeting: `meetingRecords.ts` + `HAS_MEETING` edge; `EventDetailModal` UI.
- Cross-source AI query with provenance: `askMeetings.ts` + `MEETINGS_PROMPT`.
- Idempotent sync: `src/services/v271/graphSync.test.ts` (unchanged data pushes nothing; changed data pushes only the delta; failure leaves hashes for retry).
- Reminder window: `src/services/db/calendarEvents.test.ts` (`getDueCalendarReminders`).
- ICS meeting/recurrence/reminder parsing: `src/services/calendar/icalHelper.test.ts`.

## External dependencies (genuine limits)

- **V271 Identity / Graph servers**: no endpoint or schema exists locally. The client, transport contract (`POST {graph_url}/graph/sync` with `{client, entities, edges, syncedAt}`), scopes (`openid profile email graph.readwrite`) and idempotent engine are implemented and tested with a recording transport; live pushes start once `v271_identity_url`, `v271_graph_url` and `v271_client_id` are configured in settings and the identity server implements the PKCE + token endpoints.
- **Toastovač Meeting Scribe**: no API spec exists locally. Meeting records can be written to the local store and linked to events (UI + graph edge ready); the flow `event → start/join → Toastovač → record` needs the Scribe API or import surface.