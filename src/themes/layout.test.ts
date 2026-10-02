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
  it("applies the theme composition when the user has no explicit choice", () => {
    const eff = resolveEffectiveLayout({
      layout: EDITORIAL,
      sidebarCollapsed: false,
      emailDensity: "default",
      threadViewMode: "classic",
      readingPanePosition: "right",
    });
    expect(eff.railSidebar).toBe(true);
    expect(eff.sidebarCollapsed).toBe(true); // rail forces the compact toolbelt
    expect(eff.density).toBe("spacious");
    expect(eff.threadView).toBe("chat");
    expect(eff.readingPane).toBe("left");
    expect(eff.showCategoryTabs).toBe(false);
    expect(eff.showContactSidebar).toBe(false);
    expect(eff.showAiSummary).toBe(false);
  });

  it("user settings win over the theme for density, thread view and reading pane", () => {
    const eff = resolveEffectiveLayout({
      layout: EDITORIAL,
      sidebarCollapsed: false,
      emailDensity: "compact",
      threadViewMode: "chat",
      readingPanePosition: "bottom",
    });
    expect(eff.density).toBe("compact");
    expect(eff.threadView).toBe("chat");
    expect(eff.readingPane).toBe("bottom");
  });

  it("a full-nav theme follows the user's own collapse toggle", () => {
    const eff = resolveEffectiveLayout({
      layout: STANDARD_LAYOUT,
      sidebarCollapsed: true,
      emailDensity: "default",
      threadViewMode: "classic",
      readingPanePosition: "right",
    });
    expect(eff.railSidebar).toBe(false);
    expect(eff.sidebarCollapsed).toBe(true);
  });

  it("standard chrome keeps the category tabs, contact sidebar and AI summary", () => {
    const eff = resolveEffectiveLayout({
      layout: STANDARD_LAYOUT,
      sidebarCollapsed: false,
      emailDensity: "default",
      threadViewMode: "classic",
      readingPanePosition: "right",
    });
    expect(eff.showCategoryTabs).toBe(true);
    expect(eff.showContactSidebar).toBe(true);
    expect(eff.showAiSummary).toBe(true);
    expect(eff.readingPane).toBe("right");
    expect(eff.density).toBe("default");
    expect(eff.threadView).toBe("classic");
  });

  it("an explicit non-default reading pane position is preserved", () => {
    const eff = resolveEffectiveLayout({
      layout: EDITORIAL,
      sidebarCollapsed: false,
      emailDensity: "default",
      threadViewMode: "classic",
      readingPanePosition: "hidden",
    });
    expect(eff.readingPane).toBe("hidden");
  });
});