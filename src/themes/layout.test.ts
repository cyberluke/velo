import { describe, expect, it } from "vitest";
import { STANDARD_LAYOUT, resolveEffectiveLayout } from "./index";
import type { ThemeLayout } from "./types";

/** A layout whose every field differs from the standard composition. */
const EDITORIAL: ThemeLayout = {
  id: "editorial",
  sidebar: "rail",
  density: "spacious",
  threadView: "chat",
  readingPane: "left",
  chrome: "minimal",
  aiSummary: "off",
};

describe("resolveEffectiveLayout", () => {
  it("applies the theme composition for the theme-only dimensions", () => {
    const eff = resolveEffectiveLayout({
      layout: EDITORIAL,
      sidebarCollapsed: false,
      readingPanePosition: "right",
    });
    expect(eff.railSidebar).toBe(true);
    expect(eff.sidebarCollapsed).toBe(true); // rail forces the compact toolbelt
    expect(eff.readingPane).toBe("left");
    expect(eff.showCategoryTabs).toBe(false);
    expect(eff.showContactSidebar).toBe(false);
    expect(eff.showAiSummary).toBe(false);
  });

  it("an explicit non-default reading pane position wins over the theme", () => {
    const eff = resolveEffectiveLayout({
      layout: EDITORIAL,
      sidebarCollapsed: false,
      readingPanePosition: "bottom",
    });
    expect(eff.readingPane).toBe("bottom");

    const hidden = resolveEffectiveLayout({
      layout: EDITORIAL,
      sidebarCollapsed: false,
      readingPanePosition: "hidden",
    });
    expect(hidden.readingPane).toBe("hidden");
  });

  it("a full-nav theme follows the user's own collapse toggle", () => {
    const eff = resolveEffectiveLayout({
      layout: STANDARD_LAYOUT,
      sidebarCollapsed: true,
      readingPanePosition: "right",
    });
    expect(eff.railSidebar).toBe(false);
    expect(eff.sidebarCollapsed).toBe(true);
  });

  it("standard chrome keeps the category tabs, contact sidebar and AI summary", () => {
    const eff = resolveEffectiveLayout({
      layout: STANDARD_LAYOUT,
      sidebarCollapsed: false,
      readingPanePosition: "right",
    });
    expect(eff.showCategoryTabs).toBe(true);
    expect(eff.showContactSidebar).toBe(true);
    expect(eff.showAiSummary).toBe(true);
    expect(eff.readingPane).toBe("right");
  });
});