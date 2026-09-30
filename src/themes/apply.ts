import type {
  ColorTokens,
  EffectTokens,
  LayoutTokens,
  MotionTokens,
  ThemeMode,
  ThemePreference,
  ThemeTemplate,
  ThemeTokens,
  TypographyTokens,
} from "./types";

/**
 * Theme applier — the only place CSS custom properties are written.
 *
 * Single Responsibility: converting a ThemeTemplate into concrete
 * `--token` values on the document root. It depends on the ThemeTokens
 * contract (Dependency Inversion), never on a specific theme, so any
 * registered template can be applied.
 */

function colorVars(colors: ColorTokens): Record<string, string> {
  return {
    "--color-bg-primary": colors.bgPrimary,
    "--color-bg-secondary": colors.bgSecondary,
    "--color-bg-tertiary": colors.bgTertiary,
    "--color-bg-hover": colors.bgHover,
    "--color-bg-selected": colors.bgSelected,
    "--color-app-bg": colors.appBg,
    "--color-text-primary": colors.textPrimary,
    "--color-text-secondary": colors.textSecondary,
    "--color-text-tertiary": colors.textTertiary,
    "--color-border-primary": colors.borderPrimary,
    "--color-border-secondary": colors.borderSecondary,
    "--color-accent": colors.accent,
    "--color-accent-hover": colors.accentHover,
    "--color-accent-light": colors.accentLight,
    "--color-danger": colors.danger,
    "--color-warning": colors.warning,
    "--color-success": colors.success,
    "--color-sidebar-bg": colors.sidebarBg,
    "--color-sidebar-text": colors.sidebarText,
    "--color-sidebar-hover": colors.sidebarHover,
    "--color-sidebar-active": colors.sidebarActive,
    "--color-shell-mix": colors.shellMix,
    "--color-workspace-mix": colors.workspaceMix,
    "--color-canvas-text": colors.canvasText,
    "--color-canvas-hover": colors.canvasHover,
    "--color-canvas-active": colors.canvasActive,
  };
}

function typographyVars(t: TypographyTokens): Record<string, string> {
  return {
    "--font-app": t.fontFamily,
    "--text-xs": t.sizes.xs.size,
    "--text-xs--line-height": t.sizes.xs.lineHeight,
    "--text-sm": t.sizes.sm.size,
    "--text-sm--line-height": t.sizes.sm.lineHeight,
    "--text-base": t.sizes.base.size,
    "--text-base--line-height": t.sizes.base.lineHeight,
    "--text-lg": t.sizes.lg.size,
    "--text-lg--line-height": t.sizes.lg.lineHeight,
    "--text-xl": t.sizes.xl.size,
    "--text-xl--line-height": t.sizes.xl.lineHeight,
    "--text-2xl": t.sizes["2xl"].size,
    "--text-2xl--line-height": t.sizes["2xl"].lineHeight,
    "--text-3xl": t.sizes["3xl"].size,
    "--text-3xl--line-height": t.sizes["3xl"].lineHeight,
  };
}

function layoutVars(l: LayoutTokens): Record<string, string> {
  return {
    "--spacing": l.spacing,
    "--radius-panel": l.radiusPanel,
    "--radius-control": l.radiusControl,
    "--radius-rail": l.radiusRail,
    "--radius-button": l.radiusButton,
    "--radius-xs": l.radii.xs,
    "--radius-sm": l.radii.sm,
    "--radius-md": l.radii.md,
    "--radius-lg": l.radii.lg,
    "--radius-xl": l.radii.xl,
    "--radius-2xl": l.radii["2xl"],
    "--radius-3xl": l.radii["3xl"],
    "--radius-4xl": l.radii["4xl"],
  };
}

function effectVars(e: EffectTokens): Record<string, string> {
  return {
    "--glass-blur": e.glassBlur,
    "--glass-blur-heavy": e.glassBlurHeavy,
    "--glass-border": e.glassBorder,
    "--glass-shadow": e.glassShadow,
    "--glass-shadow-elevated": e.glassShadowElevated,
    "--glass-highlight": e.glassHighlight,
    "--backdrop-blur-overlay": e.backdropBlurOverlay,
  };
}

function motionVars(m: MotionTokens): Record<string, string> {
  return {
    "--anim-fast": m.fast,
    "--anim-normal": m.normal,
    "--anim-slow": m.slow,
  };
}

/** Flattens a ThemeTokens set into the CSS custom-property map it defines. */
export function tokensToCssVars(tokens: ThemeTokens): Record<string, string> {
  return {
    ...colorVars(tokens.colors),
    ...typographyVars(tokens.typography),
    ...layoutVars(tokens.layout),
    ...effectVars(tokens.effects),
    ...motionVars(tokens.motion),
  };
}

/** Resolves a user preference (light/dark/system) to a concrete mode. */
export function resolveMode(preference: ThemePreference, prefersDark: boolean): ThemeMode {
  if (preference === "system") return prefersDark ? "dark" : "light";
  return preference;
}

/**
 * Applies a theme's light or dark token set as inline custom properties on
 * the root element and records the active theme as `data-theme`. Inline
 * styles on `<html>` override the static `@theme` defaults in globals.css,
 * which exist only for Tailwind utility generation and first paint.
 */
export function applyThemeTokens(root: HTMLElement, template: ThemeTemplate, mode: ThemeMode): void {
  const vars = tokensToCssVars(mode === "dark" ? template.dark : template.light);
  for (const [name, value] of Object.entries(vars)) {
    root.style.setProperty(name, value);
  }
  root.dataset.theme = template.id;
}