import type { ColorTokens, ThemeTemplate, ThemeTokens } from "./types";
import { baseLight, baseDark } from "./base";

/**
 * Role themes — full personality themes, not accent-only variants.
 *
 * Each one restyles the whole contract: surfaces, text, accent, sidebar,
 * chrome, typography (family + scale), layout density/radii, effects and
 * motion. They are grounded in the design rules top studios and typography
 * houses apply: a modular type scale (minor third ≈ 1.2 / major third ≈ 1.25 /
 * perfect fourth ≈ 1.333), a disciplined hierarchy (weight + size, never more
 * faces than necessary), comfortable body leading (1.4–1.6), and one display
 * voice paired with the UI voice.
 *
 * WCAG AA is enforced by the contract tests for every theme in both modes:
 * accent vs onAccent, accent vs bg-secondary, sidebar-active vs sidebar-bg all
 * ≥ 4.5:1.
 */

/** Build a full token set from the shell + a complete color family + overrides. */
function tokens(
  base: ThemeTokens,
  colors: ColorTokens,
  extra?: Partial<Omit<ThemeTokens, "colors">>,
): ThemeTokens {
  return { ...base, colors, ...extra };
}

/* ------------------------------------------------------------------ */
/* 1. SAP North Star — SAP's AI-native North Star vision (Joule-era).  */
/*    Fiori Horizon "Morning Sky"/"Evening Horizon" palettes, the 72   */
/*    typeface (bundled), calm trust-blue, gentle 4px rhythm.          */
/* ------------------------------------------------------------------ */

const sapLight: ColorTokens = {
  bgPrimary: "#F5F6F7",
  bgSecondary: "#FFFFFF",
  bgTertiary: "#EFF1F2",
  bgHover: "rgba(0, 112, 242, 0.08)",
  bgSelected: "rgba(0, 112, 242, 0.12)",
  appBg: "#E9ECEE",
  textPrimary: "#1D2D3E",
  textSecondary: "#556B82",
  textTertiary: "#8494A5",
  borderPrimary: "rgba(0, 112, 242, 0.16)",
  borderSecondary: "rgba(29, 45, 62, 0.12)",
  accent: "#0070F2",
  accentHover: "#0064D9",
  accentLight: "#E5F1FD",
  onAccent: "#FFFFFF",
  danger: "#EE3936",
  warning: "#B27D00",
  success: "#188918",
  sidebarBg: "#FFFFFF",
  sidebarText: "#1D2D3E",
  sidebarHover: "rgba(0, 112, 242, 0.07)",
  sidebarActive: "#0070F2",
  shellMix: "#E2E6EA",
  workspaceMix: "#E8ECEF",
  canvasText: "#1D2D3E",
  canvasHover: "rgba(0, 112, 242, 0.07)",
  canvasActive: "#0064D9",
};

const sapDark: ColorTokens = {
  bgPrimary: "#1D232A",
  bgSecondary: "#29313A",
  bgTertiary: "#2F3943",
  bgHover: "rgba(77, 177, 255, 0.12)",
  bgSelected: "rgba(77, 177, 255, 0.18)",
  appBg: "#161B21",
  textPrimary: "#FAFAFA",
  textSecondary: "#B9C4CE",
  textTertiary: "#8494A5",
  borderPrimary: "rgba(77, 177, 255, 0.2)",
  borderSecondary: "rgba(233, 236, 239, 0.1)",
  accent: "#4DB1FF",
  accentHover: "#7BC2FF",
  accentLight: "#123B5A",
  onAccent: "#0B1D2E",
  danger: "#FF8888",
  warning: "#FAC748",
  success: "#36A41D",
  sidebarBg: "#232B33",
  sidebarText: "#E5E9ED",
  sidebarHover: "rgba(77, 177, 255, 0.1)",
  sidebarActive: "#4DB1FF",
  shellMix: "#171D24",
  workspaceMix: "#1B2229",
  canvasText: "#E5E9ED",
  canvasHover: "rgba(255, 255, 255, 0.06)",
  canvasActive: "#7BC2FF",
};

const sapLayout = {
  spacing: "0.25rem",
  radiusPanel: "0.375rem",
  radiusControl: "0.5rem",
  radiusRail: "0.75rem",
  radiusButton: "0.5rem",
  radii: {
    xs: "0.125rem",
    sm: "0.25rem",
    md: "0.375rem",
    lg: "0.5rem",
    xl: "0.625rem",
    "2xl": "0.75rem",
    "3xl": "1rem",
    "4xl": "1.25rem",
  },
};

