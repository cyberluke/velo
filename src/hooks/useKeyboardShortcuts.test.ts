import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies needed for the hook to mount and dispatch events.
// The hook reads store state and calls navigate/emailActions — only mock
// what's needed for the three event-dispatch tests below.
const uiState = {
  inboxViewMode: "unified",
  settingsOpen: false,
  toggleSidebar: vi.fn(),
  toggleSettings: vi.fn(() => {
    uiState.settingsOpen = !uiState.settingsOpen;
  }),
};
vi.mock("@/stores/uiStore", () => ({
  useUIStore: { getState: () => uiState },
}));
const threadState = {
  threads: [] as Array<{ id: string; isRead?: boolean; accountId?: string }>,
  selectedThreadIds: new Set<string>(),
  removeThread: vi.fn(),
  removeThreads: vi.fn(),
  updateThread: vi.fn(),
  clearMultiSelect: vi.fn(),
  selectAll: vi.fn(),
  selectAllFromHere: vi.fn(),
};
vi.mock("@/stores/threadStore", () => ({
  useThreadStore: { getState: () => threadState },
}));
const composerState = {
  isOpen: false,
  openComposer: vi.fn(),
  closeComposer: vi.fn(),
};
const defaultKeyMap = {
  "app.askInbox": "i",
  "app.commandPalette": "/",
  "app.toggleSidebar": "Ctrl+Shift+E",
  "app.settings": "Ctrl+,",
  "app.help": "?",
  "action.selectAll": "Ctrl+A",
  "action.archive": "e",
  "action.toggleRead": "n",
  "nav.escape": "Escape",
};
let shortcutKeyMap = { ...defaultKeyMap };
vi.mock("@/stores/composerStore", () => ({
  useComposerStore: { getState: () => composerState },
}));
const accountState = {
  activeAccountId: null as string | null,
};
vi.mock("@/stores/accountStore", () => ({
  useAccountStore: { getState: () => ({ activeAccountId: accountState.activeAccountId }) },
}));
vi.mock("@/stores/shortcutStore", () => ({
  useShortcutStore: {
    getState: () => ({
      keyMap: shortcutKeyMap,
    }),
  },
}));
vi.mock("@/stores/contextMenuStore", () => ({
  useContextMenuStore: { getState: () => ({ menuType: null, closeMenu: vi.fn() }) },
}));
vi.mock("@/router/navigate", () => ({
  navigateToLabel: vi.fn(),
  navigateToThread: vi.fn(),
  navigateBack: vi.fn(),
  getActiveLabel: () => "inbox",
  getSelectedThreadId: () => null,
}));
vi.mock("@/services/emailActions", () => ({
  archiveThread: vi.fn(),
  trashThread: vi.fn(),
  permanentDeleteThread: vi.fn(),
  starThread: vi.fn(),
  spamThread: vi.fn(),
  markThreadRead: vi.fn(),
}));
vi.mock("@/services/db/threads", () => ({
  deleteThread: vi.fn(),
  pinThread: vi.fn(),
  unpinThread: vi.fn(),
  muteThread: vi.fn(),
  unmuteThread: vi.fn(),
}));
vi.mock("@/services/gmail/draftDeletion", () => ({ deleteDraftsForThread: vi.fn() }));
vi.mock("@/services/gmail/tokenManager", () => ({ getGmailClient: vi.fn() }));
vi.mock("@/services/db/messages", () => ({ getMessagesForThread: vi.fn() }));
vi.mock("@/components/email/MessageItem", () => ({ parseUnsubscribeUrl: vi.fn() }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));
vi.mock("@/services/gmail/syncManager", () => ({ triggerSync: vi.fn() }));

import { renderHook } from "@testing-library/react";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";
import { markThreadRead } from "@/services/emailActions";

