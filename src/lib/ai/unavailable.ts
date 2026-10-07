/**
 * When the AI cannot answer, what the member is told, and what we are told.
 *
 * Most features already carry on without it (the week falls back to our usual favourites,
 * Today's suggestions to scored ones), so this is for the places that must say something. The
 * member never sees the provider's wording: an account that has run out of credit or an
 * invalid key is OUR problem to fix, not something to explain to a member, and a raw error
 * is both unhelpful and worrying. Those are logged loudly for the person running the app
 * instead (see callClaude), and shown on the admin costs page.
 *
 * Pure: it only looks at the error it is given.
 */

export type AiFailureKind =
  | "daily_limit" // our own per-member limit for today
  | "out_of_credit" // the provider account has no credit left
  | "auth" // the provider rejected our key
  | "rate_limited" // too many requests at once
  | "overloaded" // the provider is busy or down
  | "network" // could not reach the provider
  | "other";

type ErrorLike = { name?: unknown; message?: unknown; status?: unknown } | null | undefined;

/** Reduces whatever was thrown to one of our own kinds. Unknown failures are "other". */
export function classifyAiFailure(err: unknown): AiFailureKind {
  const e = (typeof err === "object" ? err : null) as ErrorLike;
  const name = String(e?.name ?? "");
  const message = String(e?.message ?? (typeof err === "string" ? err : ""));
  const status = typeof e?.status === "number" ? e.status : null;

  if (name === "UsageLimitError") return "daily_limit";
  if (/credit balance is too low|purchase credits|plans\s*&\s*billing|billing/i.test(message)) return "out_of_credit";
  if (status === 401 || status === 403 || /AuthenticationError|PermissionDenied/i.test(name) || /invalid x-api-key|authentication_error|api key/i.test(message)) return "auth";
  if (status === 429 || /RateLimit/i.test(name) || /rate.?limit/i.test(message)) return "rate_limited";
  if ((status !== null && status >= 500) || /overloaded|InternalServerError/i.test(name + " " + message)) return "overloaded";
  if (/APIConnection|fetch failed|ECONN|ETIMEDOUT|ENOTFOUND|timed? ?out|network|socket/i.test(name + " " + message)) return "network";
  return "other";
}

/** A failure only the person running the app can fix (not a passing hiccup, not a member's limit). */
export function needsOperator(kind: AiFailureKind): boolean {
  return kind === "out_of_credit" || kind === "auth";
}

const TODAY_AND_EXPLORE = "Your ideas on Today and Explore are still here for you.";

/** For a screen or a button. */
export function memberMessage(kind: AiFailureKind): string {
  if (kind === "daily_limit") return `We've reached today's limit for this, so please try again tomorrow. ${TODAY_AND_EXPLORE}`;
  if (kind === "other") return "Sorry, something went wrong on our side. Please try again in a moment.";
  return `Lark Hour's helper is taking a short break. Please try again in a little while. ${TODAY_AND_EXPLORE}`;
}

/** For the concierge, which speaks in the first person. */
export function chatMessage(kind: AiFailureKind): string {
  if (kind === "daily_limit") return `We've talked a great deal today, and I'd like to leave something for tomorrow. Please ask me again then. ${TODAY_AND_EXPLORE}`;
  if (kind === "other") return "Sorry, I'm having trouble answering right now. Please try again in a moment.";
  return `I'm taking a short break just now. Please ask me again in a little while. ${TODAY_AND_EXPLORE}`;
}

/** What to tell the person running the app, for the failures only they can fix. Empty for the rest. */
export function operatorAlert(kind: AiFailureKind): string {
  if (kind === "out_of_credit") return "Anthropic says the account is out of credit, so every AI feature is failing. Add credit or turn on auto-reload at https://platform.claude.com/settings/billing";
  if (kind === "auth") return "Anthropic rejected the API key, so every AI feature is failing. Check ANTHROPIC_API_KEY in Vercel and in the Anthropic console.";
  return "";
}