export const sapNorthStarTheme: ThemeTemplate = {
  id: "sap-northstar",
  name: "SAP North Star",
  swatch: "#0070F2",
  light: tokens(baseLight, sapLight, {
    typography: {
      fontFamily: '"72", "Segoe UI Variable", "Segoe UI", sans-serif',
      sizes: baseLight.typography.sizes,
    },
    layout: sapLayout,
    effects: {
      glassBlur: "16px",
      glassBlurHeavy: "20px",
      glassBorder: "rgba(255, 255, 255, 0.35)",
      glassShadow: "0 6px 20px rgba(29, 45, 62, 0.10)",
      glassShadowElevated: "0 14px 40px rgba(29, 45, 62, 0.16)",
      glassHighlight: "inset 0 1px 0 0 rgba(255, 255, 255, 0.6)",
      backdropBlurOverlay: "14px",
    },
  }),
  dark: tokens(baseDark, sapDark, {
    typography: {
      fontFamily: '"72", "Segoe UI Variable", "Segoe UI", sans-serif',
      sizes: baseDark.typography.sizes,
    },
    layout: sapLayout,
    effects: {
      glassBlur: "16px",
      glassBlurHeavy: "20px",
      glassBorder: "rgba(125, 194, 255, 0.16)",
      glassShadow: "0 8px 28px rgba(0, 0, 0, 0.4)",
      glassShadowElevated: "0 16px 44px rgba(0, 0, 0, 0.5)",
      glassHighlight: "inset 0 1px 0 0 rgba(255, 255, 255, 0.05)",
      backdropBlurOverlay: "14px",
    },
  }),
};

/* ------------------------------------------------------------------ */
/* 2. Corporate CEO — institutional trust: navy-ink on warm ivory,     */
/*    champagne gold accent, serif voices (Iowan/Palatino/Georgia),    */
/*    quiet 2–4px corners, unhurried motion.                           */
/* ------------------------------------------------------------------ */

const corpLight: ColorTokens = {
  bgPrimary: "#F6F4EE",
  bgSecondary: "#FFFFFF",
  bgTertiary: "#EDEAE1",
  bgHover: "rgba(138, 109, 34, 0.08)",
  bgSelected: "rgba(138, 109, 34, 0.12)",
  appBg: "#EFECE2",
  textPrimary: "#1B2430",
  textSecondary: "#4E5A6B",
  textTertiary: "#7C8899",
  borderPrimary: "rgba(27, 36, 48, 0.12)",
  borderSecondary: "rgba(138, 109, 34, 0.16)",
  accent: "#8A6D22",
  accentHover: "#7A5F1D",
  accentLight: "#F3EAD3",
  onAccent: "#FFFFFF",
  danger: "#B3261E",
  warning: "#9A6700",
  success: "#216E3E",
  sidebarBg: "#F9F6ED",
  sidebarText: "#1B2430",
  sidebarHover: "rgba(138, 109, 34, 0.07)",
  sidebarActive: "#8A6D22",
  shellMix: "#E8E4D8",
  workspaceMix: "#EFECE2",
  canvasText: "#1B2430",
  canvasHover: "rgba(27, 36, 48, 0.05)",
  canvasActive: "#6B5518",
};

const corpDark: ColorTokens = {
  bgPrimary: "#12161D",
  bgSecondary: "#1A212C",
  bgTertiary: "#222B38",
  bgHover: "rgba(201, 164, 76, 0.12)",
  bgSelected: "rgba(201, 164, 76, 0.16)",
  appBg: "#0D1015",
  textPrimary: "#EDEFF3",
  textSecondary: "#AEB8C5",
  textTertiary: "#77818F",
  borderPrimary: "rgba(201, 164, 76, 0.2)",
  borderSecondary: "rgba(237, 239, 243, 0.08)",
  accent: "#C9A44C",
  accentHover: "#D9BA6A",
  accentLight: "#3A2F14",
  onAccent: "#1A1306",
  danger: "#F87171",
  warning: "#FBBF24",
  success: "#4ADE80",
  sidebarBg: "#141A23",
  sidebarText: "#EDEFF3",
  sidebarHover: "rgba(201, 164, 76, 0.1)",
  sidebarActive: "#C9A44C",
  shellMix: "#0E1218",
  workspaceMix: "#11161D",
  canvasText: "#EDEFF3",
  canvasHover: "rgba(255, 255, 255, 0.06)",
  canvasActive: "#D9BA6A",
};

const corpTypography = {
  fontFamily: '"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif',
  sizes: {
    xs: { size: "0.75rem", lineHeight: "1rem" },
    sm: { size: "0.875rem", lineHeight: "1.375rem" },
    base: { size: "1rem", lineHeight: "1.55rem" },
    lg: { size: "1.1875rem", lineHeight: "1.75rem" },
    xl: { size: "1.375rem", lineHeight: "1.875rem" },
    "2xl": { size: "1.625rem", lineHeight: "2.125rem" },
    "3xl": { size: "2.125rem", lineHeight: "2.625rem" },
  },
};

