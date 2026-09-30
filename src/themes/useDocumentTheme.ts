import { useEffect } from "react";
import { useUIStore } from "@/stores/uiStore";
import { getTheme } from "./registry";
import { applyThemeTokens, resolveMode } from "./apply";

/**
 * The one hook that keeps the document in sync with the theme settings.
 *
 * Previously App, ThreadWindow and ComposerWindow each re-implemented the
 * same four effects (dark class + system listener, font scale, reduce
 * motion, accent custom properties). That duplication is gone: a window
 * calls `useDocumentTheme()` and the whole document-level theme state —
 * mode class, font scale, motion preference and token values — is owned here
 * (Single Responsibility).
 */
export function useDocumentTheme(): void {
  const theme = useUIStore((s) => s.theme);
  const colorTheme = useUIStore((s) => s.colorTheme);
  const fontScale = useUIStore((s) => s.fontScale);
  const reduceMotion = useUIStore((s) => s.reduceMotion);

  useEffect(() => {
    const root = document.documentElement;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");

    const apply = () => {
      const mode = resolveMode(theme, mq.matches);
      // `.dark` drives Tailwind's `dark:` variant — kept as a class so the
      // variant keeps working even though token values now come from the
      // template instead of a CSS override block.
      root.classList.toggle("dark", mode === "dark");
      root.classList.toggle("reduce-motion", reduceMotion);

      const fontScaleClasses = [
        "font-scale-small",
        "font-scale-default",
        "font-scale-large",
        "font-scale-xlarge",
      ];
      for (const cls of fontScaleClasses) root.classList.remove(cls);
      root.classList.add(`font-scale-${fontScale}`);

      applyThemeTokens(root, getTheme(colorTheme), mode);
    };

    apply();

    if (theme === "system") {
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    }
  }, [theme, colorTheme, fontScale, reduceMotion]);
}