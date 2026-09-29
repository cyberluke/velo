import { listedAccountIds, useAccountStore } from "@/stores/accountStore";
import { getSetting } from "@/services/db/settings";
import { searchMessages } from "@/services/db/search";
import { getDb } from "@/services/db/connection";
import { getCalendarEventsInRange, type DbCalendarEvent } from "@/services/db/calendarEvents";
import { looksLikeInvoiceQuery } from "@/i18n";
import { searchInvoices } from "@/services/search/invoiceSearch";

function accountIds(): string[] {
  return listedAccountIds(useAccountStore.getState());
}

function parseDay(value?: string): number | undefined {
  if (!value) return undefined;
  const iso = Date.parse(value);
  if (!Number.isNaN(iso)) return Math.floor(iso / 1000);
  const parts = value.replace(/-/g, "/").split("/");
  if (parts.length !== 3) return undefined;
  const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  if (Number.isNaN(date.getTime())) return undefined;
  return Math.floor(date.getTime() / 1000);
}

function lastYearRange(): { after?: string; before?: string } {
  const year = new Date().getFullYear() - 1;
  return { after: `${year}/01/01`, before: `${year + 1}/01/01` };
}

export async function searchEmailsTool(params: { query?: string; limit?: number }) {
  const query = params.query?.trim();
  if (!query) throw new Error("query is required");
  const ids = accountIds();
  const hits = looksLikeInvoiceQuery(query)
    ? await searchInvoices(query, ids, params.limit ?? 25)
    : await searchMessages(query, undefined, params.limit ?? 25, {
        accountIds: ids.length > 0 ? ids : undefined,
        excludeSpamTrash: true,
      });
  return {
    count: hits.length,
    results: hits.map((hit) => ({
      accountId: hit.account_id,
      messageId: hit.message_id,
      threadId: hit.thread_id,
      subject: hit.subject,
      from: hit.from_name ? `${hit.from_name} <${hit.from_address}>` : hit.from_address,
      date: hit.date,
      excerpt: hit.match_excerpt ?? hit.snippet,
    })),
  };
}

export async function searchInvoicesTool(params: {
  query?: string;
  after?: string;
  before?: string;
  limit?: number;
}) {
  let query = params.query?.trim() || "invoice faktura faktury";
  const range = /last year|minulý rok|minuly rok|loňsk|lonsk|năm ngoái|nam ngoai/i.test(query)
    ? lastYearRange()
    : {};
  const after = params.after ?? range.after;
  const before = params.before ?? range.before;
  if (after && !/\bafter:/.test(query)) query += ` after:${after}`;
  if (before && !/\bbefore:/.test(query)) query += ` before:${before}`;
  const hits = await searchInvoices(query, accountIds(), params.limit ?? 50);
  return {
    count: hits.length,
    query,
    results: hits.map((hit) => ({
      accountId: hit.account_id,
      messageId: hit.message_id,
      threadId: hit.thread_id,
      subject: hit.subject,
      from: hit.from_address,
      date: hit.date,
      excerpt: hit.match_excerpt,
      attachment: hit.attachment_filename,
      matchSource: hit.match_source,
    })),
  };
}

export async function getEmailTool(params: { accountId?: string; messageId?: string }) {
  if (!params.accountId || !params.messageId) {
    throw new Error("accountId and messageId are required");
  }
  const db = await getDb();
  const messages = await db.select<Array<{
    id: string;
    account_id: string;
    thread_id: string;
    subject: string | null;
    from_name: string | null;
    from_address: string | null;
    to_addresses: string | null;
    date: number;
    body_text: string | null;
    snippet: string | null;
  }>>(
    `SELECT id, account_id, thread_id, subject, from_name, from_address, to_addresses, date, body_text, snippet
     FROM messages WHERE account_id = $1 AND id = $2 LIMIT 1`,
    [params.accountId, params.messageId],
  );
  const message = messages[0];
  if (!message) throw new Error("Message not found");
  const attachments = await db.select<Array<{
    filename: string | null;
    mime_type: string | null;
    size: number | null;
    extracted_text: string | null;
  }>>(
    `SELECT filename, mime_type, size, extracted_text FROM attachments
     WHERE account_id = $1 AND message_id = $2`,
    [params.accountId, params.messageId],
  );
  return {
    ...message,
    body: message.body_text ?? message.snippet,
    attachments: attachments.map((attachment) => ({
      filename: attachment.filename,
      mimeType: attachment.mime_type,
      size: attachment.size,
      extractedText: attachment.extracted_text?.slice(0, 4000) ?? null,
    })),
  };
}

function filterEvents(events: DbCalendarEvent[], query?: string): DbCalendarEvent[] {
  if (!query?.trim()) return events;
  const needle = query.toLowerCase();
  return events.filter((event) =>
    [event.summary, event.description, event.location]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(needle)),
  );
}

export async function searchCalendarTool(params: {
  query?: string;
  start?: string;
  end?: string;
}) {
  const start = parseDay(params.start) ?? Math.floor(Date.now() / 1000) - 90 * 86400;
  const end = parseDay(params.end) ?? Math.floor(Date.now() / 1000) + 180 * 86400;
  return listCalendarInRange(start, end, params.query);
}

export async function listCalendarTool(params: { start?: string; end?: string }) {
  const start = parseDay(params.start);
  const end = parseDay(params.end);
  if (start === undefined || end === undefined) {
    throw new Error("start and end are required");
  }
  return listCalendarInRange(start, end);
}

async function listCalendarInRange(start: number, end: number, query?: string) {
  const state = useAccountStore.getState();
  const calendarAccount = state.calendarAccountId ?? state.activeAccountId;
  if (!calendarAccount) return { count: 0, events: [] };
  const events = filterEvents(
    await getCalendarEventsInRange(calendarAccount, start, end),
    query,
  );
  return {
    count: events.length,
    events: events.map((event) => ({
      id: event.id,
      summary: event.summary,
      description: event.description,
      location: event.location,
      start: event.start_time,
      end: event.end_time,
      allDay: event.is_all_day === 1,
    })),
  };
}

export async function dispatchMcpTool(name: string, rawParams: unknown): Promise<unknown> {
  const params = (rawParams ?? {}) as Record<string, unknown>;
  switch (name) {
    case "search_emails":
      return searchEmailsTool({
        query: typeof params.query === "string" ? params.query : undefined,
        limit: typeof params.limit === "number" ? params.limit : undefined,
      });
    case "search_invoices":
      return searchInvoicesTool({
        query: typeof params.query === "string" ? params.query : undefined,
        after: typeof params.after === "string" ? params.after : undefined,
        before: typeof params.before === "string" ? params.before : undefined,
        limit: typeof params.limit === "number" ? params.limit : undefined,
      });
    case "get_email":
      return getEmailTool({
        accountId: typeof params.accountId === "string" ? params.accountId : undefined,
        messageId: typeof params.messageId === "string" ? params.messageId : undefined,
      });
    case "search_calendar":
      return searchCalendarTool({
        query: typeof params.query === "string" ? params.query : undefined,
        start: typeof params.start === "string" ? params.start : undefined,
        end: typeof params.end === "string" ? params.end : undefined,
      });
    case "list_calendar":
      return listCalendarTool({
        start: typeof params.start === "string" ? params.start : undefined,
        end: typeof params.end === "string" ? params.end : undefined,
      });
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export async function mcpEndpointLabel(): Promise<string> {
  const port = (await getSetting("mcp_port")) ?? "17321";
  return `http://127.0.0.1:${port}/mcp`;
}