const corpLayout = {
  spacing: "0.25rem",
  radiusPanel: "0.25rem",
  radiusControl: "0.375rem",
  radiusRail: "0.75rem",
  radiusButton: "0.375rem",
  radii: {
    xs: "0",
    sm: "0.125rem",
    md: "0.25rem",
    lg: "0.375rem",
    xl: "0.5rem",
    "2xl": "0.75rem",
    "3xl": "1rem",
    "4xl": "1.25rem",
  },
};

export const corporateCeoTheme: ThemeTemplate = {
  id: "corporate-ceo",
  name: "Corporate CEO",
  swatch: "#8A6D22",
  light: tokens(baseLight, corpLight, { typography: corpTypography, layout: corpLayout }),
  dark: tokens(baseDark, corpDark, { typography: corpTypography, layout: corpLayout }),
};

/* ------------------------------------------------------------------ */
/* 3. Startup CEO — momentum and clarity: airy near-white surfaces,    */
/*    electric violet accent, Avenir/SF geometric sans, friendly       */
/*    radii, faster motion.                                            */
/* ------------------------------------------------------------------ */

const startLight: ColorTokens = {
  bgPrimary: "#FAFAFC",
  bgSecondary: "#FFFFFF",
  bgTertiary: "#F1F0F6",
  bgHover: "rgba(108, 92, 231, 0.08)",
  bgSelected: "rgba(108, 92, 231, 0.12)",
  appBg: "#F1F0F8",
  textPrimary: "#171626",
  textSecondary: "#4C4A66",
  textTertiary: "#8A87A3",
  borderPrimary: "rgba(108, 92, 231, 0.16)",
  borderSecondary: "rgba(23, 22, 38, 0.08)",
  accent: "#6C5CE7",
  accentHover: "#5A4BD6",
  accentLight: "#EDEBFD",
  onAccent: "#FFFFFF",
  danger: "#DC2626",
  warning: "#D97706",
  success: "#059669",
  sidebarBg: "#F8F7FF",
  sidebarText: "#171626",
  sidebarHover: "rgba(108, 92, 231, 0.07)",
  sidebarActive: "#6C5CE7",
  shellMix: "#EAE9F4",
  workspaceMix: "#F2F1F9",
  canvasText: "#171626",
  canvasHover: "rgba(108, 92, 231, 0.06)",
  canvasActive: "#5A4BD6",
};

const startDark: ColorTokens = {
  bgPrimary: "#121120",
  bgSecondary: "#17162A",
  bgTertiary: "#1E1C36",
  bgHover: "rgba(139, 124, 255, 0.12)",
  bgSelected: "rgba(139, 124, 255, 0.18)",
  appBg: "#0C0B16",
  textPrimary: "#F2F1FF",
  textSecondary: "#B9B4E8",
  textTertiary: "#7F7AA6",
  borderPrimary: "rgba(139, 124, 255, 0.2)",
  borderSecondary: "rgba(242, 241, 255, 0.08)",
  accent: "#8B7CFF",
  accentHover: "#A79BFF",
  accentLight: "#2A2352",
  onAccent: "#0E0E1A",
  danger: "#F87171",
  warning: "#FBBF24",
  success: "#34D399",
  sidebarBg: "#121120",
  sidebarText: "#F2F1FF",
  sidebarHover: "rgba(139, 124, 255, 0.1)",
  sidebarActive: "#8B7CFF",
  shellMix: "#0E0D18",
  workspaceMix: "#100F1B",
  canvasText: "#F2F1FF",
  canvasHover: "rgba(255, 255, 255, 0.06)",
  canvasActive: "#A79BFF",
};

const startTypography = {
  fontFamily: '"Avenir Next", "Segoe UI Variable", "Segoe UI", "Helvetica Neue", system-ui, sans-serif',
  sizes: {
    xs: { size: "0.75rem", lineHeight: "1rem" },
    sm: { size: "0.875rem", lineHeight: "1.25rem" },
    base: { size: "1rem", lineHeight: "1.5rem" },
    lg: { size: "1.25rem", lineHeight: "1.75rem" },
    xl: { size: "1.5rem", lineHeight: "2rem" },
    "2xl": { size: "1.75rem", lineHeight: "2.25rem" },
    "3xl": { size: "2.25rem", lineHeight: "2.75rem" },
  },
};

const startLayout = {
  spacing: "0.25rem",
  radiusPanel: "0.625rem",
  radiusControl: "0.75rem",
  radiusRail: "1.25rem",
  radiusButton: "0.875rem",
  radii: {
    xs: "0.1875rem",
    sm: "0.3125rem",
    md: "0.4375rem",
    lg: "0.625rem",
    xl: "0.875rem",
    "2xl": "1.125rem",
    "3xl": "1.625rem",
    "4xl": "2.125rem",
  },
};

