import { fetchAttachmentBytes } from "./attachmentActions";
import {
  getAttachmentExtraction,
  setAttachmentExtracted,
  setAttachmentExtractionError,
} from "@/services/db/attachments";
import { extractPdfText, looksLikePdf } from "@/utils/pdfText";

const MAX_BYTES = 50 * 1024 * 1024;

/**
 * Extract searchable text from a PDF (or invoice-named text file) attachment.
 *
 * Runs once per attachment: `extracted_at` records the attempt and
 * `extraction_error` the reason when it failed, so a resync never refetches a
 * file that already has an outcome. Failures are written to the row and
 * logged instead of being swallowed — the attachment chip shows a warning
 * with the reason, so a PDF that cannot be read is visible without a SQLite
 * client.
 */
export async function extractAttachmentText(att: {
  id: string;
  accountId: string;
  messageId: string;
  gmailAttachmentId: string | null;
  filename: string | null;
  mimeType: string | null;
  size: number | null;
}): Promise<void> {
  if (!att.gmailAttachmentId) return;
  if (att.size && att.size > MAX_BYTES) return;
  if (!looksLikePdf(att.filename, att.mimeType) && !looksLikeInvoiceName(att.filename)) return;

  try {
    const already = await getAttachmentExtraction(att.id);
    if (already?.extracted_at != null) return; // attempted once, outcome recorded

    const bytes = await fetchAttachmentBytes({
      accountId: att.accountId,
      messageId: att.messageId,
      gmailAttachmentId: att.gmailAttachmentId,
      filename: att.filename,
    });
    const text = looksLikePdf(att.filename, att.mimeType)
      ? extractPdfText(bytes)
      : new TextDecoder("utf-8", { fatal: false }).decode(bytes).slice(0, 20_000);
    if (text.trim()) {
      await setAttachmentExtracted(att.id, text, Date.now());
    } else {
      await setAttachmentExtractionError(att.id, "No readable text found", Date.now());
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[extractText] could not extract text from ${att.filename ?? att.id}:`, err);
    try {
      await setAttachmentExtractionError(att.id, message.slice(0, 300), Date.now());
    } catch {
      // Nothing left to do — the outcome row is best-effort too.
    }
  }
}

function looksLikeInvoiceName(filename: string | null): boolean {
  const name = (filename ?? "").toLowerCase();
  return /faktura|faktury|invoice|receipt|hoa.?don/.test(name);
}