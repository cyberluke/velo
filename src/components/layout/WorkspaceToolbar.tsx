import { ChevronRight, Plus } from "lucide-react";
import { AccountSwitcher } from "../accounts/AccountSwitcher";
import { useComposerStore } from "@/stores/composerStore";
import { useHistoryNav } from "@/hooks/useHistoryNav";
import { SearchBar } from "../search/SearchBar";
import { WindowControls } from "./TitleBar";
import { useI18n } from "@/i18n";

interface WorkspaceToolbarProps {
  onAddAccount: () => void;
}

export function WorkspaceToolbar({ onAddAccount }: WorkspaceToolbarProps) {
  const openComposer = useComposerStore((s) => s.openComposer);
  const { back, forward, canGoBack } = useHistoryNav();
  const { t } = useI18n();

  return (
    <header className="workspace-toolbar flex h-12 shrink-0 items-stretch gap-2 pl-3" data-tauri-drag-region>
      <div className="flex min-w-0 flex-1 items-center gap-2 py-1.5" data-tauri-drag-region>
        <div className="w-52 shrink-0">
          <AccountSwitcher collapsed={false} onAddAccount={onAddAccount} />
        </div>
        <button
          onClick={() => openComposer()}
          className="toolbar-compose interactive-btn flex shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium"
        >
          <Plus size={16} />
          {t("toolbar.compose")}
        </button>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            onClick={back}
            disabled={!canGoBack}
            title={t("toolbar.back")}
            className="toolbar-icon-button"
          >
            <ChevronRight size={17} className="rotate-180" />
          </button>
          <button onClick={forward} title={t("toolbar.forward")} className="toolbar-icon-button">
            <ChevronRight size={17} />
          </button>
        </div>
        <div className="min-w-0 max-w-xl flex-1" data-tauri-drag-region={undefined}>
          <SearchBar />
        </div>
      </div>
      <WindowControls />
    </header>
  );
}
