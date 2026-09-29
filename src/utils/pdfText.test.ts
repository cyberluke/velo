import { describe, it, expect } from "vitest";
import { extractPdfText, looksLikePdf } from "./pdfText";

describe("extractPdfText", () => {
  it("reads literal PDF strings including faktura", () => {
    const bytes = new TextEncoder().encode("%PDF-1.4 (Faktura 2025-014) (Total 1200 CZK)");
    expect(extractPdfText(bytes)).toContain("Faktura 2025-014");
  });

  it("detects pdf names", () => {
    expect(looksLikePdf("invoice.pdf", "application/pdf")).toBe(true);
    expect(looksLikePdf("notes.txt", "text/plain")).toBe(false);
  });
});
