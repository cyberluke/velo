import { describe, it, expect } from "vitest";
import { translations, type Locale } from "./locales";

const NON_EN_LOCALES: Locale[] = ["cs", "sk", "vi"];

describe("i18n key parity", () => {
  it("every english key exists in every other locale", () => {
    for (const locale of NON_EN_LOCALES) {
      const missing = Object.keys(translations.en).filter(
        (key) => !(key in translations[locale]),
      );
      expect(missing, `missing keys in ${locale}`).toEqual([]);
    }
  });

  it("every non-english key exists in english", () => {
    for (const locale of NON_EN_LOCALES) {
      const orphans = Object.keys(translations[locale]).filter(
        (key) => !(key in translations.en),
      );
      expect(orphans, `orphan keys in ${locale}`).toEqual([]);
    }
  });

  it("no locale dict is empty", () => {
    for (const locale of ["en", ...NON_EN_LOCALES] as Locale[]) {
      expect(Object.keys(translations[locale]).length).toBeGreaterThan(0);
    }
  });
});