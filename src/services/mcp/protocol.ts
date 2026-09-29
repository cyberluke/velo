export const MCP_PROTOCOL_VERSION = "2025-03-26";
export const DEFAULT_MCP_PORT = 17321;

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: unknown;
}

export interface JsonRpcSuccess {
  jsonrpc: "2.0";
  id: string | number | null;
  result: unknown;
}

export interface JsonRpcError {
  jsonrpc: "2.0";
  id: string | number | null;
  error: { code: number; message: string; data?: unknown };
}

export type JsonRpcResponse = JsonRpcSuccess | JsonRpcError;

export function jsonRpcResult(id: string | number | null | undefined, result: unknown): JsonRpcSuccess {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

export function jsonRpcError(
  id: string | number | null | undefined,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcError {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message, data } };
}

export const MCP_TOOLS = [
  {
    name: "search_emails",
    description:
      "Search mail by subject, body, sender, and operators (from:, after:, has:attachment). Use for general inbox queries.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Gmail-style search query" },
        limit: { type: "number", description: "Max results (default 25)" },
      },
      required: ["query"],
    },
  },
  {
    name: "search_invoices",
    description:
      "Find invoices and receipts. Matches subject, body, PDF attachment filenames, and extracted attachment text. Also matches Czech faktura / faktury, Slovak faktúra, Vietnamese hóa đơn, and English invoice.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Natural query, e.g. 'all invoices from last year' or 'faktury 2025'",
        },
        after: { type: "string", description: "Inclusive start date YYYY/MM/DD" },
        before: { type: "string", description: "Exclusive end date YYYY/MM/DD" },
        limit: { type: "number" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_email",
    description: "Fetch one message body and its attachments by account and message id.",
    inputSchema: {
      type: "object",
      properties: {
        accountId: { type: "string" },
        messageId: { type: "string" },
      },
      required: ["accountId", "messageId"],
    },
  },
  {
    name: "search_calendar",
    description: "Search calendar events by text and optional time range.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        start: { type: "string", description: "ISO date or YYYY/MM/DD" },
        end: { type: "string", description: "ISO date or YYYY/MM/DD" },
      },
    },
  },
  {
    name: "list_calendar",
    description: "List calendar events in a date range.",
    inputSchema: {
      type: "object",
      properties: {
        start: { type: "string" },
        end: { type: "string" },
      },
      required: ["start", "end"],
    },
  },
] as const;
