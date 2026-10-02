import { useMemo } from "react";
import { useUIStore } from "@/stores/uiStore";
import { getTheme } from "./registry";
import {
  resolveEffectiveLayout,
  type EffectiveLayout,
  type EffectiveLayoutInput,
  type ThemeLayout,
} from "./layout";

/**
 * The layout/workflow half of the active theme. Components that rearrange
 * themselves per persona (sidebar, list, thread view, reading pane, chrome)
 * read this instead of hardcoding a composition.
 *
 * `useThemeLayout` returns the raw descriptor of the active theme;
 * `useEffectiveLayout` folds the user's explicit Settings choices over it.
 */
export function useThemeLayout(): ThemeLayout {
  const colorTheme = useUIStore((s) => s.colorTheme);
  return useMemo(() => getTheme(colorTheme).layout, [colorTheme]);
}

export function useEffectiveLayout(): EffectiveLayout {
  const layout = useThemeLayout();
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);
  const emailDensity = useUIStore((s) => s.emailDensity);
  const threadViewMode = useUIStore((s) => s.threadViewMode);
  const readingPanePosition = useUIStore((s) => s.readingPanePosition);

  return useMemo(
    () =>
      resolveEffectiveLayout({
        layout,
        sidebarCollapsed,
        emailDensity,
        threadViewMode,
        readingPanePosition,
      } satisfies EffectiveLayoutInput),
    [layout, sidebarCollapsed, emailDensity, threadViewMode, readingPanePosition],
  );
}