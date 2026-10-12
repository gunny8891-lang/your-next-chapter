/**
 * The address a confirmation email was just sent to, kept for an hour in a cookie so the page can offer "send it again"
 * without asking for the address twice. It is a cookie, not part of the web address: an email address in a link ends up in
 * browser history, logs and anything the person shares.
 *
 * It is only ever used to ask for the same message to the same address again from the same browser, and it is never
 * shown in full: the page says "ab***@yahoo.com".
 */

export const PENDING_EMAIL_COOKIE = "ync_pending_email";

export const PENDING_EMAIL_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60,
};

const PLAIN_ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The address from the cookie's value, or null if it is missing or is not one. */
export function readPendingEmail(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  return value.length > 0 && value.length <= 254 && PLAIN_ADDRESS.test(value) ? value : null;
}

/** "grace@yahoo.com" as "gr***@yahoo.com": enough to recognise as theirs, not enough to read out. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  const shown = local.length > 2 ? local.slice(0, 2) : local.slice(0, 1);
  return `${shown}***@${domain}`;
}
