import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Usage limits for the model-backed features.
 *
 * Why: sign-up is open, every member can trigger paid model calls, and nothing
 * stopped one person (or a script) running up the bill. Measured on real usage: a
 * member-facing call costs about 1 to 4 cents, so those get generous daily caps (a
 * real person never meets them) plus a daily cost ceiling as a backstop. The regional
 * web search used by discovery costs about $1.30 a call, which is a different order
 * of thing, so it has its own small per-member and system-wide budget.
 *
 * Every model call already goes through callClaude and is logged to ai_usage_logs
 * (successes and failures alike), so the limits simply read that log. They fail OPEN:
 * if the log cannot be read, a member is never refused because of our own fault.
 * Admins are exempt. When a limit is reached each feature degrades gracefully (see the
 * callers): suggestions fall back to the scored picks, a week to the standard plan.
 */

/** Calls per member per (London) day, by feature. Real use is a fraction of this. */
export const MEMBER_DAILY_CALLS: Record<string, number> = {
  concierge_chat: 40,
  some_time: 40,
  itinerary_agent: 8,
};

/** Estimated spend per member per day across every feature: the backstop under the call caps. */
export const MEMBER_DAILY_COST_USD = 1.0;

/** Features that cost cents a call and are billed to a member. Anything else is not capped per member. */
const CAPPED_FEATURES = new Set(Object.keys(MEMBER_DAILY_CALLS));

/** The paid regional web search. One costs about $1.30, so a few a day is the most the system allows. */
export const SEARCH_FEATURE = "discovery_claude_web_search";
export const SEARCH_DAILY_BUDGET_USD = 4.0;
/** One member-triggered regional search per member per day (each new town costs real money). */
export const SEARCH_MEMBER_DAILY_LIMIT = 1;

export type UsageRow = { feature: string; estimated_cost: number | string | null };

export type LimitDecision = { allowed: true } | { allowed: false; reason: "calls" | "cost"; feature: string };

/** Raised instead of making a model call that would go over a limit. Callers catch it and degrade. */
export class UsageLimitError extends Error {
  readonly reason: "calls" | "cost" | "search_budget" | "search_member";
  readonly feature: string;

  constructor(reason: UsageLimitError["reason"], feature: string) {
    super(`Usage limit reached (${reason}) for ${feature}`);
    this.name = "UsageLimitError";
    this.reason = reason;
    this.feature = feature;
  }
}

const cost = (r: UsageRow) => Number(r.estimated_cost ?? 0) || 0;

/** Pure: may this member make one more call to `feature`, given what they have used today? */
export function decideMemberCall(todays: UsageRow[], feature: string): LimitDecision {
  if (!CAPPED_FEATURES.has(feature)) return { allowed: true };
  const calls = todays.filter((r) => r.feature === feature).length;
  if (calls >= (MEMBER_DAILY_CALLS[feature] ?? Infinity)) return { allowed: false, reason: "calls", feature };
  const spend = todays.filter((r) => CAPPED_FEATURES.has(r.feature)).reduce((sum, r) => sum + cost(r), 0);
  if (spend >= MEMBER_DAILY_COST_USD) return { allowed: false, reason: "cost", feature };
  return { allowed: true };
}

/** Pure: may a regional web search start, given today's searches overall and by this member? */
export function decideSearch(allToday: UsageRow[], memberToday: UsageRow[] | null): { allowed: true } | { allowed: false; reason: "search_budget" | "search_member" } {
  const spent = allToday.filter((r) => r.feature === SEARCH_FEATURE).reduce((sum, r) => sum + cost(r), 0);
  if (spent >= SEARCH_DAILY_BUDGET_USD) return { allowed: false, reason: "search_budget" };
  if (memberToday && memberToday.filter((r) => r.feature === SEARCH_FEATURE).length >= SEARCH_MEMBER_DAILY_LIMIT) {
    return { allowed: false, reason: "search_member" };
  }
  return { allowed: true };
}

/**
 * Pure: the instant the member's current (London) day began, as an ISO string. A "day"
 * is a London calendar day, in step with how the rest of the app talks about today.
 * London midnight is 00:00 UTC in winter and 23:00 UTC the evening before in summer; on
 * the two days the clocks change, midnight and noon can be on different sides of the
 * change, so rather than infer an offset the instant is found by checking which of the two
 * candidates actually reads 00:00 in London on that date.
 */
export function londonDayStartIso(now: Date = new Date()): string {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const midnightUtc = Date.parse(`${date}T00:00:00Z`);
  const reads = (ms: number) => ({
    date: new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms)),
    time: new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(ms)),
  });
  for (const offsetHours of [0, 1]) {
    const candidate = midnightUtc - offsetHours * 3_600_000;
    const r = reads(candidate);
    if (r.date === date && r.time === "00:00") return new Date(candidate).toISOString();
  }
  return new Date(midnightUtc).toISOString();
}

async function usageSince(admin: SupabaseClient, sinceIso: string, filter: { userId?: string | null; feature?: string } = {}): Promise<UsageRow[] | null> {
  let query = admin.from("ai_usage_logs").select("feature, estimated_cost").gte("created_at", sinceIso).limit(2000);
  if (filter.userId) query = query.eq("user_id", filter.userId);
  if (filter.feature) query = query.eq("feature", filter.feature);
  const { data, error } = await query;
  if (error) {
    console.warn("usage limits: could not read the usage log (allowing the call):", error.message);
    return null;
  }
  return (data ?? []) as UsageRow[];
}

async function isAdmin(admin: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await admin.from("users").select("role").eq("id", userId).maybeSingle();
  return data?.role === "admin";
}

/**
 * Called before a member-billed model call. Throws UsageLimitError when a limit is
 * reached, and otherwise returns. Fails open on any problem reading the log.
 */
export async function assertWithinMemberLimits(admin: SupabaseClient, userId: string, feature: string, now: Date = new Date()): Promise<void> {
  if (!CAPPED_FEATURES.has(feature)) return;
  const todays = await usageSince(admin, londonDayStartIso(now), { userId });
  if (!todays) return;
  const decision = decideMemberCall(todays, feature);
  if (decision.allowed) return;
  if (await isAdmin(admin, userId)) return;
  console.warn(`usage limits: member ${userId.slice(0, 8)} reached the daily ${decision.reason} limit for ${feature}`);
  throw new UsageLimitError(decision.reason, feature);
}

/**
 * Whether a regional web search may start now. `memberId` is the member whose
 * sign-up or location change triggered it, or null for the nightly job (which is
 * held only to the system-wide budget). Fails open on any problem reading the log.
 */
export async function searchAllowed(admin: SupabaseClient, memberId: string | null, now: Date = new Date()): Promise<{ allowed: true } | { allowed: false; reason: UsageLimitError["reason"] }> {
  const since = londonDayStartIso(now);
  const all = await usageSince(admin, since, { feature: SEARCH_FEATURE });
  if (!all) return { allowed: true };
  const mine = memberId ? await usageSince(admin, since, { userId: memberId, feature: SEARCH_FEATURE }) : null;
  return decideSearch(all, mine);
}
