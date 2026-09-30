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
import { baseLight } from "./base";

/** Collects [dot-path, value] for every leaf in the token tree. */
function leafEntries(obj: unknown, prefix = ""): [string, string][] {
  if (obj === null || typeof obj !== "object") {
    return typeof obj === "string" ? [[prefix, obj]] : [];
  }
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    leafEntries(v, prefix ? `${prefix}.${k}` : k),
  );
}

/** The exact token surface a ThemeTemplate must expose (from the shell). */
const CONTRACT_LEAVES = leafEntries(baseLight)
  .map(([path]) => path)
  .sort();

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

  it("every template exposes exactly the contract token surface, all non-empty, for both modes", () => {
    for (const theme of listThemes()) {
      for (const mode of ["light", "dark"] as const) {
        const entries = leafEntries(theme[mode]);
        const paths = entries.map(([p]) => p).sort();
        expect(paths, `${theme.id} ${mode} token surface`).toEqual(CONTRACT_LEAVES);
        for (const [, value] of entries) {
          expect(value, `${theme.id} ${mode}`).toBeTruthy();
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
      expect(light.layout.spacing).toBe(indigoLight.layout.spacing);
      expect(light.typography.sizes.sm.size).toBe(indigoLight.typography.sizes.sm.size);
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
    expect(vars["--glass-blur"]).toBeTruthy();
    expect(vars["--anim-fast"]).toBeTruthy();
  });

  it("maps the scale tokens (density, radii, type scale)", () => {
    const vars = tokensToCssVars(getTheme("indigo").light);
    expect(vars["--spacing"]).toBe("0.25rem");
    expect(vars["--radius-md"]).toBe("0.375rem");
    expect(vars["--radius-2xl"]).toBe("1rem");
    expect(vars["--text-sm"]).toBe("0.875rem");
    expect(vars["--text-sm--line-height"]).toBe("1.25rem");
    expect(vars["--text-3xl"]).toBe("1.875rem");
  });
});

describe("applyThemeTokens", () => {
  it("writes the token set and data-theme onto the root element", () => {
    const el = document.createElement("html");
    applyThemeTokens(el, getTheme("rose"), "dark");
    expect(el.style.getPropertyValue("--color-accent")).toBe("#fb7185");
    expect(el.style.getPropertyValue("--color-text-primary")).toBeTruthy();
    expect(el.style.getPropertyValue("--spacing")).toBe("0.25rem");
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

  it("a custom template can restyle density and radii (Open/Closed)", () => {
    const el = document.createElement("html");
    const dense = { ...getTheme("indigo") };
    dense.light = {
      ...dense.light,
      layout: { ...dense.light.layout, spacing: "0.2rem", radii: { ...dense.light.layout.radii, md: "0.25rem" } },
    };
    applyThemeTokens(el, dense, "light");
    expect(el.style.getPropertyValue("--spacing")).toBe("0.2rem");
    expect(el.style.getPropertyValue("--radius-md")).toBe("0.25rem");
    expect(el.style.getPropertyValue("--radius-panel")).toBe("0.5rem");
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