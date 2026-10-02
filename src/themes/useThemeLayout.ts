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
 * themselves per persona (sidebar, reading pane, chrome, AI summary) read
 * this instead of hardcoding a composition.
 *
 * `useThemeLayout` returns the raw descriptor of the active theme;
 * `useEffectiveLayout` resolves the theme-only dimensions (sidebar rail,
 * reading-pane side, chrome level, AI summary). Density and thread view are
 * deliberately absent here: picking a role theme folds its defaults into the
 * persisted settings (`setColorTheme` in uiStore), so the store owns them and
 * every UI toggle keeps working.
 */
export function useThemeLayout(): ThemeLayout {
  const colorTheme = useUIStore((s) => s.colorTheme);
  return useMemo(() => getTheme(colorTheme).layout, [colorTheme]);
}

export function useEffectiveLayout(): EffectiveLayout {
  const layout = useThemeLayout();
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);
  const readingPanePosition = useUIStore((s) => s.readingPanePosition);

  return useMemo(
    () =>
      resolveEffectiveLayout({
        layout,
        sidebarCollapsed,
        readingPanePosition,
      } satisfies EffectiveLayoutInput),
    [layout, sidebarCollapsed, readingPanePosition],
  );
}
