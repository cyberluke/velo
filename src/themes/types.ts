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

/**
 * An external theme template. One object per theme; light and dark are the
 * same contract, so a theme is fully defined by two ThemeTokens.
 *
 * `id` doubles as the persisted setting value and the `data-theme` attribute.
 */
export interface ThemeTemplate {
  id: string;
  name: string;
  /** Hex shown in the accent picker */
  swatch: string;
  light: ThemeTokens;
  dark: ThemeTokens;
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
  | "slate";