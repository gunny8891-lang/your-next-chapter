import type { AffinityScores } from "@/lib/memory/scoring";

/**
 * What the app has learned about someone's taste, from what they actually do.
 *
 * It reads two records and returns the same AffinityScores shape every consumer already
 * uses (the time engine, My Week's agent, the concierge, the nudges), so improving it
 * improves all of them at once:
 *
 *  - the experience log (shown, opened, saved, planned, completed with how it went,
 *    dismissed with why): rich, with context;
 *  - the older preference signals, for history from before the log existed. A signal
 *    that the log already describes (the same action writes both) is not counted twice.
 *
 * The principles, from the product brief:
 *  - BEHAVIOUR OVER WORDS: loving something you went to counts far more than planning
 *    it, and planning more than glancing at it.
 *  - CONTEXT: a refusal the day explains ("taking it easy") says nothing about taste.
 *  - EVIDENCE, NOT ASSUMPTION: confidence grows with evidence, so one data point is a
 *    hint and ten is a pattern; and it fades with time (half-life about two months), so
 *    old tastes lose their grip without disappearing.
 *  - NEVER OVERWRITES WHAT THEY TOLD US: behaviour can tilt against an interest they
 *    listed, but only so far (see PROTECTED_FLOOR in scoring).
 */

export type LearningEvent = {
  activity_id: string | null;
  event_type: string;
  outcome: string | null;
  reason: string | null;
  context?: { explainedByState?: boolean } | null;
  created_at: string;
  activities: { category: string; tags: string[] } | null;
};

export type LearningSignal = {
  signal_type: string;
  source?: string | null;
  activity_id: string | null;
  created_at: string;
  activities: { category: string; tags: string[] } | null;
};

export type LearnedAffinity = AffinityScores & {
  /** 0 to 1 per key: how much evidence stands behind each score. */
  confidence: { category: Record<string, number>; tag: Record<string, number> };
  /** How many observations (after de-duplication) the scores rest on. */
  evidenceCount: number;
};

const DAY_MS = 86_400_000;
/** After this many days an observation counts half as much. */
const HALF_LIFE_DAYS = 60;
/** Nothing older than this is read. */
export const LEARNING_WINDOW_DAYS = 365;
/** A signal within this long of an event about the same activity is that event's twin. */
const TWIN_WINDOW_MS = 120_000;
/** Evidence softening: with this little evidence, a score is scaled down. */
const CONFIDENCE_K = 1.5;
/** The most one activity can say about a category or a tag, however often they went (softly capped). */
const PER_ACTIVITY_CAP = 4;
/** Window for "what have they been doing lately", used to balance a week. */
const RECENT_DAYS = 28;
/** An idea shown and then left alone, this many days on, counts as quietly ignored. */
const IGNORE_AFTER_DAYS = 2;

export const EVENT_WEIGHT = {
  lovedIt: 3,
  wasFine: 0.5,
  notForMe: -3,
  planned: 1,
  saved: 1.5,
  opened: 0.2,
  /** Plainly "not my thing", unless the day explains it. */
  notMyThing: -2,
  /** Shown and passed over, with no sign of interest: the quietest signal there is. */
  ignored: -0.15,
} as const;

/** Taste weight of one event, or null when it says nothing about taste (logistics, "didn't go", an impression). */
export function weightOfEvent(e: Pick<LearningEvent, "event_type" | "outcome" | "reason" | "context">): number | null {
  switch (e.event_type) {
    case "completed":
      if (e.outcome === "loved") return EVENT_WEIGHT.lovedIt;
      if (e.outcome === "not_for_me") return EVENT_WEIGHT.notForMe;
      return EVENT_WEIGHT.wasFine;
    case "planned":
      return EVENT_WEIGHT.planned;
    case "saved":
      return EVENT_WEIGHT.saved;
    case "opened":
      return EVENT_WEIGHT.opened;
    case "dismissed":
      // Only a plain "not my thing" is about taste, and not when the day explains it.
      return e.reason === "not_my_thing" && !e.context?.explainedByState ? EVENT_WEIGHT.notMyThing : null;
    default:
      return null; // shown: handled as ignoring, below
  }
}

/**
 * Taste weight of one OLD signal (from before the log, or from a place that does not
 * write events yet). Weighted by what the action actually was, not just its label: a
 * "liked" that came from accepting a plan was a yes to a plan, not a verdict on how it went.
 */
export function weightOfSignal(s: Pick<LearningSignal, "signal_type" | "source">): number | null {
  switch (s.signal_type) {
    case "liked":
      return s.source === "explicit_feedback" ? EVENT_WEIGHT.saved : EVENT_WEIGHT.planned;
    case "disliked":
      // Skipping a planned thing means "not this time" (they may have been busy), not a dislike.
      return s.source === "skip" ? -0.25 : EVENT_WEIGHT.notMyThing;
    case "wrong_pace":
      return -0.5;
    default:
      return null; // too far, too expensive, too similar: about this one thing's logistics, not about taste
  }
}

type Observation = { activityId: string | null; category: string; tags: string[]; weight: number; at: number; counts: boolean };

const decay = (ageMs: number) => Math.pow(0.5, ageMs / DAY_MS / HALF_LIFE_DAYS);

/**
 * Pure: the learned affinity. `now` is a parameter so the same history gives the same
 * answer in a test as in production.
 */
