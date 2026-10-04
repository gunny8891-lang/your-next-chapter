/**
 * Recommendation memory: what has already been suggested, done, loved, turned down.
 *
 * Two opposite instincts have to be told apart:
 *   "I've already done this"        → don't suggest it again for a while
 *   "I love doing this repeatedly"  → a weekly walk is not a repeat to be avoided
 * so the app learns which things are repeatable favourites (done more than once, and
 * never turned down) and which are one-off novelties. And what someone has turned down
 * is remembered, for as long as it deserves: a firm "not for me" for months, "too far"
 * only for a fortnight.
 *
 * Pure: it reads events and a clock, and says what to avoid and what is welcome again.
 */

export type MemoryEvent = {
  activity_id: string | null;
  event_type: string;
  outcome: string | null;
  reason: string | null;
  context?: { explainedByState?: boolean } | null;
  created_at: string;
};

export type RecommendationMemory = {
  /** Done more than once and never turned down: repeating these is welcome. */
  favouriteIds: Set<string>;
  /** Favourites done in the last week: too soon, but only just. */
  recentFavouriteIds: Set<string>;
  /** Activity id → how much to mark it down right now (it fades). */
  rejectionPenalty: Map<string, number>;
  /** Planned but "I didn't go": not done, so not a reason to avoid it. */
  notDoneIds: Set<string>;
  /** Actually gone to (and not turned down) in the last four weeks. */
  recentlyDoneIds: Set<string>;
};

const DAY_MS = 86_400_000;
const RECENT_FAVOURITE_DAYS = 7;
/** How long, and how hard, each kind of "no" is remembered. */
const FIRM_NO = { penalty: 8, days: 90 };
const ALREADY_DONE = { penalty: 8, days: 180 };
const LOGISTICS_NO = { penalty: 4, days: 14 };
const DIDNT_GO_DAYS = 30;
const RECENTLY_DONE_DAYS = 28;

const dayOf = (iso: string) => iso.slice(0, 10);
const fade = (ageMs: number, rule: { penalty: number; days: number }) => rule.penalty * Math.max(0, 1 - ageMs / DAY_MS / rule.days);

export function buildRecommendationMemory(events: MemoryEvent[], now: Date = new Date()): RecommendationMemory {
  const nowMs = now.getTime();
  const byActivity = new Map<string, MemoryEvent[]>();
  for (const e of events) {
    if (!e.activity_id) continue;
    const list = byActivity.get(e.activity_id) ?? [];
    list.push(e);
    byActivity.set(e.activity_id, list);
  }

  const favouriteIds = new Set<string>();
  const recentFavouriteIds = new Set<string>();
  const rejectionPenalty = new Map<string, number>();
  const notDoneIds = new Set<string>();
  const recentlyDoneIds = new Set<string>();

  for (const [id, list] of byActivity) {
    const sorted = [...list].sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
    const completed = sorted.filter((e) => e.event_type === "completed");
    const wentDays = new Set(completed.filter((e) => e.outcome !== "not_for_me").map((e) => dayOf(e.created_at)));
    const turnedDown = completed.some((e) => e.outcome === "not_for_me");
    const loved = completed.find((e) => e.outcome === "loved");
    const plannedAgain = loved ? sorted.some((e) => e.event_type === "planned" && dayOf(e.created_at) > dayOf(loved.created_at)) : false;

    // --- a favourite is something they went to more than once and never turned down ---
    const lastWent = completed.filter((e) => e.outcome !== "not_for_me").map((e) => new Date(e.created_at).getTime()).sort((a, b) => b - a)[0];
    if (lastWent !== undefined && nowMs - lastWent <= RECENTLY_DONE_DAYS * DAY_MS) recentlyDoneIds.add(id);

    const favourite = !turnedDown && (wentDays.size >= 2 || (loved !== undefined && plannedAgain));
    if (favourite) {
      favouriteIds.add(id);
      const last = completed.filter((e) => e.outcome !== "not_for_me").map((e) => new Date(e.created_at).getTime()).sort((a, b) => b - a)[0];
      if (last !== undefined && nowMs - last <= RECENT_FAVOURITE_DAYS * DAY_MS) recentFavouriteIds.add(id);
    }

    // --- what they have turned down, and for how long it should be remembered ---
    let penalty = 0;
    for (const e of sorted) {
      const age = nowMs - new Date(e.created_at).getTime();
      if (e.event_type === "completed" && e.outcome === "not_for_me") penalty = Math.max(penalty, fade(age, FIRM_NO));
      if (e.event_type !== "dismissed") continue;
      if (e.reason === "not_my_thing" && !e.context?.explainedByState) penalty = Math.max(penalty, fade(age, FIRM_NO));
      else if (e.reason === "seen_it" && !favourite) penalty = Math.max(penalty, fade(age, ALREADY_DONE));
      else if (e.reason === "too_far" || e.reason === "too_expensive") penalty = Math.max(penalty, fade(age, LOGISTICS_NO));
    }
    if (penalty > 0) rejectionPenalty.set(id, penalty);

    // --- planned and not done ---
    const lastDidntGo = [...sorted].reverse().find((e) => e.event_type === "dismissed" && e.reason === "didnt_go");
    if (lastDidntGo && nowMs - new Date(lastDidntGo.created_at).getTime() <= DIDNT_GO_DAYS * DAY_MS) {
      const wentAfter = completed.some((e) => e.created_at > lastDidntGo.created_at && e.outcome !== "not_for_me");
      if (!wentAfter) notDoneIds.add(id);
    }
  }

  return { favouriteIds, recentFavouriteIds, rejectionPenalty, notDoneIds, recentlyDoneIds };
}

export const EMPTY_MEMORY: RecommendationMemory = {
  favouriteIds: new Set(),
  recentFavouriteIds: new Set(),
  rejectionPenalty: new Map(),
  notDoneIds: new Set(),
  recentlyDoneIds: new Set(),
};
