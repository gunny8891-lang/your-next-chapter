import { ACCEPTED_DOCUMENTS } from "@/lib/legal/acceptance";
import { LEGAL_VERSION } from "@/lib/legal/details";

/**
 * Asking a signed-in member to agree again. When the wording of the terms or the privacy
 * notice changes (a new LEGAL_VERSION), or for a member who signed up before agreements
 * were recorded, they are sent to the agree screen before anything else, once. Pure
 * helpers, so the rules can be tested; the sign-in check (middleware.ts) applies them.
 */

export const AGREE_PATH = "/agree";

/** A cookie that remembers "this browser's member has agreed to this version", so the database is not asked on every page. */
export const LEGAL_COOKIE = "lh_legal";

/** For that cookie: kept for a year, not readable by page scripts, sent only over https on the live site. */
export const AGREEMENT_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
};

/**
 * Where a member who has not agreed is NOT sent to the agree screen: the screen itself, the
 * documents they are being asked to read, signing in and out, resetting a password, and
 * their account page (so someone who would rather not agree can delete their account).
 * "/" and "/api/..." are left alone too: the front page is public and jobs and callbacks
 * authenticate themselves.
 */
const EXEMPT = ["/agree", "/account", "/privacy", "/terms", "/unsubscribe", "/auth", "/login", "/signup", "/forgot-password", "/reset-password"];

const under = (pathname: string, route: string) => pathname === route || pathname.startsWith(`${route}/`);

export function pathNeedsAgreement(pathname: string): boolean {
  if (pathname === "/" || pathname.startsWith("/api/")) return false;
  return !EXEMPT.some((route) => under(pathname, route));
}

export function agreementCookieValue(userId: string, version: string = LEGAL_VERSION): string {
  return `${userId}:${version}`;
}

/** Whether the rows read for a member cover every document at the current version. */
export function hasAgreedToCurrent(rows: { document: string }[]): boolean {
  const have = new Set(rows.map((r) => r.document));
  return ACCEPTED_DOCUMENTS.every((document) => have.has(document));
}

/** Where to go after agreeing: only a page on this site, never the agree screen itself, never another address. */
export function safeNext(next: string | null | undefined): string {
  const fallback = "/today";
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\") || /[\r\n]/.test(next)) return fallback;
  if (under(next.split(/[?#]/)[0], AGREE_PATH)) return fallback;
  return next;
}

/** The agree screen's address, remembering the page the member was heading to. */
export function agreeUrl(path: string, search: string = ""): string {
  return `${AGREE_PATH}?next=${encodeURIComponent(path + search)}`;
}
