/**
 * Theme token contracts.
 *
 * SOLID mapping:
 * - Interface Segregation: each design family (colors, typography, layout,
 *   effects, motion) is its own interface; ThemeTokens composes them.
 * - Dependency Inversion: styles and the applier depend on these
 *   abstractions (CSS custom-property names), never on a concrete theme's
 *   values. globals.css `@theme` is the static half of the same contract.
 * - Liskov Substitution: every ThemeTemplate must satisfy the full
 *   ThemeTokens contract for both modes, so any theme can replace any other
 *   without the rest of the app knowing or caring which one is active.
 */

export type ThemeMode = "light" | "dark";
export type ThemePreference = "light" | "dark" | "system";

/** Semantic palette: surfaces, text, borders, accent, feedback, chrome. */
export interface ColorTokens {
  /** App surfaces */
  bgPrimary: string;
  bgSecondary: string;
  bgTertiary: string;
  bgHover: string;
  bgSelected: string;
  /** Flat window surface the translucent panels sit on */
  appBg: string;
  /** Text */
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  /** Borders */
  borderPrimary: string;
  borderSecondary: string;
  /** Accent (primary control color + hover + tinted fill) */
  accent: string;
  accentHover: string;
  accentLight: string;
  /**
   * Foreground used on accent-filled controls (primary buttons, selected
   * pills). Chosen per accent per mode so text stays WCAG AA (>= 4.5:1);
   * bright accents carry dark ink, dark accents carry white.
   */
  onAccent: string;
  /** Feedback */
  danger: string;
  warning: string;
  success: string;
  /** Sidebar */
  sidebarBg: string;
  sidebarText: string;
  sidebarHover: string;
  sidebarActive: string;
  /** Workspace chrome: the shell/workspace color-mix bases and the canvas
   *  nav rail palette (title bar, nav rail over the shell). */
  shellMix: string;
  workspaceMix: string;
  canvasText: string;
  canvasHover: string;
  canvasActive: string;
}

export interface TypographyTokens {
  /** Application font family stack */
  fontFamily: string;
  /**
   * Standard Tailwind font-size namespace (`text-*` utilities), each with
   * its line-height companion. A theme can restyle the whole UI type scale
   * from here.
   */
  sizes: {
    xs: { size: string; lineHeight: string };
    sm: { size: string; lineHeight: string };
    base: { size: string; lineHeight: string };
    lg: { size: string; lineHeight: string };
    xl: { size: string; lineHeight: string };
    "2xl": { size: string; lineHeight: string };
    "3xl": { size: string; lineHeight: string };
  };
}

export interface LayoutTokens {
  /**
   * Base spacing unit. Tailwind v4 derives every spacing utility
   * (p-2, gap-3, m-4, w-7, h-10, ...) from `--spacing`, so a single value
   * controls the density of the entire component layer.
   */
  spacing: string;
  /** App chrome radii used by globals.css component classes. */
  radiusPanel: string;
  radiusControl: string;
  radiusRail: string;
  radiusButton: string;
  /**
   * Standard Tailwind radii namespace (`rounded-*` utilities). A theme can
   * restyle every corner in the app from here.
   */
  radii: {
    xs: string;
    sm: string;
    md: string;
    lg: string;
    xl: string;
    "2xl": string;
    "3xl": string;
    "4xl": string;
  };
}

export interface EffectTokens {
  glassBlur: string;
  glassBlurHeavy: string;
  glassBorder: string;
  glassShadow: string;
  glassShadowElevated: string;
  glassHighlight: string;
  backdropBlurOverlay: string;
}

export interface MotionTokens {
  fast: string;
  normal: string;
  slow: string;
}

/** The full token contract a theme must satisfy (composed interfaces). */
export interface ThemeTokens {
  colors: ColorTokens;
  typography: TypographyTokens;
  layout: LayoutTokens;
  effects: EffectTokens;
  motion: MotionTokens;
}

/* ------------------------------------------------------------------ */
/* Layout & workflow — the part of a theme that rearranges the app.    */
/* ------------------------------------------------------------------ */

/**
 * Sidebar composition. "full" is the normal navigation panel; "rail" is a
 * compact icon-only toolbelt (the deep-tech / macOS-Mail persona).
 */
export type ThemeSidebarMode = "full" | "rail";

/**
 * Mail list density. "default" means "follow the theme"; the user's explicit
 * Settings choice overrides the theme value.
 */
export type ThemeDensity = "compact" | "default" | "spacious";

/** How an open thread is laid out by default (classic stack vs chat). */
export type ThemeThreadView = "classic" | "chat";

/** Which side the reading pane sits on. "left" mirrors the pane order. */
export type ThemeReadingPane = "right" | "left";

/**
 * Chrome level. "minimal" declutters reading-focused personas: category
 * tabs and the contact sidebar are hidden (categories stay reachable in the
 * sidebar's split-mode sub-list).
 */
export type ThemeChrome = "standard" | "minimal";

/** AI thread summary visibility ("off" hides it; "auto" = current default). */
export type ThemeAiSummary = "auto" | "off";

/**
 * The layout/workflow descriptor of a theme — what makes a role theme a
 * *redesign* and not an accent swap. The component layer reads the effective
 * layout (theme value, with explicit user settings taking precedence) and
 * rearranges itself: sidebar rail vs full nav, list density, thread view
 * mode, reading-pane side, chrome visibility and the AI summary.
 */
export interface ThemeLayout {
  /** Machine id, also written as `data-layout` on <html> for CSS hooks. */
  id: string;
  sidebar: ThemeSidebarMode;
  density: ThemeDensity;
  threadView: ThemeThreadView;
  readingPane: ThemeReadingPane;
  chrome: ThemeChrome;
  aiSummary: ThemeAiSummary;
}

/**
 * An external theme template. One object per theme; light and dark are the
 * same contract, so a theme is fully defined by two ThemeTokens.
 *
 * `id` doubles as the persisted setting value and the `data-theme` attribute.
 * `layout` is mode-independent: the same composition applies to light and
 * dark so switching modes never rearranges the UI.
 */
export interface ThemeTemplate {
  id: string;
  name: string;
  /** Hex shown in the accent picker */
  swatch: string;
  light: ThemeTokens;
  dark: ThemeTokens;
  layout: ThemeLayout;
}

/**
 * Selectable accent themes. Keeping this explicit (rather than deriving it
 * from the registry) lets the store type the persisted `color_theme` setting
 * statically; adding a theme means extending this union, the registry entry
 * and the template — all in src/themes/.
 */
export type ColorThemeId =
  | "indigo"
  | "rose"
  | "emerald"
  | "amber"
  | "sky"
  | "violet"
  | "orange"
  | "slate"
  | "sap-northstar"
  | "corporate-ceo"
  | "startup-ceo"
  | "deeptech-cto"
  | "academic"
  | "typewriter"
  | "studio"
  | "cupertino";