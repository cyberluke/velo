import type { ThemeTokens } from "./types";

/**
 * The neutral shell: surfaces, text, borders, feedback, chrome, typography,
 * layout, effects and motion that every accent theme shares.
 *
 * `baseLight` mirrors the previous `@theme` defaults in globals.css and
 * `baseDark` mirrors the old `.dark` override block — the two sources of
 * truth that used to live in CSS. Values are byte-for-byte identical, so
 * adopting a template changes nothing visually for the default theme.
 *
 * An accent template (templates.ts) starts from these and overrides the
 * accent family; a full custom theme can override any field.
 */
export const baseLight: ThemeTokens = {
  colors: {
    bgPrimary: "#12141c",
    bgSecondary: "#181b26",
    bgTertiary: "#222633",
    bgHover: "rgba(167, 139, 250, 0.12)",
    bgSelected: "rgba(45, 212, 191, 0.16)",
    appBg: "#07080d",
    textPrimary: "#f4f1ff",
    textSecondary: "#c4bdd8",
    textTertiary: "#8b83a3",
    borderPrimary: "rgba(167, 139, 250, 0.18)",
    borderSecondary: "rgba(45, 212, 191, 0.12)",
    accent: "#a78bfa",
    accentHover: "#2dd4bf",
    accentLight: "rgba(167, 139, 250, 0.16)",
    danger: "#dc2626",
    warning: "#d97706",
    success: "#059669",
    sidebarBg: "#0c0e16",
    sidebarText: "#ece7ff",
    sidebarHover: "rgba(167, 139, 250, 0.14)",
    sidebarActive: "#2dd4bf",
    shellMix: "#0d1018",
    workspaceMix: "#10131c",
    canvasText: "#eef0f7",
    canvasHover: "rgba(255, 255, 255, 0.09)",
    canvasActive: "#a5b4fc",
  },
  typography: {
    fontFamily: '"Segoe UI Variable", "Segoe UI", "Noto Sans", sans-serif',
    // Tailwind 4.1 default font-size scale — the built-in themes keep it,
    // so a template only overrides what it wants to restyle.
    sizes: {
      xs: { size: "0.75rem", lineHeight: "1rem" },
      sm: { size: "0.875rem", lineHeight: "1.25rem" },
      base: { size: "1rem", lineHeight: "1.5rem" },
      lg: { size: "1.125rem", lineHeight: "1.75rem" },
      xl: { size: "1.25rem", lineHeight: "1.75rem" },
      "2xl": { size: "1.5rem", lineHeight: "2rem" },
      "3xl": { size: "1.875rem", lineHeight: "2.25rem" },
    },
  },
  layout: {
    // Tailwind's base spacing unit — 0.25rem keeps every p-*/gap-*/w-* at its
    // current size. A denser or airier theme changes this one value.
    spacing: "0.25rem",
    radiusPanel: "0.5rem",
    radiusControl: "0.7rem",
    radiusRail: "1.25rem",
    radiusButton: "0.85rem",
    // Tailwind 4.1 default radii scale (rounded-* utilities).
    radii: {
      xs: "0.125rem",
      sm: "0.25rem",
      md: "0.375rem",
      lg: "0.5rem",
      xl: "0.75rem",
      "2xl": "1rem",
      "3xl": "1.5rem",
      "4xl": "2rem",
    },
  },
  effects: {
    glassBlur: "20px",
    glassBlurHeavy: "24px",
    glassBorder: "rgba(255, 255, 255, 0.2)",
    glassShadow: "0 10px 32px rgba(80, 66, 50, 0.08)",
    glassShadowElevated: "0 18px 54px rgba(80, 66, 50, 0.15)",
    glassHighlight: "inset 0 1px 0 0 rgba(255, 255, 255, 0.4)",
    backdropBlurOverlay: "16px",
  },
  motion: {
    fast: "150ms",
    normal: "200ms",
    slow: "300ms",
  },
};

/** The dark variant of the neutral shell (old `.dark` override block). */
export const baseDark: ThemeTokens = {
  ...baseLight,
  colors: {
    ...baseLight.colors,
    bgHover: "rgba(167, 139, 250, 0.14)",
    bgSelected: "rgba(45, 212, 191, 0.18)",
    borderPrimary: "rgba(167, 139, 250, 0.2)",
    borderSecondary: "rgba(45, 212, 191, 0.14)",
    accent: "#c4b5fd",
    accentHover: "#5eead4",
    accentLight: "rgba(167, 139, 250, 0.22)",
    sidebarHover: "rgba(167, 139, 250, 0.16)",
  },
  effects: {
    ...baseLight.effects,
    glassBorder: "rgba(196, 181, 253, 0.16)",
    glassShadow: "0 8px 32px rgba(0, 0, 0, 0.45)",
    glassShadowElevated: "0 16px 48px rgba(0, 0, 0, 0.55)",
    glassHighlight: "inset 0 1px 0 0 rgba(255, 255, 255, 0.04)",
  },
};