export const startupCeoTheme: ThemeTemplate = {
  id: "startup-ceo",
  name: "Startup CEO",
  swatch: "#6C5CE7",
  light: tokens(baseLight, startLight, {
    typography: startTypography,
    layout: startLayout,
    motion: { fast: "120ms", normal: "160ms", slow: "260ms" },
  }),
  dark: tokens(baseDark, startDark, {
    typography: startTypography,
    layout: startLayout,
    motion: { fast: "120ms", normal: "160ms", slow: "260ms" },
  }),
};

/* ------------------------------------------------------------------ */
/* 4. CTO Deep Tech — a terminal, not a brochure: near-black surfaces, */
/*    phosphor cyan accent, monospace voices (Cascadia/JetBrains),     */
/*    dense 3.5px rhythm, sharp corners, crisp shadows.                */
/* ------------------------------------------------------------------ */

const deepLight: ColorTokens = {
  bgPrimary: "#F4F6F8",
  bgSecondary: "#FFFFFF",
  bgTertiary: "#E9EDEF",
  bgHover: "rgba(14, 116, 144, 0.08)",
  bgSelected: "rgba(14, 116, 144, 0.12)",
  appBg: "#E7EBEE",
  textPrimary: "#0F172A",
  textSecondary: "#3F4A5A",
  textTertiary: "#6B7A8C",
  borderPrimary: "rgba(14, 116, 144, 0.2)",
  borderSecondary: "rgba(15, 23, 42, 0.08)",
  accent: "#0E7490",
  accentHover: "#155E75",
  accentLight: "#CFFAFE",
  onAccent: "#FFFFFF",
  danger: "#B91C1C",
  warning: "#B45309",
  success: "#047857",
  sidebarBg: "#EDF0F2",
  sidebarText: "#0F172A",
  sidebarHover: "rgba(14, 116, 144, 0.07)",
  sidebarActive: "#0E7490",
  shellMix: "#DDE3E7",
  workspaceMix: "#E6EAEE",
  canvasText: "#0F172A",
  canvasHover: "rgba(14, 116, 144, 0.06)",
  canvasActive: "#155E75",
};

const deepDark: ColorTokens = {
  bgPrimary: "#0B0F14",
  bgSecondary: "#10151A",
  bgTertiary: "#151C23",
  bgHover: "rgba(34, 211, 238, 0.1)",
  bgSelected: "rgba(34, 211, 238, 0.16)",
  appBg: "#070A0E",
  textPrimary: "#D7E2E9",
  textSecondary: "#8FA3B3",
  textTertiary: "#5E7184",
  borderPrimary: "rgba(34, 211, 238, 0.18)",
  borderSecondary: "rgba(215, 226, 233, 0.08)",
  accent: "#22D3EE",
  accentHover: "#67E8F9",
  accentLight: "#164E63",
  onAccent: "#052E33",
  danger: "#F87171",
  warning: "#FBBF24",
  success: "#34D399",
  sidebarBg: "#0C1014",
  sidebarText: "#D7E2E9",
  sidebarHover: "rgba(34, 211, 238, 0.08)",
  sidebarActive: "#22D3EE",
  shellMix: "#080C10",
  workspaceMix: "#0A0E13",
  canvasText: "#D7E2E9",
  canvasHover: "rgba(255, 255, 255, 0.05)",
  canvasActive: "#67E8F9",
};

const deepTypography = {
  fontFamily: '"Cascadia Code", "JetBrains Mono", "Consolas", "SF Mono", "Cascadia Mono", monospace',
  sizes: {
    xs: { size: "0.6875rem", lineHeight: "1rem" },
    sm: { size: "0.8125rem", lineHeight: "1.25rem" },
    base: { size: "0.9375rem", lineHeight: "1.5rem" },
    lg: { size: "1.0625rem", lineHeight: "1.625rem" },
    xl: { size: "1.1875rem", lineHeight: "1.75rem" },
    "2xl": { size: "1.375rem", lineHeight: "2rem" },
    "3xl": { size: "1.625rem", lineHeight: "2.25rem" },
  },
};

const deepLayout = {
  spacing: "0.21875rem",
  radiusPanel: "0.125rem",
  radiusControl: "0.25rem",
  radiusRail: "0.375rem",
  radiusButton: "0.25rem",
  radii: {
    xs: "0",
    sm: "0.0625rem",
    md: "0.125rem",
    lg: "0.1875rem",
    xl: "0.25rem",
    "2xl": "0.375rem",
    "3xl": "0.5rem",
    "4xl": "0.75rem",
  },
};

export const deepTechCtoTheme: ThemeTemplate = {
  id: "deeptech-cto",
  name: "Deep Tech CTO",
  swatch: "#22D3EE",
  light: tokens(baseLight, deepLight, { typography: deepTypography, layout: deepLayout }),
  dark: tokens(baseDark, deepDark, { typography: deepTypography, layout: deepLayout }),
};

