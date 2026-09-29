import { getDb } from "@/services/db/connection";
import { invoiceTermsFor, looksLikeInvoiceQuery } from "@/i18n";
import { parseSearchQuery } from "./searchParser";
import { searchMessages, type SearchResult } from "@/services/db/search";

const INVOICE_MIME = ["pdf", "application/pdf", "octet-stream"];

export interface InvoiceHit extends SearchResult {
  attachment_filename: string | null;
  attachment_mime: string | null;
  match_source: "subject" | "body" | "attachment";
}

export function expandInvoiceQuery(query: string): string[] {
  const parsed = parseSearchQuery(query);
  if (!looksLikeInvoiceQuery(query) && !looksLikeInvoiceQuery(parsed.freeText)) {
    return [query];
  }
  const operators = query
    .replace(parsed.freeText, " ")
    .replace(/\s+/g, " ")
    .trim();
  return invoiceTermsFor().map((term) => [operators, term].filter(Boolean).join(" "));
}

export async function searchInvoices(
  query: string,
  accountIds: string[],
  limit = 50,
): Promise<InvoiceHit[]> {
  const variants = expandInvoiceQuery(query);
  const terms = invoiceTermsFor();
  const merged = new Map<string, InvoiceHit>();

  for (const variant of variants) {
    const textHits = await searchMessages(variant, undefined, limit, {
      accountIds: accountIds.length > 0 ? accountIds : undefined,
      excludeSpamTrash: true,
      sort: "newest",
    });
    for (const hit of textHits) {
      const key = `${hit.account_id}:${hit.message_id}`;
      if (merged.has(key)) continue;
      const subject = (hit.subject ?? "").toLowerCase();
      merged.set(key, {
        ...hit,
        attachment_filename: null,
        attachment_mime: null,
        match_source: terms.some((term) => subject.includes(term)) ? "subject" : "body",
      });
    }
  }

  const db = await getDb();
  for (const hit of await searchInvoiceAttachments(db, terms, accountIds, limit)) {
    const key = `${hit.account_id}:${hit.message_id}`;
    const existing = merged.get(key);
    if (existing) {
      existing.attachment_filename = hit.attachment_filename;
      existing.attachment_mime = hit.attachment_mime;
      if (hit.match_source === "attachment") existing.match_source = "attachment";
      continue;
    }
    merged.set(key, hit);
  }

  return [...merged.values()]
    .sort((a, b) => b.date - a.date)
    .slice(0, limit);
}

async function searchInvoiceAttachments(
  db: Awaited<ReturnType<typeof getDb>>,
  terms: string[],
  accountIds: string[],
  limit: number,
): Promise<InvoiceHit[]> {
  const likeClauses = terms.flatMap((_, index) => {
    const n = index + 1;
    return [
      `lower(COALESCE(a.filename,'')) LIKE '%' || lower($${n}) || '%'`,
      `lower(COALESCE(a.extracted_text,'')) LIKE '%' || lower($${n}) || '%'`,
    ];
  });
  const params: unknown[] = [...terms];
  let accountClause = "";
  if (accountIds.length > 0) {
    const placeholders = accountIds.map((_, i) => `$${terms.length + i + 1}`);
    accountClause = `AND a.account_id IN (${placeholders.join(",")})`;
    params.push(...accountIds);
  }
  params.push(limit);
  const limitPlaceholder = `$${params.length}`;

  const rows = await db.select<Array<{
    message_id: string;
    account_id: string;
    thread_id: string;
    subject: string | null;
    from_name: string | null;
    from_address: string | null;
    snippet: string | null;
    date: number;
    filename: string | null;
    mime_type: string | null;
    extracted_text: string | null;
  }>>(
    `SELECT m.id as message_id, m.account_id, m.thread_id, m.subject, m.from_name,
            m.from_address, m.snippet, m.date, a.filename, a.mime_type, a.extracted_text
     FROM attachments a
     JOIN messages m ON m.account_id = a.account_id AND m.id = a.message_id
     WHERE (${likeClauses.join(" OR ")}
        OR lower(COALESCE(a.mime_type,'')) LIKE '%pdf%'
        OR lower(COALESCE(a.filename,'')) LIKE '%.pdf')
       ${accountClause}
     ORDER BY m.date DESC
     LIMIT ${limitPlaceholder}`,
    params,
  );

  return rows.map((row) => {
    const filename = (row.filename ?? "").toLowerCase();
    const extracted = (row.extracted_text ?? "").toLowerCase();
    const matchedTerm = terms.find((term) => filename.includes(term) || extracted.includes(term));
    const excerpt = matchedTerm && extracted.includes(matchedTerm)
      ? excerptAround(row.extracted_text ?? "", matchedTerm)
      : row.filename;
    return {
      message_id: row.message_id,
      account_id: row.account_id,
      thread_id: row.thread_id,
      subject: row.subject,
      from_name: row.from_name,
      from_address: row.from_address,
      snippet: row.snippet,
      match_excerpt: excerpt,
      date: row.date,
      rank: 0,
      attachment_filename: row.filename,
      attachment_mime: row.mime_type,
      match_source: "attachment" as const,
    };
  }).filter((row) => {
    const filename = (row.attachment_filename ?? "").toLowerCase();
    const mime = (row.attachment_mime ?? "").toLowerCase();
    const extracted = (row.match_excerpt ?? "").toLowerCase();
    const looksPdf = INVOICE_MIME.some((part) => mime.includes(part)) || filename.endsWith(".pdf");
    return looksPdf || terms.some((term) => filename.includes(term) || extracted.includes(term));
  });
}

function excerptAround(text: string, term: string): string {
  const index = text.toLowerCase().indexOf(term.toLowerCase());
  if (index < 0) return text.slice(0, 240);
  const start = Math.max(0, index - 90);
  return text.slice(start, start + 240).trim();
}
