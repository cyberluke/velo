import { useEffect, useRef } from "react";
import { useUIStore } from "@/stores/uiStore";
import { getTheme } from "./registry";
import { applyThemeTokens, resolveMode, tokensToCssVars } from "./apply";

const SNAPSHOT_KEY = "naiemail-theme";
const FONT_SCALE_CLASSES = [
  "font-scale-small",
  "font-scale-default",
  "font-scale-large",
  "font-scale-xlarge",
] as const;

/**
 * The one hook that keeps the document in sync with the theme settings.
 *
 * Previously App, ThreadWindow and ComposerWindow each re-implemented the
 * same four effects (dark class + system listener, font scale, reduce
 * motion, accent custom properties). That duplication is gone: a window
 * calls `useDocumentTheme()` and the whole document-level theme state —
 * mode class, font scale, motion preference and token values — is owned here
 * (Single Responsibility).
 *
 * Beyond applying tokens it also:
 * - caches the applied theme in localStorage so `public/theme-boot.js` can
 *   restore it before first paint (zero-flash boot, matters for the pop-out
 *   windows that open visible);
 * - crossfades palette changes via the `.theme-switching` class instead of
 *   snapping (first apply stays instant; reduced-motion stays an instant cut
 *   because the reduce-motion CSS rules win).
 */
export function useDocumentTheme(): void {
  const theme = useUIStore((s) => s.theme);
  const colorTheme = useUIStore((s) => s.colorTheme);
  const fontScale = useUIStore((s) => s.fontScale);
  const reduceMotion = useUIStore((s) => s.reduceMotion);
  const firstApply = useRef(true);

  useEffect(() => {
    const root = document.documentElement;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    let fadeTimer: ReturnType<typeof setTimeout> | undefined;

    const apply = () => {
      const mode = resolveMode(theme, mq.matches);
      // `.dark` drives Tailwind's `dark:` variant — kept as a class so the
      // variant keeps working even though token values now come from the
      // template instead of a CSS override block.
      root.classList.toggle("dark", mode === "dark");
      root.classList.toggle("reduce-motion", reduceMotion);
      for (const cls of FONT_SCALE_CLASSES) root.classList.remove(cls);
      root.classList.add(`font-scale-${fontScale}`);

      const template = getTheme(colorTheme);
      if (firstApply.current) {
        applyThemeTokens(root, template, mode);
        firstApply.current = false;
      } else {
        // Crossfade palette changes; drop the class once the transition
        // (--anim-normal, 200ms) has had a frame of margin.
        root.classList.add("theme-switching");
        applyThemeTokens(root, template, mode);
        const duration = parseFloat(getComputedStyle(root).getPropertyValue("--anim-normal")) || 200;
        if (fadeTimer) clearTimeout(fadeTimer);
        fadeTimer = setTimeout(() => root.classList.remove("theme-switching"), duration + 60);
      }

      try {
        localStorage.setItem(
          SNAPSHOT_KEY,
          JSON.stringify({ themeId: template.id, mode, vars: tokensToCssVars(mode === "dark" ? template.dark : template.light) }),
        );
      } catch {
        // Snapshot is an optimization; never let storage failure break theming.
      }
    };

    apply();

    if (theme === "system") {
      mq.addEventListener("change", apply);
      return () => {
        mq.removeEventListener("change", apply);
        if (fadeTimer) clearTimeout(fadeTimer);
      };
    }
    return () => {
      if (fadeTimer) clearTimeout(fadeTimer);
    };
  }, [theme, colorTheme, fontScale, reduceMotion]);
}