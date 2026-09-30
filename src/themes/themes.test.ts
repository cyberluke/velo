import { describe, expect, it } from "vitest";
import {
  COLOR_THEMES,
  DEFAULT_THEME_ID,
  applyThemeTokens,
  getTheme,
  isThemeId,
  listThemes,
  resolveMode,
  tokensToCssVars,
} from "./index";
import type { ThemeTokens } from "./types";

const TOKEN_GROUP_KEYS: Record<keyof ThemeTokens, (keyof ThemeTokens[keyof ThemeTokens])[]> = {
  colors: [
    "bgPrimary",
    "bgSecondary",
    "bgTertiary",
    "bgHover",
    "bgSelected",
    "appBg",
    "textPrimary",
    "textSecondary",
    "textTertiary",
    "borderPrimary",
    "borderSecondary",
    "accent",
    "accentHover",
    "accentLight",
    "danger",
    "warning",
    "success",
    "sidebarBg",
    "sidebarText",
    "sidebarHover",
    "sidebarActive",
    "shellMix",
    "workspaceMix",
    "canvasText",
    "canvasHover",
    "canvasActive",
  ],
  typography: ["fontFamily"],
  layout: ["radiusPanel", "radiusControl", "radiusRail", "radiusButton"],
  effects: [
    "glassBlur",
    "glassBlurHeavy",
    "glassBorder",
    "glassShadow",
    "glassShadowElevated",
    "glassHighlight",
    "backdropBlurOverlay",
  ],
  motion: ["fast", "normal", "slow"],
};

describe("theme templates (Liskov: every theme satisfies the full contract)", () => {
  it("registers all 8 accent themes with unique ids", () => {
    const themes = listThemes();
    expect(themes).toHaveLength(8);
    const ids = themes.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const theme of themes) {
      expect(theme.name).toBeTruthy();
      expect(theme.swatch).toMatch(/^#/);
    }
  });

  it("every template defines every token, non-empty, for both modes", () => {
    for (const theme of listThemes()) {
      for (const mode of ["light", "dark"] as const) {
        const tokens = theme[mode];
        for (const [group, keys] of Object.entries(TOKEN_GROUP_KEYS)) {
          for (const key of keys) {
            const value = (tokens as Record<string, Record<string, string>>)[group][key];
            expect(value, `${theme.id} ${mode} ${group}.${key}`).toBeTruthy();
          }
        }
      }
    }
  });

  it("indigo is the default theme and falls back for unknown ids", () => {
    expect(DEFAULT_THEME_ID).toBe("indigo");
    expect(getTheme("indigo").name).toBe("Aurora");
    expect(getTheme("nonexistent").id).toBe("indigo");
    expect(isThemeId("rose")).toBe(true);
    expect(isThemeId("bogus")).toBe(false);
  });

  it("accent themes differ from the shell in the accent family only", () => {
    const indigo = getTheme("indigo");
    for (const theme of listThemes()) {
      if (theme.id === "indigo") continue;
      const light = theme.light;
      const indigoLight = indigo.light;
      expect(light.colors.accent).not.toBe(indigoLight.colors.accent);
      expect(light.colors.bgPrimary).toBe(indigoLight.colors.bgPrimary);
      expect(light.effects.glassBlur).toBe(indigoLight.effects.glassBlur);
      expect(light.typography.fontFamily).toBe(indigoLight.typography.fontFamily);
    }
  });
});

describe("COLOR_THEMES compatibility surface", () => {
  it("exposes id, name and swatch for the settings picker", () => {
    expect(COLOR_THEMES).toHaveLength(8);
    for (const t of COLOR_THEMES) {
      expect(t.id).toBeTruthy();
      expect(t.name).toBeTruthy();
      expect(t.swatch).toBeTruthy();
    }
  });
});

describe("tokensToCssVars", () => {
  it("maps every token family to its CSS custom property", () => {
    const vars = tokensToCssVars(getTheme("indigo").dark);
    expect(vars["--color-accent"]).toBe("#c4b5fd");
    expect(vars["--color-bg-primary"]).toBe("#12141c");
    expect(vars["--color-canvas-active"]).toBeTruthy();
    expect(vars["--font-app"]).toContain("Segoe UI");
    expect(vars["--radius-panel"]).toBeTruthy();
    expect(vars["--glass-blur"]).toBeTruthy();
    expect(vars["--anim-fast"]).toBeTruthy();
  });
});

describe("applyThemeTokens", () => {
  it("writes the token set and data-theme onto the root element", () => {
    const el = document.createElement("html");
    applyThemeTokens(el, getTheme("rose"), "dark");
    expect(el.style.getPropertyValue("--color-accent")).toBe("#fb7185");
    expect(el.style.getPropertyValue("--color-text-primary")).toBeTruthy();
    expect(el.dataset.theme).toBe("rose");
  });

  it("switching theme/mode overwrites every token (no residue from the old one)", () => {
    const el = document.createElement("html");
    applyThemeTokens(el, getTheme("rose"), "dark");
    applyThemeTokens(el, getTheme("sky"), "light");
    expect(el.style.getPropertyValue("--color-accent")).toBe("#0284c7");
    expect(el.style.getPropertyValue("--color-bg-selected")).toBe("rgba(224, 242, 254, 0.65)");
    expect(el.dataset.theme).toBe("sky");
  });
});

describe("resolveMode", () => {
  it("honors explicit modes and resolves system to the media query", () => {
    expect(resolveMode("dark", false)).toBe("dark");
    expect(resolveMode("light", true)).toBe("light");
    expect(resolveMode("system", true)).toBe("dark");
    expect(resolveMode("system", false)).toBe("light");
  });
});