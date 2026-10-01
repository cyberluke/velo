import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const getSettingMock = vi.hoisted(() => vi.fn());

vi.mock("@/services/db/settings", () => ({
  getSetting: (...args: unknown[]) => getSettingMock(...args),
}));

/** jsdom has no Audio; record every playback attempt. */
const created: { src: string; volume: number; play: ReturnType<typeof vi.fn> }[] = [];

class MockAudio {
  src: string;
  volume = 1;
  play = vi.fn(() => Promise.resolve());
  constructor(src?: string) {
    this.src = src ?? "";
    created.push(this);
  }
}

import {
  playSound,
  setSoundsEnabled,
  resetSoundsForTests,
  type SoundEvent,
} from "./soundManager";

const ALL_EVENTS: SoundEvent[] = [
  "newMail", "reminder", "reminderCalendar", "reminderFollowUp", "aiComplete",
  "alert", "sendMail", "delete", "undo", "redo", "folder", "clear", "cancel",
  "dialog", "insert", "view", "mode", "theme", "zoomIn", "zoomOut",
  "drag", "drop", "autocorr",
];
const EXPECTED_FILES: Record<SoundEvent, string> = {
  newMail: "new-mail.wav",
  reminder: "reminder.wav",
  reminderCalendar: "remindr2.wav",
  reminderFollowUp: "remindr3.wav",
  aiComplete: "complete.wav",
  alert: "alert.wav",
  sendMail: "send.wav",
  delete: "delete.wav",
  undo: "undo.wav",
  redo: "redo.wav",
  folder: "folder.wav",
  clear: "clear.wav",
  cancel: "cancel.wav",
  dialog: "dialog.wav",
  insert: "insert.wav",
  view: "view.wav",
  mode: "mode.wav",
  theme: "theme.wav",
  zoomIn: "zoom-in.wav",
  zoomOut: "zoom-out.wav",
  drag: "drag.wav",
  drop: "drop.wav",
  autocorr: "autocorr.wav",
};

describe("soundManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    created.length = 0;
    getSettingMock.mockReset();
    getSettingMock.mockResolvedValue(null);
    vi.stubGlobal("Audio", MockAudio);
    resetSoundsForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is on by default and maps every event to its Office 97 file", async () => {
    for (const event of ALL_EVENTS) {
      await playSound(event);
    }
    expect(created).toHaveLength(ALL_EVENTS.length);
    for (const event of ALL_EVENTS) {
      const audio = created.find((a) => a.src.includes(EXPECTED_FILES[event]));
      expect(audio).toBeDefined();
      expect(audio!.volume).toBe(0.7);
      expect(audio!.play).toHaveBeenCalled();
    }
  });

  it("plays nothing when the setting is off", async () => {
    getSettingMock.mockResolvedValue("false");
    await playSound("newMail");
    expect(created).toHaveLength(0);
  });

  it("honours the in-memory switch without a restart", async () => {
    setSoundsEnabled(false);
    await playSound("reminder");
    expect(created).toHaveLength(0);

    setSoundsEnabled(true);
    await playSound("reminder");
    expect(created).toHaveLength(1);
  });

  it("coalesces same-event plays inside the window", async () => {
    // A new-mail batch fires several notifications in one tick; one chime
    await playSound("newMail");
    await playSound("newMail");
    await playSound("newMail");
    expect(created).toHaveLength(1);
    // A different event in the same instant is not swallowed
    await playSound("reminder");
    expect(created).toHaveLength(2);
  });

  it("plays again once the coalescing window has passed", async () => {
    vi.useFakeTimers();
    // sendMail has a 400ms window; advance past it and the chime plays again
    await playSound("sendMail");
    vi.advanceTimersByTime(500);
    await playSound("sendMail");
    expect(created).toHaveLength(2);
    vi.useRealTimers();
  });

  it("keeps the new-mail chime single during a burst beyond a short window", async () => {
    // A big sync announces arrivals over several seconds — the chime must not
    // repeat for every mail. The 2.5s newMail window swallows a burst.
    vi.useFakeTimers();
    await playSound("newMail");
    vi.advanceTimersByTime(1000);
    await playSound("newMail");
    vi.advanceTimersByTime(1000);
    await playSound("newMail");
    expect(created).toHaveLength(1);
    vi.useRealTimers();
  });

  it("never throws when playback is rejected (autoplay policy)", async () => {
    // A play() that rejects must not surface as an unhandled rejection
    const rejecting = vi.fn(() => Promise.reject(new Error("NotAllowedError")));
    vi.stubGlobal("Audio", class {
      src = "";
      volume = 1;
      play = rejecting;
      constructor(s?: string) {
        this.src = s ?? "";
        created.push(this);
      }
    });
    resetSoundsForTests();
    await expect(playSound("newMail")).resolves.toBeUndefined();
    expect(rejecting).toHaveBeenCalled();
  });

  it("never throws when Audio is missing entirely", async () => {
    vi.stubGlobal("Audio", undefined);
    resetSoundsForTests();
    await expect(playSound("sendMail")).resolves.toBeUndefined();
  });
});