const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
export function encodeBase64(bytes: Uint8Array): string {
  const chunks: string[] = []; let chunk = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
    chunk += alphabet[a >> 2] + alphabet[((a & 3) << 4) | ((b ?? 0) >> 4)] + (b === undefined ? "=" : alphabet[((b & 15) << 2) | ((c ?? 0) >> 6)]) + (c === undefined ? "=" : alphabet[c & 63]);
    if (chunk.length >= 8192) { chunks.push(chunk); chunk = ""; }
  }
  chunks.push(chunk); return chunks.join("");
}
export function decodeBase64(text: string): Uint8Array {
  if (text.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(text)) throw new Error("Invalid base64");
  const bytes = new Uint8Array(text.length / 4 * 3 - (text.endsWith("==") ? 2 : text.endsWith("=") ? 1 : 0)); let at = 0;
  for (let i = 0; i < text.length; i += 4) { const a = alphabet.indexOf(text[i]), b = alphabet.indexOf(text[i + 1]), c = alphabet.indexOf(text[i + 2]), d = alphabet.indexOf(text[i + 3]); bytes[at++] = (a << 2) | (b >> 4); if (at < bytes.length) bytes[at++] = ((b & 15) << 4) | (c >> 2); if (at < bytes.length) bytes[at++] = ((c & 3) << 6) | d; }
  return bytes;
}
