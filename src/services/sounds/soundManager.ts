import newMailSound from "@/assets/sounds/new-mail.wav";
import reminderSound from "@/assets/sounds/reminder.wav";
import reminder2Sound from "@/assets/sounds/remindr2.wav";
import reminder3Sound from "@/assets/sounds/remindr3.wav";
import completeSound from "@/assets/sounds/complete.wav";
import alertSound from "@/assets/sounds/alert.wav";
import sendSound from "@/assets/sounds/send.wav";
import deleteSound from "@/assets/sounds/delete.wav";
import undoSound from "@/assets/sounds/undo.wav";
import redoSound from "@/assets/sounds/redo.wav";
import folderSound from "@/assets/sounds/folder.wav";
import clearSound from "@/assets/sounds/clear.wav";
import cancelSound from "@/assets/sounds/cancel.wav";
import dialogSound from "@/assets/sounds/dialog.wav";
import insertSound from "@/assets/sounds/insert.wav";
import viewSound from "@/assets/sounds/view.wav";
import modeSound from "@/assets/sounds/mode.wav";
import themeSound from "@/assets/sounds/theme.wav";
import zoomInSound from "@/assets/sounds/zoom-in.wav";
import zoomOutSound from "@/assets/sounds/zoom-out.wav";
import dragSound from "@/assets/sounds/drag.wav";
import dropSound from "@/assets/sounds/drop.wav";
import autocorrSound from "@/assets/sounds/autocorr.wav";
import { getSetting } from "@/services/db/settings";

/**
 * Classic Microsoft Office 97 sound effects (from the official Office XP
 * Sounds Update pack, `Media\Office97`) played for app events.
 *
 * The sounds are intentionally tied to the app's own actions: an incoming
 * mail notification and its chime fire together, a calendar reminder plays
 * the Office reminder, an AI operation that finished plays "task complete",
 * a trash action plays Delete, a theme switch plays the Office theme sound.
 * Everything that is pure UI chrome (scrollbar, toolbar, menu) in the pack
 * has no event here — nothing should make noise for noise's sake. Nothing
 * here can throw — audio must never take an event down with it.
 */

export type SoundEvent =
  | "newMail"
  | "reminder"
  | "reminderCalendar"
  | "reminderFollowUp"
  | "aiComplete"
  | "alert"
  | "sendMail"
  | "delete"
  | "undo"
  | "redo"
  | "folder"
  | "clear"
  | "cancel"
  | "dialog"
  | "insert"
  | "view"
  | "mode"
  | "theme"
  | "zoomIn"
  | "zoomOut"
  | "drag"
  | "drop"
  | "autocorr";

const SOUND_FILES: Record<SoundEvent, string> = {
  newMail: newMailSound,
  reminder: reminderSound,
  reminderCalendar: reminder2Sound,
  reminderFollowUp: reminder3Sound,
  aiComplete: completeSound,
  alert: alertSound,
  sendMail: sendSound,
  delete: deleteSound,
  undo: undoSound,
  redo: redoSound,
  folder: folderSound,
  clear: clearSound,
  cancel: cancelSound,
  dialog: dialogSound,
  insert: insertSound,
  view: viewSound,
  mode: modeSound,
  theme: themeSound,
  zoomIn: zoomInSound,
  zoomOut: zoomOutSound,
  drag: dragSound,
  drop: dropSound,
  autocorr: autocorrSound,
};

const VOLUME = 0.7;

/**
 * A burst of the same event must not stack overlapping chimes. A sync that
 * delivers several new mails at once (or the first sync after an account is
 * added) is one moment for the user, so the incoming-mail chime collapses
 * into a single sound for a couple of seconds. User-initiated sounds get a
 * shorter window — they are deliberate clicks, spaced by the person pressing
 * them, and only a double-click needs collapsing.
 */
const COALESCE_MS: Partial<Record<SoundEvent, number>> = {
  newMail: 2500,
  reminder: 1500,
  reminderCalendar: 1500,
  reminderFollowUp: 1500,
  alert: 1500,
  aiComplete: 1500,
  sendMail: 400,
  delete: 400,
  undo: 400,
  redo: 400,
  folder: 400,
  clear: 400,
  cancel: 400,
  dialog: 400,
  insert: 400,
  view: 400,
  mode: 400,
  theme: 800,
  zoomIn: 400,
  zoomOut: 400,
  drag: 200,
  drop: 200,
  autocorr: 800,
};

const lastPlayedAt: Partial<Record<SoundEvent, number>> = {};

let enabled = true;
let enabledLoaded = false;
let unlocked = false;

async function loadEnabled(): Promise<void> {
  if (enabledLoaded) return;
  enabledLoaded = true;
  try {
    const setting = await getSetting("sounds_enabled");
    enabled = setting !== "false"; // default on
  } catch {
    enabled = true;
  }
}

/**
 * WebView2 and WKWebView apply an autoplay policy: `audio.play()` before the
 * first user gesture is rejected. Registering one gesture listener and
 * playing a silent audio on it satisfies the policy for everything after.
 */
function installUnlock(): void {
  if (unlocked || typeof window === "undefined") return;
  unlocked = true;
  const unlock = () => {
    try {
      const silent = new Audio();
      silent.volume = 0;
      void silent.play().catch(() => {
        /* gesture may still be needed; later plays try again */
      });
    } catch {
      /* no audio in this environment */
    }
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
}

/**
 * Play one of the Office sounds. Safe to call anywhere: disabled setting,
 * missing Audio, autoplay rejection — all no-ops. Same-event plays inside
 * the event's coalescing window collapse into one sound.
 */
export async function playSound(event: SoundEvent): Promise<void> {
  if (!enabledLoaded) await loadEnabled();
  if (!enabled) return;
  if (typeof window === "undefined" || typeof Audio === "undefined") return;

  const now = Date.now();
  const last = lastPlayedAt[event];
  const windowMs = COALESCE_MS[event] ?? 400;
  if (last !== undefined && now - last < windowMs) return;
  lastPlayedAt[event] = now;

  installUnlock();
  try {
    const audio = new Audio(SOUND_FILES[event]);
    audio.volume = VOLUME;
    await audio.play().catch(() => {
      /* autoplay blocked until the first user gesture — not fatal */
    });
  } catch {
    /* never throw */
  }
}

/** Flip the master sound switch from Settings; takes effect immediately. */
export function setSoundsEnabled(value: boolean): void {
  enabled = value;
  enabledLoaded = true;
}

/** Test seam: restore defaults and forget cached state. */
export function resetSoundsForTests(): void {
  enabled = true;
  enabledLoaded = false;
  unlocked = false;
  for (const key of Object.keys(lastPlayedAt)) {
    delete lastPlayedAt[key as SoundEvent];
  }
}