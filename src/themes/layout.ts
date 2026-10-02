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
 * A theme's `layout` describes its intended composition (sidebar rail vs full
 * nav, density, thread view, reading-pane side, chrome level, AI summary).
 * The app layer never reads a theme layout directly: it goes through
 * `resolveEffectiveLayout`, which applies the theme value as the *default*
 * and lets the user's explicit Settings choices win where one exists.
 *
 * Rule of precedence:
 * - sidebar: a "rail" theme forces the collapsed rail (it is the persona);
 * - density / thread view / reading-pane side: the user's non-default stored
 *   choice wins, otherwise the theme value applies — so switching themes
 *   rearranges the UI unless the user already picked something deliberately;
 * - chrome / AI summary: theme-only (no user setting exists).
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
  emailDensity: "compact" | "default" | "spacious";
  threadViewMode: "classic" | "chat";
  /** The persisted reading-pane position (right/bottom/hidden). */
  readingPanePosition: "right" | "bottom" | "hidden";
}

/** What the component layer should actually render. */
export interface EffectiveLayout {
  layout: ThemeLayout;
  /** Rail themes are always collapsed — the rail *is* the sidebar. */
  sidebarCollapsed: boolean;
  railSidebar: boolean;
  density: ThemeDensity;
  threadView: ThemeThreadView;
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
    density: input.emailDensity !== "default" ? input.emailDensity : layout.density,
    threadView: input.threadViewMode !== "classic" ? input.threadViewMode : layout.threadView,
    readingPane: input.readingPanePosition !== "right" ? input.readingPanePosition : layout.readingPane,
    showCategoryTabs: layout.chrome === "standard",
    showContactSidebar: layout.chrome === "standard",
    showAiSummary: layout.aiSummary !== "off",
  };
}

export type { ThemeAiSummary, ThemeChrome, ThemeDensity, ThemeLayout, ThemeReadingPane, ThemeSidebarMode, ThemeThreadView };