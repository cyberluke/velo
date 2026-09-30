/**
 * Public theme API.
 *
 * Consumers import from "@/themes" — the theme layer is a single module
 * boundary. Importing this module registers the built-in templates.
 */
export type {
  ColorThemeId,
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

export { DEFAULT_THEME_ID, getTheme, isThemeId, listThemes, registerTheme } from "./registry";
export { applyThemeTokens, resolveMode, tokensToCssVars } from "./apply";
export { useDocumentTheme } from "./useDocumentTheme";

// Backward-compatible aliases for consumers that predate the registry.
import { DEFAULT_THEME_ID, getTheme } from "./registry";
import { THEMES } from "./templates";
import type { ColorThemeId, ThemeTemplate } from "./types";
import "./templates";

/**
 * The built-in accent themes (id, name, swatch, light/dark tokens).
 * `id` is narrowed to ColorThemeId so the settings picker can feed it
 * straight into `setColorTheme`; THEMES itself stays generic because a
 * custom theme registered later may use any string id.
 */
export const COLOR_THEMES: readonly (ThemeTemplate & { id: ColorThemeId })[] = THEMES as (ThemeTemplate & { id: ColorThemeId })[];

export const DEFAULT_COLOR_THEME = DEFAULT_THEME_ID;

export function getThemeById(id: string): ThemeTemplate {
  return getTheme(id);
}