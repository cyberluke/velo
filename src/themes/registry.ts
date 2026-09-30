import type { ThemeTemplate } from "./types";

/**
 * Theme registry — the Open/Closed extension point.
 *
 * Core code (applier, hook, store) depends only on `getTheme`/`listThemes`
 * and the ThemeTemplate contract. Registering a new theme is additive: a new
 * template object and one `registerTheme` call in templates.ts; nothing in
 * the registry or the app needs to change.
 */
const registry = new Map<string, ThemeTemplate>();

export const DEFAULT_THEME_ID = "indigo";

export function registerTheme(template: ThemeTemplate): void {
  registry.set(template.id, template);
}

/** Resolves by id, falling back to the default theme for unknown ids. */
export function getTheme(id: string): ThemeTemplate {
  return registry.get(id) ?? registry.get(DEFAULT_THEME_ID)!;
}

export function listThemes(): ThemeTemplate[] {
  return [...registry.values()];
}

export function isThemeId(id: string): boolean {
  return registry.has(id);
}