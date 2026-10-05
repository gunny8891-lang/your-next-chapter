/**
 * What a member is told when signing up, logging in or resetting a password goes wrong.
 *
 * The sign-in provider's own wording is for developers ("Error sending confirmation
 * email", "Email rate limit exceeded"), and showing it to a member is both unhelpful and
 * a worry. So a failure is reduced to a short code, kept in the address the page is
 * redirected to, and turned into a kind sentence only when the page is drawn. Keeping a
 * code rather than the sentence in the address also means a crafted link cannot put
 * words of someone else's choosing on our page.
 */

export type AuthErrorCode =
  | "email_send"
  | "rate_limit"
  | "weak_password"
  | "invalid_email"
  | "signups_closed"
  | "bad_credentials"
  | "unconfirmed"
  | "link_expired"
  | "confirm_failed"
  | "generic";

const MESSAGES: Record<AuthErrorCode, string> = {
  email_send: "We couldn't send your confirmation email just now. Please try again in a little while.",
  rate_limit: "There have been a lot of attempts just now. Please wait a few minutes and try again.",
  weak_password: "That password is too easy to guess. Please choose one with at least 6 characters, ideally a mix of letters and numbers.",
  invalid_email: "That doesn't look like a valid email address. Please check it and try again.",
  signups_closed: "We aren't able to open new accounts at the moment. Please try again later.",
  bad_credentials: "That email and password don't match. Please check them and try again.",
  unconfirmed: "Please open the link we emailed you to confirm your address, then log in.",
  link_expired: "That link has expired. Please ask for a new one.",
  confirm_failed: "We couldn't confirm your email from that link. It may have expired, so please try signing up again.",
  generic: "Something went wrong on our side. Please try again in a few minutes.",
};

const KNOWN = new Set<string>(Object.keys(MESSAGES));

type ProviderError = { message?: string; code?: string; status?: number } | null | undefined;

/** Reduces the provider's error to one of our own codes. Unknown failures become "generic". */
export function classifyAuthError(error: ProviderError): AuthErrorCode {
  const code = (error?.code ?? "").toLowerCase();
  const text = (error?.message ?? "").toLowerCase();

  if (code === "over_email_send_rate_limit" || code === "over_request_rate_limit" || code === "over_sms_send_rate_limit") return "rate_limit";
  if (/rate limit|too many requests|security purposes/.test(text) || error?.status === 429) return "rate_limit";

  if (code === "weak_password" || /password should|password is too|weak password|signup requires a valid password/.test(text)) return "weak_password";
  if (code === "email_address_invalid" || code === "validation_failed" || /invalid format|unable to validate email|email address .* is invalid/.test(text)) return "invalid_email";
  if (code === "signup_disabled" || code === "email_provider_disabled" || /signups not allowed|signup is disabled/.test(text)) return "signups_closed";
  if (code === "invalid_credentials" || /invalid login credentials/.test(text)) return "bad_credentials";
  if (code === "email_not_confirmed" || /email not confirmed/.test(text)) return "unconfirmed";
  // The mail sender refusing or failing: the situation behind a sign-up that "does nothing".
  if (/error sending (confirmation|recovery|magic link|email)|sending .* email|smtp|email address not authorized/.test(text) || code === "email_address_not_authorized") return "email_send";

  return "generic";
}

/** The sentence for a code from an address, or null if there is no error to show. Anything unrecognised is the generic sentence. */
export function authErrorMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  return MESSAGES[(KNOWN.has(code) ? code : "generic") as AuthErrorCode];
}
