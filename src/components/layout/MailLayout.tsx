import { useCallback, useRef } from "react";
import { EmailList } from "./EmailList";
import { ReadingPane } from "./ReadingPane";
import { useUIStore } from "@/stores/uiStore";
import { useEffectiveLayout } from "@/themes";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";

/**
 * The mail tri-pane. Which side the reading pane sits on comes from the
 * effective layout: the user's explicit Settings choice wins, otherwise the
 * active theme decides (role themes can mirror the whole composition — e.g.
 * the Underwood editorial layout puts the reading pane on the left, like a
 * manuscript with the mail pile on the right).
 */
function ResizableEmailLayout({ paneSide }: { paneSide: "right" | "left" }) {
  const emailListWidth = useUIStore((s) => s.emailListWidth);
  const setEmailListWidth = useUIStore((s) => s.setEmailListWidth);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = listRef.current?.offsetWidth ?? emailListWidth;

    const handleMouseMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX;
      const newWidth = Math.min(1200, Math.max(240, startWidth + delta));
      if (listRef.current) listRef.current.style.width = `${newWidth}px`;
    };

    const handleMouseUp = (ev: MouseEvent) => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      const delta = ev.clientX - startX;
      const finalWidth = Math.min(1200, Math.max(240, startWidth + delta));
      setEmailListWidth(finalWidth);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [emailListWidth, setEmailListWidth]);

  if (paneSide === "left") {
    return (
      <div ref={containerRef} className="workspace-canvas flex flex-1 min-w-0 flex-row gap-2 pb-2 pl-2 pr-0 pt-0">
        <ReadingPane />
        <div
          onMouseDown={handleMouseDown}
          className="w-1 cursor-col-resize rounded-full bg-transparent hover:bg-accent/35 active:bg-accent transition-colors shrink-0 my-8"
        />
        <EmailList width={emailListWidth} listRef={listRef} />
      </div>
    );
  }

  return (
    <div ref={containerRef} className="workspace-canvas flex flex-1 min-w-0 flex-row gap-2 pb-2 pl-0 pr-2 pt-0">
      <EmailList width={emailListWidth} listRef={listRef} />
      <div
        onMouseDown={handleMouseDown}
        className="w-1 cursor-col-resize rounded-full bg-transparent hover:bg-accent/35 active:bg-accent transition-colors shrink-0 my-8"
      />
      <ReadingPane />
    </div>
  );
}

export function MailLayout() {
  // Theme-only "left" resolves through the effective layout; bottom/hidden
  // are the user's explicit Settings choices and always win.
  const { readingPane: effectivePane } = useEffectiveLayout();

  if (effectivePane === "right") {
    return (
      <ErrorBoundary name="EmailLayout">
        <ResizableEmailLayout paneSide="right" />
      </ErrorBoundary>
    );
  }

  if (effectivePane === "left") {
    return (
      <ErrorBoundary name="EmailLayout">
        <ResizableEmailLayout paneSide="left" />
      </ErrorBoundary>
    );
  }

  return (
    <div className={`workspace-canvas flex flex-1 min-w-0 gap-2 p-2 pt-0 ${effectivePane === "bottom" ? "flex-col" : "flex-row"}`}>
      <ErrorBoundary name="EmailList">
        <EmailList />
      </ErrorBoundary>
      {effectivePane !== "hidden" && (
        <ErrorBoundary name="ReadingPane">
          <ReadingPane />
        </ErrorBoundary>
      )}
    </div>
  );
}
