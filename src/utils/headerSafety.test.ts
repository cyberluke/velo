import { describe, it, expect } from "vitest";
import {
  addressOnly,
  encodeAddressHeader,
  encodeAddressList,
  encodeFilenameParams,
  encodeHeaderValue,
  stripHeaderBreaks,
} from "./headerSafety";
import { buildRawEmail } from "./emailBuilder";
import { parseMailtoUrl } from "./mailtoParser";

function decodeRaw(raw: string): string {
  const padded = raw.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function headerBlock(raw: string): string {
  return decodeRaw(raw).split("\r\n\r\n")[0];
}

describe("stripHeaderBreaks", () => {
  it("collapses CR, LF and CRLF", () => {
    expect(stripHeaderBreaks("a\r\nb")).toBe("a b");
    expect(stripHeaderBreaks("a\nb\rc")).toBe("a b c");
  });

  it("collapses line and paragraph separators and NUL", () => {
    expect(stripHeaderBreaks("a\u2028b\u2029c\u0000d")).toBe("a b c d");
  });

  it("trims the result", () => {
    expect(stripHeaderBreaks("\r\n hello \r\n")).toBe("hello");
  });
});

describe("encodeHeaderValue", () => {
  it("leaves plain ASCII alone", () => {
    expect(encodeHeaderValue("Meeting at 10")).toBe("Meeting at 10");
  });

  it("encodes non-ASCII as RFC 2047 encoded-words", () => {
    const encoded = encodeHeaderValue("Zamówienie ąę");
    expect(encoded).toMatch(/^=\?UTF-8\?B\?/);
    expect(encoded).not.toContain("ó");
  });

  it("keeps every encoded-word within the 75 character limit", () => {
    const encoded = encodeHeaderValue("ą".repeat(200));
    for (const word of encoded.split(" ")) {
      expect(word.length).toBeLessThanOrEqual(75);
    }
  });

  it("never splits a multi-byte character across words", () => {
    const source = "źdźbło ".repeat(30).trim();
    const decoded = encodeHeaderValue(source)
      .split(" ")
      .map((word) => {
        const payload = word.slice("=?UTF-8?B?".length, -"?=".length);
        const binary = atob(payload);
        return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
      })
      .join("");
    expect(decoded).toBe(source);
  });
});

describe("encodeAddressHeader", () => {
  it("keeps a plain address as-is", () => {
    expect(encodeAddressHeader("user@example.com")).toBe("user@example.com");
  });

  it("leaves the address literal and encodes only the display name", () => {
    const encoded = encodeAddressHeader("Michał Kowalski <m@example.com>");
    expect(encoded).toContain("<m@example.com>");
    expect(encoded).toMatch(/^=\?UTF-8\?B\?/);
  });

  it("quotes a display name containing specials", () => {
    expect(encodeAddressHeader("Doe, John <j@example.com>")).toBe(
      '"Doe, John" <j@example.com>',
    );
  });

  it("drops a break smuggled into the display name", () => {
    const encoded = encodeAddressHeader("Bob\r\nBcc: attacker@evil.com <b@example.com>");
    expect(encoded).not.toMatch(/[\r\n]/);
  });
});

describe("encodeAddressList", () => {
  it("joins addresses with a comma", () => {
    expect(encodeAddressList(["a@example.com", "b@example.com"])).toBe(
      "a@example.com, b@example.com",
    );
  });

  it("skips empty entries", () => {
    expect(encodeAddressList(["a@example.com", "", "  "])).toBe("a@example.com");
  });
});

describe("encodeFilenameParams", () => {
  it("quotes an ASCII filename", () => {
    const { nameParam, dispositionParam } = encodeFilenameParams("report.pdf");
    expect(nameParam).toBe('name="report.pdf"');
    expect(dispositionParam).toBe('filename="report.pdf"');
  });

  it("escapes a quote so it cannot close the parameter early", () => {
    const { dispositionParam } = encodeFilenameParams('a".pdf');
    expect(dispositionParam).toBe('filename="a\\".pdf"');
  });

  it("uses RFC 2231 for a non-ASCII filename", () => {
    const { dispositionParam } = encodeFilenameParams("umowa-ąę.pdf");
    expect(dispositionParam).toMatch(/^filename\*=UTF-8''/);
    expect(dispositionParam).not.toContain("ą");
  });

  it("falls back to a default when the name is only breaks", () => {
    expect(encodeFilenameParams("\r\n").dispositionParam).toBe('filename="attachment"');
  });
});

describe("addressOnly", () => {
  it("unwraps an angle-bracketed address", () => {
    expect(addressOnly("Jane Doe <jane@example.com>")).toBe("jane@example.com");
  });

  it("passes a bare address through", () => {
    expect(addressOnly("jane@example.com")).toBe("jane@example.com");
  });
});

describe("buildRawEmail header safety", () => {
  const base = {
    from: "me@example.com",
    to: ["you@example.com"],
    htmlBody: "<p>hi</p>",
  };

  it("does not let a subject open a new header", () => {
    const headers = headerBlock(
      buildRawEmail({ ...base, subject: "Hi\r\nBcc: attacker@evil.com" }),
    );
    expect(headers).not.toMatch(/^Bcc:/m);
    expect(headers).toContain("Subject: Hi Bcc: attacker@evil.com");
  });

  it("does not let a recipient open a new header", () => {
    const headers = headerBlock(
      buildRawEmail({
        ...base,
        to: ["you@example.com\r\nBcc: attacker@evil.com"],
        subject: "Hi",
      }),
    );
    expect(headers).not.toMatch(/^Bcc:/m);
  });

  it("does not let In-Reply-To or References open a new header", () => {
    const headers = headerBlock(
      buildRawEmail({
        ...base,
        subject: "Hi",
        inReplyTo: "<a@example.com>\r\nBcc: attacker@evil.com",
        references: "<b@example.com>\r\nX-Injected: yes",
      }),
    );
    expect(headers).not.toMatch(/^Bcc:/m);
    expect(headers).not.toMatch(/^X-Injected:/m);
  });

  it("does not let an attachment filename open a new MIME header", () => {
    const raw = decodeRaw(
      buildRawEmail({
        ...base,
        subject: "Hi",
        attachments: [
          {
            filename: 'x.pdf"\r\nContent-Type: text/html',
            mimeType: "application/pdf",
            content: "AAAA",
          },
        ],
      }),
    );
    expect(raw).not.toMatch(/^Content-Type: text\/html$/m);
    expect(raw).toContain('x.pdf\\" Content-Type: text/html');
  });

  it("emits a non-ASCII subject as encoded-words, not raw UTF-8", () => {
    const headers = headerBlock(buildRawEmail({ ...base, subject: "Zamówienie ąę" }));
    expect(headers).toContain("Subject: =?UTF-8?B?");
    expect(headers).not.toContain("Zamówienie");
  });

  it("builds a Message-ID from the address, not the display form", () => {
    const headers = headerBlock(
      buildRawEmail({ ...base, from: "Jane Doe <jane@example.com>", subject: "Hi" }),
    );
    expect(headers).toMatch(/^Message-ID: <[^@]+@example\.com>$/m);
  });
});

describe("parseMailtoUrl header safety", () => {
  it("strips breaks from the subject", () => {
    const parsed = parseMailtoUrl(
      "mailto:a@example.com?subject=Hi%0D%0ABcc:%20attacker@evil.com",
    );
    expect(parsed.subject).not.toMatch(/[\r\n]/);
  });

  it("strips breaks from recipients", () => {
    const parsed = parseMailtoUrl(
      "mailto:a@example.com%0D%0ABcc:%20attacker@evil.com?cc=c@example.com%0D%0AX-Evil:%20y",
    );
    expect(parsed.to.join("")).not.toMatch(/[\r\n]/);
    expect(parsed.cc.join("")).not.toMatch(/[\r\n]/);
  });

  it("keeps line breaks in the body", () => {
    const parsed = parseMailtoUrl("mailto:a@example.com?body=line1%0D%0Aline2");
    expect(parsed.body).toContain("\n");
  });
});