/* ------------------------------------------------------------------ */
/* 5. Academic — the scholar's desk: warm paper surfaces, ink-black    */
/*    serif text, oxblood accent, a generous 1.25 major-third scale.   */
/* ------------------------------------------------------------------ */

const acadLight: ColorTokens = {
  bgPrimary: "#FBF8F1",
  bgSecondary: "#FFFDF8",
  bgTertiary: "#F2EDE1",
  bgHover: "rgba(123, 45, 59, 0.07)",
  bgSelected: "rgba(123, 45, 59, 0.1)",
  appBg: "#F4EFE4",
  textPrimary: "#26221C",
  textSecondary: "#4A443A",
  textTertiary: "#7A7264",
  borderPrimary: "rgba(38, 34, 28, 0.12)",
  borderSecondary: "rgba(123, 45, 59, 0.14)",
  accent: "#7B2D3B",
  accentHover: "#63222E",
  accentLight: "#F3E3E6",
  onAccent: "#FFFFFF",
  danger: "#9B1C1C",
  warning: "#8A6200",
  success: "#2E6E3B",
  sidebarBg: "#F4EEE2",
  sidebarText: "#26221C",
  sidebarHover: "rgba(123, 45, 59, 0.06)",
  sidebarActive: "#7B2D3B",
  shellMix: "#EBE4D4",
  workspaceMix: "#F1EBDF",
  canvasText: "#26221C",
  canvasHover: "rgba(38, 34, 28, 0.05)",
  canvasActive: "#63222E",
};

const acadDark: ColorTokens = {
  bgPrimary: "#1B1712",
  bgSecondary: "#211C17",
  bgTertiary: "#29231C",
  bgHover: "rgba(196, 117, 107, 0.1)",
  bgSelected: "rgba(196, 117, 107, 0.14)",
  appBg: "#14110D",
  textPrimary: "#E8E0D0",
  textSecondary: "#B8AD97",
  textTertiary: "#857B68",
  borderPrimary: "rgba(232, 224, 208, 0.1)",
  borderSecondary: "rgba(196, 117, 107, 0.16)",
  accent: "#C4756B",
  accentHover: "#D08989",
  accentLight: "#3A201B",
  onAccent: "#2B0E14",
  danger: "#F87171",
  warning: "#FBBF24",
  success: "#4ADE80",
  sidebarBg: "#1A1612",
  sidebarText: "#E8E0D0",
  sidebarHover: "rgba(196, 117, 107, 0.08)",
  sidebarActive: "#C4756B",
  shellMix: "#16120E",
  workspaceMix: "#191510",
  canvasText: "#E8E0D0",
  canvasHover: "rgba(255, 255, 255, 0.05)",
  canvasActive: "#D08989",
};

const acadTypography = {
  fontFamily: '"Iowan Old Style", "Palatino Linotype", "Georgia", "Times New Roman", serif',
  sizes: {
    xs: { size: "0.75rem", lineHeight: "1.125rem" },
    sm: { size: "0.875rem", lineHeight: "1.4rem" },
    base: { size: "1rem", lineHeight: "1.6rem" },
    lg: { size: "1.25rem", lineHeight: "1.8rem" },
    xl: { size: "1.5rem", lineHeight: "1.95rem" },
    "2xl": { size: "1.75rem", lineHeight: "2.25rem" },
    "3xl": { size: "2.125rem", lineHeight: "2.625rem" },
  },
};

const acadLayout = {
  spacing: "0.25rem",
  radiusPanel: "0.375rem",
  radiusControl: "0.5rem",
  radiusRail: "1rem",
  radiusButton: "0.5rem",
  radii: {
    xs: "0.125rem",
    sm: "0.25rem",
    md: "0.375rem",
    lg: "0.5rem",
    xl: "0.625rem",
    "2xl": "0.875rem",
    "3xl": "1.25rem",
    "4xl": "1.75rem",
  },
};

export const academicTheme: ThemeTemplate = {
  id: "academic",
  name: "Scholar",
  swatch: "#7B2D3B",
  light: tokens(baseLight, acadLight, { typography: acadTypography, layout: acadLayout }),
  dark: tokens(baseDark, acadDark, { typography: acadTypography, layout: acadLayout }),
};

/* ------------------------------------------------------------------ */
/* 6. Editorial typewriter — the Underwood desk: aged paper, ink,      */
/*    ribbon red, one monospace voice (Courier/American Typewriter),   */
/*    square corners, mechanical motion.                               */
/* ------------------------------------------------------------------ */

