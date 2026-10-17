/**
 * A web address worth keeping as a link: http or https, to a real host, of sensible length. Anything a search or a page hands
 * us that is not that (a script address, a bare word, a very long string) is dropped rather than shown to members as a "Book"
 * link or sent in an email. Pure.
 */

const MAX_URL = 500;

export function safeHttpUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  if (!text || text.length > MAX_URL || /[\u0000-\u001f\u007f\s]/.test(text)) return null;
  try {
    const url = new URL(text);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!url.hostname.includes(".") || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}
