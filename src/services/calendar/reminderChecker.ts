import { createBackgroundChecker } from "@/services/backgroundCheckers";
import { getDueCalendarReminders, markRemindersNotified } from "@/services/db/calendarEvents";
import { notifyCalendarReminder } from "@/services/notifications/notificationManager";
import { notify } from "@/stores/toastStore";

/**
 * Calendar event reminders.
 *
 * The provider stores the reminder configuration on each event
 * (`reminders_json`, e.g. `[{"method":"popup","minutes":10}]`). This checker
 * runs every 60 seconds, finds events whose reminder window has opened
 * ([start - minutes, start)) and that have not been notified yet, and fires
 * an OS notification plus an in-app toast. `reminders_notified_at` is set in
 * the same pass, so a restart or a double-run can never fire twice.
 *
 * The window stays open until the event starts: an app that was closed when
 * the reminder was due still announces it on launch (within the event's
 * duration the notification still makes sense; after the event it is
 * dropped).
 */
export async function checkCalendarReminders(): Promise<number> {
  const now = Math.floor(Date.now() / 1000);
  const due = await getDueCalendarReminders(now);
  let fired = 0;
  for (const event of due) {
    const minutesUntilStart = Math.max(0, Math.round((event.start_time - now) / 60));
    notifyCalendarReminder(
      event.summary ?? "(No title)",
      minutesUntilStart,
      event.id,
      event.account_id,
    );
    notify("info", `Reminder: ${event.summary ?? "Event"} starting in ${minutesUntilStart} min`);
    await markRemindersNotified(event.id);
    fired++;
  }
  return fired;
}

let checker: ReturnType<typeof createBackgroundChecker> | null = null;

export function startCalendarReminderChecker(): void {
  if (checker) return;
  checker = createBackgroundChecker(
    "calendar-reminders",
    () => checkCalendarReminders().then(() => undefined),
    60_000,
  );
  checker.start();
}

export function stopCalendarReminderChecker(): void {
  checker?.stop();
  checker = null;
}