const typewLight: ColorTokens = {
  bgPrimary: "#F5EFE1",
  bgSecondary: "#FBF7EC",
  bgTertiary: "#EDE5D2",
  bgHover: "rgba(169, 50, 38, 0.08)",
  bgSelected: "rgba(169, 50, 38, 0.12)",
  appBg: "#EDE5D0",
  textPrimary: "#23201A",
  textSecondary: "#4C463A",
  textTertiary: "#7E7563",
  borderPrimary: "rgba(35, 32, 26, 0.16)",
  borderSecondary: "rgba(169, 50, 38, 0.18)",
  accent: "#A93226",
  accentHover: "#8E2A20",
  accentLight: "#F4E0DC",
  onAccent: "#FFFFFF",
  danger: "#9B1C1C",
  warning: "#8A6200",
  success: "#2E6E3B",
  sidebarBg: "#F1EADA",
  sidebarText: "#23201A",
  sidebarHover: "rgba(169, 50, 38, 0.07)",
  sidebarActive: "#A93226",
  shellMix: "#E6DCC4",
  workspaceMix: "#ECE3CD",
  canvasText: "#23201A",
  canvasHover: "rgba(35, 32, 26, 0.05)",
  canvasActive: "#8E2A20",
};

const typewDark: ColorTokens = {
  bgPrimary: "#14120E",
  bgSecondary: "#1C1913",
  bgTertiary: "#252118",
  bgHover: "rgba(224, 138, 122, 0.1)",
  bgSelected: "rgba(224, 138, 122, 0.14)",
  appBg: "#0F0D0A",
  textPrimary: "#E6DECC",
  textSecondary: "#B3A892",
  textTertiary: "#80765F",
  borderPrimary: "rgba(230, 222, 204, 0.1)",
  borderSecondary: "rgba(224, 138, 122, 0.16)",
  accent: "#E08A7A",
  accentHover: "#EAA093",
  accentLight: "#3A211A",
  onAccent: "#2B0E0A",
  danger: "#F87171",
  warning: "#FBBF24",
  success: "#4ADE80",
  sidebarBg: "#151310",
  sidebarText: "#E6DECC",
  sidebarHover: "rgba(224, 138, 122, 0.08)",
  sidebarActive: "#E08A7A",
  shellMix: "#0F0D0A",
  workspaceMix: "#12100C",
  canvasText: "#E6DECC",
  canvasHover: "rgba(255, 255, 255, 0.05)",
  canvasActive: "#EAA093",
};

const typewTypography = {
  fontFamily: '"Courier New", "American Typewriter", "Courier", "Nimbus Mono PS", monospace',
  sizes: {
    xs: { size: "0.75rem", lineHeight: "1.125rem" },
    sm: { size: "0.875rem", lineHeight: "1.375rem" },
    base: { size: "1rem", lineHeight: "1.5rem" },
    lg: { size: "1.125rem", lineHeight: "1.625rem" },
    xl: { size: "1.25rem", lineHeight: "1.75rem" },
    "2xl": { size: "1.5rem", lineHeight: "2rem" },
    "3xl": { size: "1.875rem", lineHeight: "2.375rem" },
  },
};

const typewLayout = {
  spacing: "0.25rem",
  radiusPanel: "0",
  radiusControl: "0.125rem",
  radiusRail: "0.25rem",
  radiusButton: "0.125rem",
  radii: {
    xs: "0",
    sm: "0",
    md: "0.125rem",
    lg: "0.125rem",
    xl: "0.25rem",
    "2xl": "0.375rem",
    "3xl": "0.5rem",
    "4xl": "0.75rem",
  },
};

export const typewriterTheme: ThemeTemplate = {
  id: "typewriter",
  name: "Underwood",
  swatch: "#A93226",
  light: tokens(baseLight, typewLight, {
    typography: typewTypography,
    layout: typewLayout,
    motion: { fast: "180ms", normal: "260ms", slow: "380ms" },
  }),
  dark: tokens(baseDark, typewDark, {
    typography: typewTypography,
    layout: typewLayout,
    motion: { fast: "180ms", normal: "260ms", slow: "380ms" },
  }),
};

/* ------------------------------------------------------------------ */
/* 7. Creative agency — the studio board: electric pink accent,        */
/*    geometric sans (Avenir/Futura), bold rounded radii, heavy glass, */
/*    snappy motion.                                                   */
/* ------------------------------------------------------------------ */

const agencyLight: ColorTokens = {
  bgPrimary: "#FDFDFB",
  bgSecondary: "#FFFFFF",
  bgTertiary: "#F5F3F0",
  bgHover: "rgba(225, 29, 72, 0.08)",
  bgSelected: "rgba(225, 29, 72, 0.1)",
  appBg: "#F7F5F2",
  textPrimary: "#1C1A1E",
  textSecondary: "#55505A",
  textTertiary: "#8E8792",
  borderPrimary: "rgba(225, 29, 72, 0.16)",
  borderSecondary: "rgba(28, 26, 30, 0.08)",
  accent: "#E11D48",
  accentHover: "#BE123C",
  accentLight: "#FDE7EC",
  onAccent: "#FFFFFF",
  danger: "#DC2626",
  warning: "#D97706",
  success: "#059669",
  sidebarBg: "#FFFFFF",
  sidebarText: "#1C1A1E",
  sidebarHover: "rgba(225, 29, 72, 0.06)",
  sidebarActive: "#E11D48",
  shellMix: "#F0EDE9",
  workspaceMix: "#F8F6F3",
  canvasText: "#1C1A1E",
  canvasHover: "rgba(225, 29, 72, 0.05)",
  canvasActive: "#BE123C",
};