export function computeLearnedAffinity(events: LearningEvent[], signals: LearningSignal[], now: Date = new Date()): LearnedAffinity {
  const nowMs = now.getTime();
  const cutoff = nowMs - LEARNING_WINDOW_DAYS * DAY_MS;
  const observations: Observation[] = [];

  const timeOf = (iso: string) => new Date(iso).getTime();

  // --- events ---------------------------------------------------------------
  const usable = events.filter((e) => e.activities && timeOf(e.created_at) >= cutoff);
  const engagedActivity = new Set<string>();
  for (const e of usable) {
    if (e.activity_id && ["opened", "saved", "planned", "completed"].includes(e.event_type)) engagedActivity.add(e.activity_id);
  }
  const eventTimesByActivity = new Map<string, number[]>();
  for (const e of events) {
    if (!e.activity_id) continue;
    const list = eventTimesByActivity.get(e.activity_id) ?? [];
    list.push(timeOf(e.created_at));
    eventTimesByActivity.set(e.activity_id, list);
  }

  const ignoredSeen = new Set<string>();
  for (const e of usable) {
    const a = e.activities!;
    const at = timeOf(e.created_at);
    if (e.event_type === "shown") {
      // An idea put in front of them, never engaged with, and long enough ago that they
      // had the chance: they passed. Counted once per activity, and quietly.
      const key = e.activity_id ?? "";
      if (key && !engagedActivity.has(key) && !ignoredSeen.has(key) && nowMs - at >= IGNORE_AFTER_DAYS * DAY_MS) {
        ignoredSeen.add(key);
        observations.push({ activityId: e.activity_id, category: a.category, tags: a.tags, weight: EVENT_WEIGHT.ignored, at, counts: false });
      }
      continue;
    }
    const weight = weightOfEvent(e);
    if (weight === null) continue;
    observations.push({ activityId: e.activity_id, category: a.category, tags: a.tags, weight, at, counts: e.event_type !== "opened" });
  }

  // --- legacy signals (not already described by an event) --------------------
  for (const s of signals) {
    if (!s.activities || timeOf(s.created_at) < cutoff) continue;
    const at = timeOf(s.created_at);
    const twins = s.activity_id ? eventTimesByActivity.get(s.activity_id) : undefined;
    if (twins?.some((t) => Math.abs(t - at) <= TWIN_WINDOW_MS)) continue;
    const weight = weightOfSignal(s);
    // Every real action counts towards "what have they been doing lately", whatever it taught about taste.
    const counts = true;
    if (weight === null) {
      observations.push({ activityId: s.activity_id, category: s.activities.category, tags: s.activities.tags, weight: 0, at, counts });
      continue;
    }
    observations.push({ activityId: s.activity_id, category: s.activities.category, tags: s.activities.tags, weight, at, counts });
  }

  // --- aggregate -------------------------------------------------------------
  // Evidence about a CATEGORY or a TAG comes from many different places, and breadth
  // matters more than repetition: ten different gardens say something about liking
  // gardens; one garden visited ten times says it likes that garden. So each activity's
  // voice on a key is capped (CAP, softly), and an observation of an activity with several
  // tags is spread across them rather than shouting through every one.
  // What they did about one specific activity is kept whole, in activityScores.
  type Acc = Map<string, { sum: number; mass: number }>; // by activity
  const categories: Record<string, Acc> = {};
  const tags: Record<string, Acc> = {};
  const activities: Record<string, number> = {};
  const recentCategoryCounts: Record<string, number> = {};
  let anonymous = 0;
  const add = (map: Record<string, Acc>, key: string, activityKey: string, w: number) => {
    const acc = (map[key] ??= new Map());
    const row = acc.get(activityKey) ?? { sum: 0, mass: 0 };
    row.sum += w;
    row.mass += Math.abs(w);
    acc.set(activityKey, row);
  };

  for (const o of observations) {
    const w = o.weight * decay(nowMs - o.at);
    const activityKey = o.activityId ?? `unknown-${anonymous++}`;
    if (o.weight !== 0) {
      const spread = 1 / Math.sqrt(Math.max(1, o.tags.length));
      add(categories, o.category, activityKey, w);
      for (const tag of o.tags) add(tags, tag, activityKey, w * spread);
      if (o.activityId) activities[o.activityId] = (activities[o.activityId] ?? 0) + w;
    }
    if (o.counts && nowMs - o.at <= RECENT_DAYS * DAY_MS) recentCategoryCounts[o.category] = (recentCategoryCounts[o.category] ?? 0) + 1;
  }

  const capped = (x: number) => PER_ACTIVITY_CAP * Math.tanh(x / PER_ACTIVITY_CAP);
  const summarise = (acc: Acc) => {
    let sum = 0;
    let mass = 0;
    for (const row of acc.values()) {
      sum += capped(row.sum);
      mass += Math.min(row.mass, PER_ACTIVITY_CAP);
    }
    const confidence = mass / (mass + CONFIDENCE_K);
    return { score: sum * confidence, confidence };
  };

  const categoryScores: Record<string, number> = {};
  const tagScores: Record<string, number> = {};
  const confidence: LearnedAffinity["confidence"] = { category: {}, tag: {} };
  for (const [k, acc] of Object.entries(categories)) {
    const s = summarise(acc);
    categoryScores[k] = s.score;
    confidence.category[k] = s.confidence;
  }
  for (const [k, acc] of Object.entries(tags)) {
    const s = summarise(acc);
    tagScores[k] = s.score;
    confidence.tag[k] = s.confidence;
  }

  return { categoryScores, tagScores, activityScores: activities, recentCategoryCounts, confidence, evidenceCount: observations.length };
}
