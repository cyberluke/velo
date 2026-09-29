/** Pull readable strings from a PDF without a full parser. */
export function extractPdfText(bytes: Uint8Array): string {
  const ascii = new TextDecoder("latin1").decode(bytes);
  const chunks: string[] = [];
  const paren = /\((?:\\.|[^\\)]){3,200}\)/g;
  let match: RegExpExecArray | null;
  while ((match = paren.exec(ascii)) !== null) {
    const raw = match[0].slice(1, -1)
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\n")
      .replace(/\\t/g, " ")
      .replace(/\\(.)/g, "$1");
    if (/[A-Za-zÀ-ž0-9]/.test(raw)) chunks.push(raw);
  }
  const hex = /<([0-9A-Fa-f\s]{8,})>/g;
  while ((match = hex.exec(ascii)) !== null) {
    const hexes = match[1]!.replace(/\s+/g, "");
    if (hexes.length % 2 !== 0) continue;
    let decoded = "";
    for (let i = 0; i < hexes.length; i += 2) {
      const code = parseInt(hexes.slice(i, i + 2), 16);
      decoded += code >= 32 && code < 127 ? String.fromCharCode(code) : " ";
    }
    if (/[A-Za-z]{3,}/.test(decoded)) chunks.push(decoded);
  }
  return chunks.join(" ").replace(/\s+/g, " ").trim().slice(0, 20_000);
}

export function looksLikePdf(filename: string | null, mimeType: string | null): boolean {
  const name = (filename ?? "").toLowerCase();
  const mime = (mimeType ?? "").toLowerCase();
  return name.endsWith(".pdf") || mime.includes("pdf");
}