const agencyDark: ColorTokens = {
  bgPrimary: "#12101A",
  bgSecondary: "#1C1520",
  bgTertiary: "#261D2E",
  bgHover: "rgba(255, 92, 138, 0.12)",
  bgSelected: "rgba(255, 92, 138, 0.16)",
  appBg: "#0C0A11",
  textPrimary: "#F7F0F4",
  textSecondary: "#C3B4BE",
  textTertiary: "#8F7D8B",
  borderPrimary: "rgba(255, 92, 138, 0.22)",
  borderSecondary: "rgba(247, 240, 244, 0.08)",
  accent: "#FF5C8A",
  accentHover: "#FF7BA1",
  accentLight: "#3E1226",
  onAccent: "#1A0A10",
  danger: "#FB7185",
  warning: "#FBBF24",
  success: "#34D399",
  sidebarBg: "#150F18",
  sidebarText: "#F7F0F4",
  sidebarHover: "rgba(255, 92, 138, 0.09)",
  sidebarActive: "#FF5C8A",
  shellMix: "#0E0C14",
  workspaceMix: "#100E17",
  canvasText: "#F7F0F4",
  canvasHover: "rgba(255, 255, 255, 0.06)",
  canvasActive: "#FF7BA1",
};

const agencyTypography = {
  fontFamily: '"Avenir Next", "Avenir", "Century Gothic", "Futura", "Segoe UI Variable", system-ui, sans-serif',
  sizes: {
    xs: { size: "0.75rem", lineHeight: "1rem" },
    sm: { size: "0.875rem", lineHeight: "1.25rem" },
    base: { size: "1rem", lineHeight: "1.5rem" },
    lg: { size: "1.25rem", lineHeight: "1.75rem" },
    xl: { size: "1.5rem", lineHeight: "2rem" },
    "2xl": { size: "1.75rem", lineHeight: "2.25rem" },
    "3xl": { size: "2.375rem", lineHeight: "2.875rem" },
  },
};

const agencyLayout = {
  spacing: "0.25rem",
  radiusPanel: "0.75rem",
  radiusControl: "0.875rem",
  radiusRail: "1.5rem",
  radiusButton: "1rem",
  radii: {
    xs: "0.25rem",
    sm: "0.375rem",
    md: "0.5rem",
    lg: "0.75rem",
    xl: "1rem",
    "2xl": "1.25rem",
    "3xl": "1.75rem",
    "4xl": "2.25rem",
  },
};

export const studioTheme: ThemeTemplate = {
  id: "studio",
  name: "Studio",
  swatch: "#E11D48",
  light: tokens(baseLight, agencyLight, {
    typography: agencyTypography,
    layout: agencyLayout,
    effects: {
      glassBlur: "28px",
      glassBlurHeavy: "36px",
      glassBorder: "rgba(255, 255, 255, 0.5)",
      glassShadow: "0 12px 36px rgba(60, 20, 40, 0.14)",
      glassShadowElevated: "0 22px 60px rgba(60, 20, 40, 0.22)",
      glassHighlight: "inset 0 1px 0 0 rgba(255, 255, 255, 0.7)",
      backdropBlurOverlay: "20px",
    },
    motion: { fast: "110ms", normal: "150ms", slow: "240ms" },
  }),
  dark: tokens(baseDark, agencyDark, {
    typography: agencyTypography,
    layout: agencyLayout,
    effects: {
      glassBlur: "28px",
      glassBlurHeavy: "36px",
      glassBorder: "rgba(255, 123, 161, 0.2)",
      glassShadow: "0 12px 36px rgba(0, 0, 0, 0.55)",
      glassShadowElevated: "0 22px 60px rgba(0, 0, 0, 0.65)",
      glassHighlight: "inset 0 1px 0 0 rgba(255, 255, 255, 0.07)",
      backdropBlurOverlay: "20px",
    },
    motion: { fast: "110ms", normal: "150ms", slow: "240ms" },
  }),
};

/* ------------------------------------------------------------------ */
/* 8. Cupertino — the home-office Apple user: SF system stack,         */
/*    frosted glass, iOS grouped surfaces, Apple blue, generous radii. */
/* ------------------------------------------------------------------ */

