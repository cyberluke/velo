import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { CSSTransition } from "react-transition-group";
import { useUIStore } from "@/stores/uiStore";
import { useComposerStore } from "@/stores/composerStore";
import { useThreadStore } from "@/stores/threadStore";
import { useAccountStore } from "@/stores/accountStore";
import { getGmailClient } from "@/services/gmail/tokenManager";
import { markThreadRead } from "@/services/emailActions";
import { getTemplatesForAccount, type DbTemplate } from "@/services/db/templates";
import { useActiveLabel } from "@/hooks/useRouteNavigation";
import { navigateToLabel, navigateToSettings, navigateBack, getSelectedThreadId } from "@/router/navigate";
import { useI18n } from "@/i18n";

interface Command {
  id: string;
  labelKey: string;
  shortcut?: string;
  categoryKey: string;
  templateName?: string;
  action: () => void;
}

function commandLabel(cmd: Command, t: (key: string) => string): string {
  if (cmd.templateName) return t(cmd.labelKey).replace("{name}", cmd.templateName);
  return t(cmd.labelKey);
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const setTheme = useUIStore((s) => s.setTheme);
  const openComposer = useComposerStore((s) => s.openComposer);
  const activeLabel = useActiveLabel();
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const [templates, setTemplates] = useState<DbTemplate[]>([]);
  const { t } = useI18n();

  useEffect(() => {
    if (!isOpen || !activeAccountId) return;
    getTemplatesForAccount(activeAccountId).then(setTemplates);
  }, [isOpen, activeAccountId]);

  const commands: Command[] = useMemo(() => [
    // Navigation
    { id: "go-inbox", labelKey: "command.goInbox", shortcut: "g i", categoryKey: "command.cat.navigation", action: () => { navigateToLabel("inbox"); onClose(); } },
    { id: "go-starred", labelKey: "command.goStarred", shortcut: "g s", categoryKey: "command.cat.navigation", action: () => { navigateToLabel("starred"); onClose(); } },
    { id: "go-sent", labelKey: "command.goSent", shortcut: "g t", categoryKey: "command.cat.navigation", action: () => { navigateToLabel("sent"); onClose(); } },
    { id: "go-drafts", labelKey: "command.goDrafts", shortcut: "g d", categoryKey: "command.cat.navigation", action: () => { navigateToLabel("drafts"); onClose(); } },
    { id: "go-snoozed", labelKey: "command.goSnoozed", categoryKey: "command.cat.navigation", action: () => { navigateToLabel("snoozed"); onClose(); } },
    { id: "go-trash", labelKey: "command.goTrash", categoryKey: "command.cat.navigation", action: () => { navigateToLabel("trash"); onClose(); } },
    { id: "go-all", labelKey: "command.goAll", categoryKey: "command.cat.navigation", action: () => { navigateToLabel("all"); onClose(); } },

    // Actions
    { id: "compose", labelKey: "command.compose", shortcut: "c", categoryKey: "command.cat.actions", action: () => { openComposer(); onClose(); } },
    { id: "deselect", labelKey: "command.closeThread", shortcut: "Esc", categoryKey: "command.cat.actions", action: () => { navigateBack(); onClose(); } },
    { id: "toggle-read", labelKey: "command.toggleRead", shortcut: "n", categoryKey: "command.cat.actions", action: async () => {
      onClose();
      const selectedId = getSelectedThreadId();
      const accountId = useAccountStore.getState().activeAccountId;
      if (!selectedId || !accountId) return;
      const thread = useThreadStore.getState().threads.find((t) => t.id === selectedId);
      if (!thread) return;
      try {
        await markThreadRead(thread.accountId ?? accountId, selectedId, [], !thread.isRead);
      } catch (err) {
        console.error("Toggle read action failed:", err);
      }
    } },
    { id: "spam", labelKey: activeLabel === "spam" ? "command.notSpam" : "command.reportSpam", shortcut: "!", categoryKey: "command.cat.actions", action: async () => {
      onClose();
      const selectedId = getSelectedThreadId();
      const accountId = useAccountStore.getState().activeAccountId;
      if (!selectedId || !accountId) return;
      try {
        const client = await getGmailClient(accountId);
        if (activeLabel === "spam") {
          await client.modifyThread(selectedId, ["INBOX"], ["SPAM"]);
        } else {
          await client.modifyThread(selectedId, ["SPAM"], ["INBOX"]);
        }
        useThreadStore.getState().removeThread(selectedId);
      } catch (err) {
        console.error("Spam action failed:", err);
      }
    } },

    // Tasks
    { id: "task-create", labelKey: "command.createTask", categoryKey: "command.cat.tasks", action: () => {
      onClose();
      useUIStore.getState().setTaskSidebarVisible(true);
    } },
    { id: "task-extract", labelKey: "command.taskExtract", shortcut: "t", categoryKey: "command.cat.tasks", action: () => {
      onClose();
      const threadId = getSelectedThreadId();
      if (threadId) {
        window.dispatchEvent(new CustomEvent("naiemail-extract-task", { detail: { threadId } }));
      }
    } },
    { id: "task-view", labelKey: "command.viewTasks", shortcut: "g k", categoryKey: "command.cat.tasks", action: () => { navigateToLabel("tasks"); onClose(); } },
    { id: "task-toggle-panel", labelKey: "command.toggleTaskPanel", categoryKey: "command.cat.tasks", action: () => { useUIStore.getState().toggleTaskSidebar(); onClose(); } },

    // AI
    { id: "ask-ai", labelKey: "command.askAi", categoryKey: "command.cat.ai", action: () => { onClose(); window.dispatchEvent(new Event("naiemail-toggle-ask-inbox")); } },

    // Settings
    { id: "open-settings", labelKey: "command.openSettings", shortcut: "Ctrl+,", categoryKey: "command.cat.settings", action: () => { onClose(); navigateToSettings(); } },
    { id: "open-settings-accounts", labelKey: "command.openSettingsAccounts", categoryKey: "command.cat.settings", action: () => { onClose(); navigateToSettings("accounts"); } },
    { id: "add-account", labelKey: "command.addAccount", categoryKey: "command.cat.settings", action: () => { onClose(); useUIStore.getState().requestAddAccount(); } },
    { id: "toggle-sidebar", labelKey: "command.toggleSidebar", shortcut: "Ctrl+Shift+E", categoryKey: "command.cat.settings", action: () => { toggleSidebar(); onClose(); } },
    { id: "theme-light", labelKey: "command.themeLight", categoryKey: "command.cat.settings", action: () => { setTheme("light"); onClose(); } },
    { id: "theme-dark", labelKey: "command.themeDark", categoryKey: "command.cat.settings", action: () => { setTheme("dark"); onClose(); } },
    { id: "theme-system", labelKey: "command.themeSystem", categoryKey: "command.cat.settings", action: () => { setTheme("system"); onClose(); } },

    // Templates
    ...templates.map((tmpl) => ({
      id: `template-${tmpl.id}`,
      labelKey: "command.insertTemplate",
      categoryKey: "command.cat.templates",
      templateName: tmpl.name,
      action: () => {
        openComposer({
          mode: "new" as const,
          to: [],
          subject: tmpl.subject ?? "",
          bodyHtml: tmpl.body_html,
        });
        onClose();
      },
    })),
  ], [onClose, openComposer, activeLabel, toggleSidebar, setTheme, templates]);

  const filtered = query
    ? commands.filter(
        (c) =>
          commandLabel(c, t).toLowerCase().includes(query.toLowerCase()) ||
          t(c.categoryKey).toLowerCase().includes(query.toLowerCase()),
      )
    : commands;

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((p) => Math.min(p + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((p) => Math.max(p - 1, 0));
      } else if (e.key === "Enter" && filtered[selectedIdx]) {
        filtered[selectedIdx].action();
      } else if (e.key === "Escape") {
        onClose();
      }
    },
    [filtered, selectedIdx, onClose],
  );

  // Build index map and group by category
  const filteredIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((cmd, idx) => map.set(cmd.id, idx));
    return map;
  }, [filtered]);
  const categories = useMemo(() => [...new Set(filtered.map((c) => c.categoryKey))], [filtered]);

  return (
    <CSSTransition nodeRef={overlayRef} in={isOpen} timeout={200} classNames="modal" unmountOnExit>
    <div ref={overlayRef} className="fixed inset-0 z-[60] flex items-start justify-center pt-[15vh]">
      <div className="absolute inset-0 bg-black/30 glass-backdrop" onClick={onClose} />
      <div className="relative bg-bg-primary border border-border-primary rounded-lg glass-modal w-full max-w-lg overflow-hidden modal-panel">
        {/* Input */}
        <div className="px-4 py-3 border-b border-border-primary">
          <input
            ref={inputRef}
            autoFocus
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIdx(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder={t("commandPalette.placeholder")}
            className="w-full bg-transparent text-sm text-text-primary outline-none placeholder:text-text-tertiary"
          />
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-text-tertiary">
              {t("commandPalette.noCommands")}
            </div>
          ) : (
            categories.map((catKey) => (
              <div key={catKey}>
                <div className="px-4 py-1 text-[0.625rem] font-semibold uppercase tracking-wider text-text-tertiary">
                  {t(catKey)}
                </div>
                {filtered
                  .filter((c) => c.categoryKey === catKey)
                  .map((cmd) => {
                    const globalIdx = filteredIndexMap.get(cmd.id) ?? -1;
                    return (
                      <button
                        key={cmd.id}
                        onClick={cmd.action}
                        className={`w-full text-left px-4 py-2 flex items-center justify-between hover:bg-bg-hover text-sm ${
                          globalIdx === selectedIdx ? "bg-bg-hover" : ""
                        }`}
                      >
                        <span className="text-text-primary">{commandLabel(cmd, t)}</span>
                        {cmd.shortcut && (
                          <kbd className="text-[0.625rem] text-text-tertiary bg-bg-tertiary px-1.5 py-0.5 rounded">
                            {cmd.shortcut}
                          </kbd>
                        )}
                      </button>
                    );
                  })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
    </CSSTransition>
  );
}
