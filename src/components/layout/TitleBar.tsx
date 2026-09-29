import { useState, useEffect } from "react";
import { getCurrentWindow, type Window } from "@tauri-apps/api/window";
import { Minus, Square, Copy, X } from "lucide-react";
import { useHistoryNav } from "@/hooks/useHistoryNav";
import { useI18n } from "@/i18n";

/** Vite in a normal browser has no `__TAURI_INTERNALS__.metadata`. */
function currentWindow(): Window | null {
  try {
    return getCurrentWindow();
  } catch {
    return null;
  }
}

export function WindowControls() {
  const [maximized, setMaximized] = useState(false);
  const { back, forward, canGoBack } = useHistoryNav();
  const { t } = useI18n();

  useEffect(() => {
    const appWindow = currentWindow();
    if (!appWindow) return;
    appWindow.isMaximized().then(setMaximized);

    let unlisten: (() => void) | undefined;
    appWindow.onResized(() => {
      appWindow.isMaximized().then(setMaximized);
    }).then((fn) => { unlisten = fn; });

    return () => { unlisten?.(); };
  }, []);

  const handleMinimize = () => { void currentWindow()?.minimize(); };
  const handleMaximize = () => { void currentWindow()?.toggleMaximize(); };
  const handleClose = () => { void currentWindow()?.close(); };

  return (
    <div
      className="win-caption flex h-12 shrink-0 items-stretch select-none"
      aria-label="Window controls"
    >
      <button
        type="button"
        onClick={handleMinimize}
        title={t("window.minimize")}
        className="win-caption-btn"
        aria-label={t("window.minimize")}
      >
        <Minus size={12} strokeWidth={1.75} />
      </button>
      <button
        type="button"
        onClick={handleMaximize}
        title={maximized ? t("window.restore") : t("window.maximize")}
        className="win-caption-btn"
        aria-label={maximized ? t("window.restore") : t("window.maximize")}
      >
        {maximized ? <Copy size={11} strokeWidth={1.75} /> : <Square size={11} strokeWidth={1.75} />}
      </button>
      <button
        type="button"
        onClick={handleClose}
        title={t("window.close")}
        className="win-caption-btn win-caption-close"
        aria-label={t("window.close")}
      >
        <X size={13} strokeWidth={1.75} />
      </button>
      <div className="sr-only">
        <button onClick={back} disabled={!canGoBack}>{t("toolbar.back")}</button>
        <button onClick={forward}>{t("toolbar.forward")}</button>
      </div>
    </div>
  );
}

/** Backward-compatible export for pop-out surfaces that still import it. */
export const TitleBar = WindowControls;
