import { describe, it, expect } from "vitest";
import { detectLocale, invoiceTermsFor, looksLikeInvoiceQuery, t } from "./index";

describe("i18n", () => {
  it("detects czech, slovak and vietnamese locales", () => {
    expect(detectLocale("cs-CZ")).toBe("cs");
    expect(detectLocale("sk-SK")).toBe("sk");
    expect(detectLocale("vi-VN")).toBe("vi");
    expect(detectLocale("en-US")).toBe("en");
  });

  it("falls back to english for missing keys", () => {
    expect(t("toolbar.compose", "en")).toBe("Compose");
    expect(t("toolbar.compose", "cs")).toBe("Napsat");
  });

  it("includes faktura terms for invoice search in every locale", () => {
    for (const locale of ["en", "cs", "sk", "vi"] as const) {
      const terms = invoiceTermsFor(locale);
      expect(terms).toContain("faktura");
      expect(terms).toContain("faktury");
      expect(terms).toContain("invoice");
    }
  });

  it("recognizes czech invoice wording", () => {
    expect(looksLikeInvoiceQuery("find all faktury from last year")).toBe(true);
    expect(looksLikeInvoiceQuery("hóa đơn 2025")).toBe(true);
    expect(looksLikeInvoiceQuery("meeting notes")).toBe(false);
  });
});
