import { describe, it, expect } from "vitest";
import { isLocale } from "./index";
import {
  INVOICE_SEARCH_TERMS,
  LOCALES,
  translations,
  type Locale,
} from "./locales";

const EXPECTED_LOCALES: readonly Locale[] = ["en", "cs", "sk", "vi"];

function sortedKeys(dict: Record<string, string>): string[] {
  return Object.keys(dict).sort();
}

describe("i18n parity", () => {
  it("declares every locale with an id matching the Locale type", () => {
    // LOCALES must be non-empty and every id must be a valid Locale
    expect(LOCALES.length).toBeGreaterThan(0);
    for (const entry of LOCALES) {
      expect(isLocale(entry.id), `invalid locale id: ${entry.id}`).toBe(true);
    }
    // the declared set must be exactly the Locale type's members
    expect(LOCALES.map((entry) => entry.id).sort()).toEqual(
      [...EXPECTED_LOCALES].sort(),
    );
  });

  it("keeps translations and invoice terms for every locale", () => {
    const declaredIds = LOCALES.map((entry) => entry.id);
    for (const locale of EXPECTED_LOCALES) {
      expect(translations[locale], `no translations for ${locale}`).toBeDefined();
      expect(
        INVOICE_SEARCH_TERMS[locale],
        `no invoice search terms for ${locale}`,
      ).toBeDefined();
      expect(declaredIds).toContain(locale);
    }
    // no translations entry outside the declared locale set
    expect(Object.keys(translations).sort()).toEqual([...declaredIds].sort());
  });

  it("has exactly the same key set as en in every locale", () => {
    const enKeys = sortedKeys(translations.en);
    expect(enKeys.length).toBeGreaterThan(0);

    for (const locale of EXPECTED_LOCALES) {
      const localeKeys = sortedKeys(translations[locale]);
      const missing = enKeys.filter((key) => !localeKeys.includes(key));
      const extra = localeKeys.filter((key) => !enKeys.includes(key));
      expect(missing, `missing keys in ${locale}`).toEqual([]);
      expect(extra, `extra keys in ${locale}`).toEqual([]);
    }
  });

  it("has no empty or whitespace-only translation values", () => {
    for (const locale of EXPECTED_LOCALES) {
      for (const [key, value] of Object.entries(translations[locale])) {
        expect(value.trim(), `${locale}.${key} must not be empty`).not.toBe("");
      }
    }
  });

  it("has non-empty invoice search terms for every locale", () => {
    for (const locale of EXPECTED_LOCALES) {
      const terms = INVOICE_SEARCH_TERMS[locale];
      expect(terms.length, `no invoice search terms for ${locale}`).toBeGreaterThan(0);
      for (const term of terms) {
        expect(term.trim(), `${locale} invoice term must not be empty`).not.toBe("");
      }
    }
  });
});