const appleLight: ColorTokens = {
  bgPrimary: "#F2F2F7",
  bgSecondary: "#FFFFFF",
  bgTertiary: "#E9E9EF",
  bgHover: "rgba(0, 102, 204, 0.08)",
  bgSelected: "rgba(0, 102, 204, 0.1)",
  appBg: "#EAEAEF",
  textPrimary: "#1C1C1E",
  textSecondary: "#3C3C43",
  textTertiary: "#8E8E93",
  borderPrimary: "rgba(60, 60, 67, 0.12)",
  borderSecondary: "rgba(0, 102, 204, 0.14)",
  accent: "#0066CC",
  accentHover: "#0055AA",
  accentLight: "#E3F0FF",
  onAccent: "#FFFFFF",
  danger: "#FF3B30",
  warning: "#FF9500",
  success: "#34C759",
  sidebarBg: "#F2F2F7",
  sidebarText: "#1C1C1E",
  sidebarHover: "rgba(0, 102, 204, 0.06)",
  sidebarActive: "#0066CC",
  shellMix: "#E2E2E9",
  workspaceMix: "#EAEAEF",
  canvasText: "#1C1C1E",
  canvasHover: "rgba(0, 102, 204, 0.05)",
  canvasActive: "#0055AA",
};

const appleDark: ColorTokens = {
  bgPrimary: "#000000",
  bgSecondary: "#1C1C1E",
  bgTertiary: "#2C2C2E",
  bgHover: "rgba(64, 156, 255, 0.14)",
  bgSelected: "rgba(64, 156, 255, 0.18)",
  appBg: "#0A0A0A",
  textPrimary: "#FFFFFF",
  textSecondary: "#D1D1D6",
  textTertiary: "#AEAEB2",
  borderPrimary: "rgba(84, 84, 88, 0.4)",
  borderSecondary: "rgba(64, 156, 255, 0.22)",
  accent: "#409CFF",
  accentHover: "#6CB5FF",
  accentLight: "#123A63",
  onAccent: "#000000",
  danger: "#FF453A",
  warning: "#FF9F0A",
  success: "#30D158",
  sidebarBg: "#161616",
  sidebarText: "#FFFFFF",
  sidebarHover: "rgba(64, 156, 255, 0.1)",
  sidebarActive: "#409CFF",
  shellMix: "#0D0D0D",
  workspaceMix: "#121212",
  canvasText: "#FFFFFF",
  canvasHover: "rgba(255, 255, 255, 0.07)",
  canvasActive: "#6CB5FF",
};

const appleLayout = {
  spacing: "0.25rem",
  radiusPanel: "0.75rem",
  radiusControl: "0.625rem",
  radiusRail: "1.5rem",
  radiusButton: "1rem",
  radii: {
    xs: "0.25rem",
    sm: "0.375rem",
    md: "0.5rem",
    lg: "0.625rem",
    xl: "0.875rem",
    "2xl": "1.125rem",
    "3xl": "1.75rem",
    "4xl": "2.5rem",
  },
};

export const cupertinoTheme: ThemeTemplate = {
  id: "cupertino",
  name: "Cupertino",
  swatch: "#0066CC",
  light: tokens(baseLight, appleLight, {
    typography: {
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Segoe UI Variable", "Segoe UI", system-ui, sans-serif',
      sizes: baseLight.typography.sizes,
    },
    layout: appleLayout,
    effects: {
      glassBlur: "28px",
      glassBlurHeavy: "36px",
      glassBorder: "rgba(255, 255, 255, 0.55)",
      glassShadow: "0 10px 32px rgba(0, 0, 0, 0.08)",
      glassShadowElevated: "0 20px 56px rgba(0, 0, 0, 0.14)",
      glassHighlight: "inset 0 1px 0 0 rgba(255, 255, 255, 0.75)",
      backdropBlurOverlay: "24px",
    },
  }),
  dark: tokens(baseDark, appleDark, {
    typography: {
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Segoe UI Variable", "Segoe UI", system-ui, sans-serif',
      sizes: baseDark.typography.sizes,
    },
    layout: appleLayout,
    effects: {
      glassBlur: "28px",
      glassBlurHeavy: "36px",
      glassBorder: "rgba(120, 120, 128, 0.3)",
      glassShadow: "0 10px 32px rgba(0, 0, 0, 0.5)",
      glassShadowElevated: "0 20px 56px rgba(0, 0, 0, 0.6)",
      glassHighlight: "inset 0 1px 0 0 rgba(255, 255, 255, 0.06)",
      backdropBlurOverlay: "24px",
    },
  }),
};

/** The eight role themes — appended to the registry by templates.ts. */
export const ROLE_THEMES: ThemeTemplate[] = [
  sapNorthStarTheme,
  corporateCeoTheme,
  startupCeoTheme,
  deepTechCtoTheme,
  academicTheme,
  typewriterTheme,
  studioTheme,
  cupertinoTheme,
];