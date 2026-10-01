import { getDb } from "@/services/db/connection";
import { logAudit } from "@/services/db/auditLog";

/**
 * Build a single EML document from a message row.
 * Mirrors the MIME structure the parser stored: HTML preferred, plain fallback.
 */
function messageToEml(msg: {
  id: string;
  from_name: string | null;
  from_address: string | null;
  to_addresses: string | null;
  cc_addresses: string | null;
  subject: string | null;
  date: number;
  body_html: string | null;
  body_text: string | null;
  message_id_header: string | null;
  references_header: string | null;
  in_reply_to_header: string | null;
}): string {
  const date = new Date(msg.date).toUTCString();
  const from = msg.from_name
    ? `${msg.from_name} <${msg.from_address}>`
    : (msg.from_address ?? "");
  const lines = [
    `From: ${from}`,
    `To: ${msg.to_addresses ?? ""}`,
    msg.cc_addresses ? `Cc: ${msg.cc_addresses}` : null,
    `Subject: ${msg.subject ?? ""}`,
    `Date: ${date}`,
    `Message-ID: ${msg.message_id_header ?? `<${msg.id}>`}`,
    msg.references_header ? `References: ${msg.references_header}` : null,
    msg.in_reply_to_header ? `In-Reply-To: ${msg.in_reply_to_header}` : null,
    "MIME-Version: 1.0",
    msg.body_html
      ? "Content-Type: text/html; charset=UTF-8"
      : "Content-Type: text/plain; charset=UTF-8",
    "",
    msg.body_html ?? msg.body_text ?? "",
  ].filter((l): l is string => l !== null);
  return lines.join("\r\n");
}

/** One thread as a single .eml file. */
export async function buildThreadEml(
  accountId: string,
  threadId: string,
): Promise<string> {
  const db = await getDb();
  const rows = await db.select<
    Array<{
      id: string;
      from_name: string | null;
      from_address: string | null;
      to_addresses: string | null;
      cc_addresses: string | null;
      subject: string | null;
      date: number;
      body_html: string | null;
      body_text: string | null;
      message_id_header: string | null;
      references_header: string | null;
      in_reply_to_header: string | null;
    }>
  >(
    `SELECT id, from_name, from_address, to_addresses, cc_addresses, subject, date,
            body_html, body_text, message_id_header, references_header, in_reply_to_header
     FROM messages
     WHERE account_id = $1 AND thread_id = $2 AND is_read_receipt = 0
     ORDER BY date ASC`,
    [accountId, threadId],
  );
  await logAudit("export_thread_eml", { threadId, messages: rows.length }, accountId);
  return rows.map(messageToEml).join("\r\n\r\n");
}

/**
 * Whole mailbox as one MBOX file (mboxrd format). Every message becomes one
 * From_ line + the raw EML; lines beginning with "From " are quoted per the
 * mboxrd convention so the file round-trips losslessly.
 */
export async function buildAccountMbox(accountId: string): Promise<string> {
  const db = await getDb();
  const rows = await db.select<
    Array<{
      id: string;
      from_name: string | null;
      from_address: string | null;
      to_addresses: string | null;
      cc_addresses: string | null;
      subject: string | null;
      date: number;
      body_html: string | null;
      body_text: string | null;
      message_id_header: string | null;
      references_header: string | null;
      in_reply_to_header: string | null;
    }>
  >(
    `SELECT id, from_name, from_address, to_addresses, cc_addresses, subject, date,
            body_html, body_text, message_id_header, references_header, in_reply_to_header
     FROM messages
     WHERE account_id = $1 AND is_read_receipt = 0
     ORDER BY date ASC`,
    [accountId],
  );
  const blocks = rows.map((msg) => {
    const fromLine = msg.from_address ?? "MAILER-DAEMON";
    const date = new Date(msg.date).toUTCString();
    const eml = messageToEml(msg);
    // mboxrd: escape any line that starts with "From " inside the body
    const escaped = eml
      .split("\r\n")
      .map((line) => (line.startsWith("From ") ? `>${line}` : line))
      .join("\r\n");
    return `From ${fromLine} ${date}\r\n${escaped}\r\n`;
  });
  await logAudit("export_account_mbox", { messages: rows.length }, accountId);
  return blocks.join("\r\n");
}

/** Count messages an MBOX export would include (for a pre-flight confirmation). */
export async function countAccountMessages(accountId: string): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ count: number }[]>(
    "SELECT COUNT(*) AS count FROM messages WHERE account_id = $1 AND is_read_receipt = 0",
    [accountId],
  );
  return rows[0]?.count ?? 0;
}