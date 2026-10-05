import { randomBytes, timingSafeEqual } from "node:crypto";

/**
 * The anti-forgery value for the Google consent round trip. A random value is set in a
 * cookie before sending the member to Google and comes back in the address Google returns
 * them to; the two must match, or the return is refused. That stops someone tricking a
 * signed-in member's browser into connecting the attacker's calendar.
 */

export const STATE_COOKIE = "ync_calendar_state";
export const STATE_MAX_AGE_SECONDS = 600;

export function newState(): string {
  return randomBytes(24).toString("base64url");
}

/** Constant-time comparison; false for anything missing or of a different length. */
export function stateMatches(fromCookie: string | undefined | null, fromQuery: string | undefined | null): boolean {
  if (!fromCookie || !fromQuery) return false;
  const a = Buffer.from(fromCookie);
  const b = Buffer.from(fromQuery);
  return a.length === b.length && timingSafeEqual(a, b);
}
