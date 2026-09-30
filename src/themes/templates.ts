import type { ThemeTemplate } from "./types";
import { baseLight, baseDark } from "./base";
import { registerTheme, DEFAULT_THEME_ID } from "./registry";

/**
 * External theme templates.
 *
 * Each export is a complete, self-contained theme: two ThemeTokens (light +
 * dark) satisfying the full contract. The accent themes start from the
 * neutral shell (base.ts) and override the accent family; a custom theme may
 * override typography, layout, effects or motion the same way.
 *
 * ADDING A THEME: copy one template below, change id/name/swatch and the
 * tokens you care about, then call registerTheme(yourTheme). That's the
 * whole workflow — no core file needs to change (Open/Closed).
 */

export const indigoTheme: ThemeTemplate = {
  id: DEFAULT_THEME_ID,
  name: "Aurora",
  swatch: "#a78bfa",
  light: baseLight,
  dark: baseDark,
};

export const roseTheme: ThemeTemplate = {
  id: "rose",
  name: "Rose",
  swatch: "#e11d48",
  light: {
    ...baseLight,
    colors: {
      ...baseLight.colors,
      accent: "#e11d48",
      accentHover: "#be123c",
      accentLight: "#ffe4e6",
      bgSelected: "rgba(255, 228, 230, 0.65)",
      sidebarActive: "#e11d48",
    },
  },
  dark: {
    ...baseDark,
    colors: {
      ...baseDark.colors,
      accent: "#fb7185",
      accentHover: "#f43f5e",
      accentLight: "#4c0519",
      bgSelected: "rgba(76, 5, 25, 0.55)",
      sidebarActive: "#fb7185",
    },
  },
};

export const emeraldTheme: ThemeTemplate = {
  id: "emerald",
  name: "Emerald",
  swatch: "#059669",
  light: {
    ...baseLight,
    colors: {
      ...baseLight.colors,
      accent: "#059669",
      accentHover: "#047857",
      accentLight: "#d1fae5",
      bgSelected: "rgba(209, 250, 229, 0.65)",
      sidebarActive: "#059669",
    },
  },
  dark: {
    ...baseDark,
    colors: {
      ...baseDark.colors,
      accent: "#34d399",
      accentHover: "#10b981",
      accentLight: "#064e3b",
      bgSelected: "rgba(6, 78, 59, 0.55)",
      sidebarActive: "#34d399",
    },
  },
};

export const amberTheme: ThemeTemplate = {
  id: "amber",
  name: "Amber",
  swatch: "#d97706",
  light: {
    ...baseLight,
    colors: {
      ...baseLight.colors,
      accent: "#d97706",
      accentHover: "#b45309",
      accentLight: "#fef3c7",
      bgSelected: "rgba(254, 243, 199, 0.65)",
      sidebarActive: "#d97706",
    },
  },
  dark: {
    ...baseDark,
    colors: {
      ...baseDark.colors,
      accent: "#fbbf24",
      accentHover: "#f59e0b",
      accentLight: "#78350f",
      bgSelected: "rgba(120, 53, 15, 0.55)",
      sidebarActive: "#fbbf24",
    },
  },
};

export const skyTheme: ThemeTemplate = {
  id: "sky",
  name: "Sky",
  swatch: "#0284c7",
  light: {
    ...baseLight,
    colors: {
      ...baseLight.colors,
      accent: "#0284c7",
      accentHover: "#0369a1",
      accentLight: "#e0f2fe",
      bgSelected: "rgba(224, 242, 254, 0.65)",
      sidebarActive: "#0284c7",
    },
  },
  dark: {
    ...baseDark,
    colors: {
      ...baseDark.colors,
      accent: "#38bdf8",
      accentHover: "#0ea5e9",
      accentLight: "#0c4a6e",
      bgSelected: "rgba(12, 74, 110, 0.55)",
      sidebarActive: "#38bdf8",
    },
  },
};

export const violetTheme: ThemeTemplate = {
  id: "violet",
  name: "Violet",
  swatch: "#7c3aed",
  light: {
    ...baseLight,
    colors: {
      ...baseLight.colors,
      accent: "#7c3aed",
      accentHover: "#6d28d9",
      accentLight: "#ede9fe",
      bgSelected: "rgba(237, 233, 254, 0.65)",
      sidebarActive: "#7c3aed",
    },
  },
  dark: {
    ...baseDark,
    colors: {
      ...baseDark.colors,
      accent: "#a78bfa",
      accentHover: "#8b5cf6",
      accentLight: "#2e1065",
      bgSelected: "rgba(46, 16, 101, 0.55)",
      sidebarActive: "#a78bfa",
    },
  },
};

export const orangeTheme: ThemeTemplate = {
  id: "orange",
  name: "Orange",
  swatch: "#ea580c",
  light: {
    ...baseLight,
    colors: {
      ...baseLight.colors,
      accent: "#ea580c",
      accentHover: "#c2410c",
      accentLight: "#ffedd5",
      bgSelected: "rgba(255, 237, 213, 0.65)",
      sidebarActive: "#ea580c",
    },
  },
  dark: {
    ...baseDark,
    colors: {
      ...baseDark.colors,
      accent: "#fb923c",
      accentHover: "#f97316",
      accentLight: "#7c2d12",
      bgSelected: "rgba(124, 45, 18, 0.55)",
      sidebarActive: "#fb923c",
    },
  },
};

export const slateTheme: ThemeTemplate = {
  id: "slate",
  name: "Slate",
  swatch: "#475569",
  light: {
    ...baseLight,
    colors: {
      ...baseLight.colors,
      accent: "#475569",
      accentHover: "#334155",
      accentLight: "#e2e8f0",
      bgSelected: "rgba(226, 232, 240, 0.65)",
      sidebarActive: "#475569",
    },
  },
  dark: {
    ...baseDark,
    colors: {
      ...baseDark.colors,
      accent: "#94a3b8",
      accentHover: "#64748b",
      accentLight: "#1e293b",
      bgSelected: "rgba(30, 41, 59, 0.55)",
      sidebarActive: "#94a3b8",
    },
  },
};

/** Registered here — the single place a theme is added to the app. */
export const THEMES: ThemeTemplate[] = [
  indigoTheme,
  roseTheme,
  emeraldTheme,
  amberTheme,
  skyTheme,
  violetTheme,
  orangeTheme,
  slateTheme,
];

for (const theme of THEMES) {
  registerTheme(theme);
}