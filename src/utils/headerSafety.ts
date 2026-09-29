/**
 * Helpers for emitting safe RFC 5322 header values.
 *
 * Two things go wrong when user-controlled text is written into a header
 * verbatim: a line break ends the header early (everything after it is parsed
 * as new headers), and a non-ASCII byte is not legal in a header at all.
 * Everything here exists to stop one of those two.
 */

const BREAKS = /[\r\n\u2028\u2029\u0000]+/g;

/**
 * Collapse anything that could terminate a header line into a single space.
 * Every value that ends up on the right-hand side of a `Name:` must go
 * through this, either directly or via one of the encoders below.
 */
export function stripHeaderBreaks(value: string): string {
  return (value ?? "").replace(BREAKS, " ").trim();
}

function isAscii(value: string): boolean {
  // eslint-disable-next-line no-control-regex
  return !/[^\x20-\x7e]/.test(value);
}

function base64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/**
 * Encode a header value as RFC 2047 encoded-words when it needs it.
 *
 * Words are kept at or under 75 characters and split on character (not byte)
 * boundaries so multi-byte characters are never cut in half.
 */
export function encodeHeaderValue(value: string): string {
  const safe = stripHeaderBreaks(value);
  if (!safe) return "";
  if (isAscii(safe)) return safe;

  // "=?UTF-8?B?" + "?=" is 12 chars, so the base64 payload gets 63,
  // which is 45 bytes of UTF-8 once rounded down to a base64 group.
  const MAX_BYTES = 45;
  const words: string[] = [];
  let chunk = "";
  let chunkBytes = 0;

  for (const char of safe) {
    const size = new TextEncoder().encode(char).length;
    if (chunkBytes + size > MAX_BYTES) {
      words.push(`=?UTF-8?B?${base64Utf8(chunk)}?=`);
      chunk = "";
      chunkBytes = 0;
    }
    chunk += char;
    chunkBytes += size;
  }
  if (chunk) words.push(`=?UTF-8?B?${base64Utf8(chunk)}?=`);

  return words.join(" ");
}

/**
 * Encode one address. The display name may need encoding; the address itself
 * is left alone apart from break stripping so it stays routable.
 */
export function encodeAddressHeader(rawValue: string): string {
  const safe = stripHeaderBreaks(rawValue);
  if (!safe) return "";

  const match = safe.match(/^(.*?)\s*<([^<>]*)>$/);
  if (!match) return isAscii(safe) ? safe : encodeHeaderValue(safe);

  const rawName = match[1] ?? "";
  const address = match[2] ?? "";
  const name = rawName.replace(/^"|"$/g, "").trim();
  if (!name) return `<${address}>`;
  if (isAscii(name)) {
    return /[",:;<>@\\[\]]/.test(name)
      ? `"${name.replace(/([\\"])/g, "\\$1")}" <${address}>`
      : `${name} <${address}>`;
  }
  return `${encodeHeaderValue(name)} <${address}>`;
}

export function encodeAddressList(values: string[]): string {
  return values.map(encodeAddressHeader).filter(Boolean).join(", ");
}

/**
 * Build the `name=` and `filename=` parameters for a MIME part.
 *
 * A quote in a filename would otherwise close the quoted string early, which
 * is the same escape as a line break but one level down in the message.
 * Non-ASCII names use RFC 2231, with an RFC 2047 `name=` kept alongside for
 * clients that never learned 2231.
 */
export function encodeFilenameParams(filename: string): {
  nameParam: string;
  dispositionParam: string;
} {
  const safe = stripHeaderBreaks(filename) || "attachment";

  if (isAscii(safe)) {
    const quoted = safe.replace(/([\\"])/g, "\\$1");
    return {
      nameParam: `name="${quoted}"`,
      dispositionParam: `filename="${quoted}"`,
    };
  }

  const encoded = encodeURIComponent(safe).replace(/'/g, "%27");
  return {
    nameParam: `name="${encodeHeaderValue(safe)}"`,
    dispositionParam: `filename*=UTF-8''${encoded}`,
  };
}

/**
 * The bare address out of "Name <user@example.com>", for places that need the
 * domain rather than the display form.
 */
export function addressOnly(value: string): string {
  const safe = stripHeaderBreaks(value);
  const match = safe.match(/<([^<>]+)>/);
  return (match?.[1] ?? safe).trim();
}