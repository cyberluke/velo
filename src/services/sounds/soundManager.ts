import newMailSound from "@/assets/sounds/new-mail.wav";
import reminderSound from "@/assets/sounds/reminder.wav";
import completeSound from "@/assets/sounds/complete.wav";
import alertSound from "@/assets/sounds/alert.wav";
import sendSound from "@/assets/sounds/send.wav";
import { getSetting } from "@/services/db/settings";

/**
 * Classic Microsoft Office 97 sound effects (from the official Office XP
 * Sounds Update pack, `Media\Office97`) played for app events.
 *
 * The sounds are intentionally tied to the notification pipeline: an
 * incoming-mail notification and its sound fire together, a calendar
 * reminder chimes the Office reminder, an AI operation that finished plays
 * the Office "task complete" sound. Nothing here can throw — audio must
 * never take an event down with it.
 */

export type SoundEvent =
  | "newMail"
  | "reminder"
  | "aiComplete"
  | "alert"
  | "sendMail";

const SOUND_FILES: Record<SoundEvent, string> = {
  newMail: newMailSound,
  reminder: reminderSound,
  aiComplete: completeSound,
  alert: alertSound,
  sendMail: sendSound,
};

const VOLUME = 0.7;

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
 * missing Audio, autoplay rejection — all no-ops.
 */
export async function playSound(event: SoundEvent): Promise<void> {
  if (!enabledLoaded) await loadEnabled();
  if (!enabled) return;
  if (typeof window === "undefined" || typeof Audio === "undefined") return;

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
}