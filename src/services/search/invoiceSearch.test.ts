import { describe, it, expect } from "vitest";
import { expandInvoiceQuery } from "./invoiceSearch";

describe("expandInvoiceQuery", () => {
  it("expands a czech faktury query into synonym variants and keeps date operators", () => {
    const expanded = expandInvoiceQuery("faktury after:2025/01/01");
    expect(expanded.some((variant) => variant.includes("faktura") && variant.includes("after:2025/01/01"))).toBe(true);
    expect(expanded.some((variant) => variant.includes("invoice"))).toBe(true);
  });

  it("leaves unrelated queries as a single variant", () => {
    expect(expandInvoiceQuery("from:boss meeting notes")).toEqual(["from:boss meeting notes"]);
  });
});

describe("last-year invoice wording", () => {
  it("is recognized as an invoice query in czech", async () => {
    const { looksLikeInvoiceQuery } = await import("@/i18n");
    expect(looksLikeInvoiceQuery("vsechny faktury z minuly rok")).toBe(true);
  });
});
