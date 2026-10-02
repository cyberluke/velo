import type {
  ThemeAiSummary,
  ThemeChrome,
  ThemeDensity,
  ThemeLayout,
  ThemeReadingPane,
  ThemeSidebarMode,
  ThemeThreadView,
} from "./types";

/**
 * Layout & workflow resolution — the pure half of the role-theme redesign.
 *
 * Two ownership layers:
 * - **Store-owned dimensions** (density, thread view): picking a role theme
 *   folds its defaults into the persisted settings via `setColorTheme`
 *   (only when the user has no explicit choice). After that the store is the
 *   single source of truth, so toggles in the UI always work.
 * - **Theme-only dimensions** (sidebar rail, reading-pane side, chrome
 *   level, AI summary): resolved here at render time — no user setting
 *   exists for them, so the theme decides.
 *
 * Reading-pane precedence: the user's explicit non-default position
 * (bottom/hidden) wins; the theme's `left` applies only while the stored
 * position is the app default (`right`).
 */

export const STANDARD_LAYOUT: ThemeLayout = {
  id: "standard",
  sidebar: "full",
  density: "default",
  threadView: "classic",
  readingPane: "right",
  chrome: "standard",
  aiSummary: "auto",
};

/** Stored user settings that participate in the precedence rules. */
export interface EffectiveLayoutInput {
  layout: ThemeLayout;
  sidebarCollapsed: boolean;
  /** The persisted reading-pane position (right/bottom/hidden). */
  readingPanePosition: "right" | "bottom" | "hidden";
}

/** What the component layer should actually render. */
export interface EffectiveLayout {
  layout: ThemeLayout;
  /** Rail themes are always collapsed — the rail *is* the sidebar. */
  sidebarCollapsed: boolean;
  railSidebar: boolean;
  /** "left" is theme-only; bottom/hidden come from the user's setting. */
  readingPane: ThemeReadingPane | "bottom" | "hidden";
  showCategoryTabs: boolean;
  showContactSidebar: boolean;
  showAiSummary: boolean;
}

export function resolveEffectiveLayout(input: EffectiveLayoutInput): EffectiveLayout {
  const { layout } = input;
  const railSidebar = layout.sidebar === "rail";
  return {
    layout,
    sidebarCollapsed: railSidebar ? true : input.sidebarCollapsed,
    railSidebar,
    readingPane: input.readingPanePosition !== "right" ? input.readingPanePosition : layout.readingPane,
    showCategoryTabs: layout.chrome === "standard",
    showContactSidebar: layout.chrome === "standard",
    showAiSummary: layout.aiSummary !== "off",
  };
}

export type { ThemeAiSummary, ThemeChrome, ThemeDensity, ThemeLayout, ThemeReadingPane, ThemeSidebarMode, ThemeThreadView };