describe("useKeyboardShortcuts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uiState.settingsOpen = false;
    composerState.isOpen = false;
    shortcutKeyMap = { ...defaultKeyMap };
    threadState.threads = [];
    threadState.selectedThreadIds = new Set();
    accountState.activeAccountId = null;
  });

  it("dispatches naiemail-toggle-ask-inbox when 'i' is pressed", () => {
    renderHook(() => useKeyboardShortcuts());

    const listener = vi.fn();
    window.addEventListener("naiemail-toggle-ask-inbox", listener);

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "i", bubbles: true }),
    );

    expect(listener).toHaveBeenCalledTimes(1);

    window.removeEventListener("naiemail-toggle-ask-inbox", listener);
  });

  it("dispatches an action rebound to Cmd+Shift+letter", () => {
    shortcutKeyMap = { ...defaultKeyMap, "app.askInbox": "Cmd+Shift+I" };
    renderHook(() => useKeyboardShortcuts());

    const listener = vi.fn();
    window.addEventListener("naiemail-toggle-ask-inbox", listener);

    window.dispatchEvent(new KeyboardEvent("keydown", {
      key: "i",
      metaKey: true,
      shiftKey: true,
      bubbles: true,
    }));

    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener("naiemail-toggle-ask-inbox", listener);
  });

  it("dispatches an action rebound to an Alt combination", () => {
    shortcutKeyMap = { ...defaultKeyMap, "app.askInbox": "Alt+I" };
    renderHook(() => useKeyboardShortcuts());

    const listener = vi.fn();
    window.addEventListener("naiemail-toggle-ask-inbox", listener);

    window.dispatchEvent(new KeyboardEvent("keydown", {
      key: "i",
      altKey: true,
      bubbles: true,
    }));

    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener("naiemail-toggle-ask-inbox", listener);
  });

  it("dispatches naiemail-toggle-command-palette when '/' is pressed", () => {
    renderHook(() => useKeyboardShortcuts());

    const listener = vi.fn();
    window.addEventListener("naiemail-toggle-command-palette", listener);

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "/", bubbles: true }),
    );

    expect(listener).toHaveBeenCalledTimes(1);

    window.removeEventListener("naiemail-toggle-command-palette", listener);
  });

  it("dispatches naiemail-toggle-shortcuts-help when '?' is pressed", () => {
    renderHook(() => useKeyboardShortcuts());

    const listener = vi.fn();
    window.addEventListener("naiemail-toggle-shortcuts-help", listener);

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "?", shiftKey: true, bubbles: true }),
    );

    expect(listener).toHaveBeenCalledTimes(1);

    window.removeEventListener("naiemail-toggle-shortcuts-help", listener);
  });

  it("toggles the settings dialog on Ctrl+,", () => {
    renderHook(() => useKeyboardShortcuts());

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: ",", ctrlKey: true, bubbles: true }),
    );

    expect(uiState.toggleSettings).toHaveBeenCalledTimes(1);
    expect(uiState.settingsOpen).toBe(true);
  });

  it("toggles the settings dialog on Cmd+, (meta key)", () => {
    renderHook(() => useKeyboardShortcuts());

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: ",", metaKey: true, bubbles: true }),
    );

    expect(uiState.toggleSettings).toHaveBeenCalledTimes(1);
  });

  it("closes the settings dialog when the binding is pressed again", () => {
    uiState.settingsOpen = true;
    renderHook(() => useKeyboardShortcuts());

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: ",", metaKey: true, bubbles: true }),
    );

    expect(uiState.toggleSettings).toHaveBeenCalledTimes(1);
    expect(uiState.settingsOpen).toBe(false);
  });

  it("suppresses mail shortcuts while the settings dialog is open", () => {
    uiState.settingsOpen = true;
    renderHook(() => useKeyboardShortcuts());

    const listener = vi.fn();
    window.addEventListener("naiemail-toggle-ask-inbox", listener);

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "i", bubbles: true }),
    );

    expect(listener).not.toHaveBeenCalled();

    window.removeEventListener("naiemail-toggle-ask-inbox", listener);
  });

  it("selects every thread on Ctrl+A in the mail list", () => {
    renderHook(() => useKeyboardShortcuts());

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "a", ctrlKey: true, bubbles: true }),
    );

    expect(threadState.selectAll).toHaveBeenCalledTimes(1);
  });

  it("leaves Ctrl+A alone while the composer is open", () => {
    // The message being written is what "select all" means there — this once
    // selected every thread behind the composer instead
    composerState.isOpen = true;
    renderHook(() => useKeyboardShortcuts());

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "a", metaKey: true, bubbles: true }),
    );

    expect(threadState.selectAll).not.toHaveBeenCalled();
  });

  it("leaves Ctrl+A alone while typing in an input", () => {
    renderHook(() => useKeyboardShortcuts());

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "a", metaKey: true, bubbles: true }),
    );

    expect(threadState.selectAll).not.toHaveBeenCalled();
    input.remove();
  });

  it("suppresses mail shortcuts while the composer is open", () => {
    composerState.isOpen = true;
    renderHook(() => useKeyboardShortcuts());

    const listener = vi.fn();
    window.addEventListener("naiemail-toggle-ask-inbox", listener);

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "i", bubbles: true }),
    );

    expect(listener).not.toHaveBeenCalled();

    window.removeEventListener("naiemail-toggle-ask-inbox", listener);
  });

  it("still closes the composer on Escape", () => {
    composerState.isOpen = true;
    renderHook(() => useKeyboardShortcuts());

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );

    expect(composerState.closeComposer).toHaveBeenCalledTimes(1);
  });

  describe("action.toggleRead (n)", () => {
    const pressToggleReadKey = () => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "n", bubbles: true }),
      );
    };

    it("marks all selected threads read when any is unread", () => {
      accountState.activeAccountId = "acc1";
      threadState.threads = [
        { id: "t1", isRead: true },
        { id: "t2", isRead: false },
        { id: "t3", isRead: false },
      ];
      threadState.selectedThreadIds = new Set(["t1", "t2", "t3"]);
      renderHook(() => useKeyboardShortcuts());

      pressToggleReadKey();

      // Only threads whose state differs are updated (t1 is already read)
      expect(markThreadRead).toHaveBeenCalledTimes(2);
      expect(markThreadRead).toHaveBeenCalledWith("acc1", "t2", [], true);
      expect(markThreadRead).toHaveBeenCalledWith("acc1", "t3", [], true);
    });

    it("marks all selected threads unread when all are read", () => {
      accountState.activeAccountId = "acc1";
      threadState.threads = [
        { id: "t1", isRead: true },
        { id: "t2", isRead: true },
      ];
      threadState.selectedThreadIds = new Set(["t1", "t2"]);
      renderHook(() => useKeyboardShortcuts());

      pressToggleReadKey();

      expect(markThreadRead).toHaveBeenCalledTimes(2);
      expect(markThreadRead).toHaveBeenCalledWith("acc1", "t1", [], false);
      expect(markThreadRead).toHaveBeenCalledWith("acc1", "t2", [], false);
    });

    it("does nothing with no selection and no open thread", () => {
      accountState.activeAccountId = "acc1";
      renderHook(() => useKeyboardShortcuts());

      pressToggleReadKey();

      expect(markThreadRead).not.toHaveBeenCalled();
    });

    it("does nothing without an active account", () => {
      threadState.threads = [{ id: "t1", isRead: false }];
      threadState.selectedThreadIds = new Set(["t1"]);
      renderHook(() => useKeyboardShortcuts());

      pressToggleReadKey();

      expect(markThreadRead).not.toHaveBeenCalled();
    });
  });
});
