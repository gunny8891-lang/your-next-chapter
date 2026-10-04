import { settingOf } from "@/lib/someTime/format";
import type { Mood } from "@/lib/someTime/request";

/**
 * Daily State: how someone says they are TODAY. Temporary context for today's
 * suggestions, never a lasting trait: "taking it easy today" must not become
 * "prefers easy things". Nothing here reads or writes history; it only adjusts a
 * score for one day, and describes the day in a sentence.
 *
 * It is deliberately small and made only of fixed choices (no free text), and it is
 * not a health tracker: energy is "energetic, normal or taking it easy", the way
 * anyone would say it, and nothing is inferred from it.
 */

export type Energy = "low" | "normal" | "high";

export type DailyState = {
  energy: Energy;
  /** What they feel like today, in the same words as the "what do you feel like" choices. */
  intention: Mood | null;
  /** Would rather be indoors today. */
  indoors: boolean;
  /** Would rather not walk much today. */
  lessWalking: boolean;
};

export const ENERGY_OPTIONS: { value: Energy; label: string }[] = [
  { value: "high", label: "Energetic" },
  { value: "normal", label: "Normal" },
  { value: "low", label: "Taking it easy" },
];

/** In the order they are offered. "Feeling good" is not an intention, so energy ("Normal") covers it. */
export const INTENTION_OPTIONS: { value: Mood; label: string }[] = [
  { value: "outdoors", label: "Get outside" },
  { value: "social", label: "Something social" },
  { value: "culture", label: "Something interesting" },
  { value: "food", label: "Food & drink" },
  { value: "relaxed", label: "Relax" },
  { value: "active", label: "Be active" },
  { value: "surprise", label: "Surprise me" },
];

const ENERGIES: Energy[] = ["low", "normal", "high"];
const MOODS: Mood[] = ["surprise", "outdoors", "social", "active", "culture", "relaxed", "food"];

/** Pure: turns whatever arrived (a form, a database row) into a DailyState, or null if it is not one. */
export function parseDailyState(raw: unknown): DailyState | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.energy !== "string" || !ENERGIES.includes(r.energy as Energy)) return null;
  const intention = typeof r.intention === "string" && MOODS.includes(r.intention as Mood) ? (r.intention as Mood) : null;
  return {
    energy: r.energy as Energy,
    intention,
    indoors: r.indoors === true,
    // The database stores it in snake_case; a form posts it in camelCase.
    lessWalking: r.lessWalking === true || r.less_walking === true,
  };
}

/** "taking it easy, would like to get outside, indoors" for the model and for the member's own summary. */
export function describeDailyState(state: DailyState): string {
  const parts: string[] = [];
  parts.push({ low: "taking it easy", normal: "feeling normal", high: "feeling energetic" }[state.energy]);
  const intention = INTENTION_OPTIONS.find((o) => o.value === state.intention);
  if (intention) parts.push(`would like: ${intention.label.toLowerCase()}`);
  if (state.indoors) parts.push("would rather be indoors");
  if (state.lessWalking) parts.push("would rather not walk much");
  return parts.join("; ");
}

/** The coarse values kept with an experience so learning can tell a bad day from a dislike. Never free text. */
export function coarseContext(state: DailyState | null): { energy?: Energy; intention?: Mood } {
  if (!state) return {};
  return { energy: state.energy, ...(state.intention ? { intention: state.intention } : {}) };
}

type CandidateShape = { category: string; tags: string[] };

export type DailyStateAdjustment = { score: number; reasons: string[]; /** Not worth offering today at all. */ exclude: boolean };

/** A demanding outing this long is not offered to someone taking it easy. */
const EXCLUDE_DEMANDING_MIN = 150;

const GENTLE = ["relaxation", "gardens", "quiet", "books", "afternoon-tea", "cafe", "gentle exercise", "yoga", "museum", "theatre", "cinema"];
const EXERTION = ["walking", "fitness", "hiking", "running", "cycling"];

const has = (c: CandidateShape, ...tags: string[]) => tags.some((t) => c.tags.includes(t));

/** Something that asks something of the body: not a stroll round a garden, and not yoga. */
function isDemanding(c: CandidateShape): boolean {
  if (has(c, "gentle exercise", "yoga")) return false;
  return has(c, ...EXERTION) || c.category === "Move";
}

/**
 * How well one candidate suits today, as a score adjustment and the reasons worth
 * saying out loud. Zero when there is no Daily State, so someone who never uses it
 * sees no change at all.
 *
 * What they say about TODAY outranks what they usually like: a long walk lover who is
 * taking it easy should not be offered a three-hour walk however much they usually
 * enjoy it. So the hard limits (a long demanding outing on a low-energy day, walking
 * when they would rather not, outdoors when they want to be inside) are decisive: the
 * first excludes the idea, the others weigh more than a strong habit does (a loved
 * activity scores up to +12). The soft ones (a gentle place for a quiet day, a little
 * energy to spend) are small nudges.
 */
export function dailyStateAdjustment(
  state: DailyState | null,
  c: CandidateShape,
  how: { durationMinutes: number; travelMinutes: number }
): DailyStateAdjustment {
  if (!state) return { score: 0, reasons: [], exclude: false };
  let score = 0;
  let exclude = false;
  const reasons: string[] = [];
  const setting = settingOf(c.tags);
  const demanding = isDemanding(c);

  if (state.energy === "low") {
    if (demanding) {
      // Hours of exertion on a day they are taking it easy: not something to offer at all.
      if (how.durationMinutes >= EXCLUDE_DEMANDING_MIN) exclude = true;
      else score -= how.durationMinutes >= 100 ? 6 : 2.5;
    }
    if (how.travelMinutes > 25) score -= Math.min(3, (how.travelMinutes - 25) / 8);
    if (has(c, ...GENTLE)) {
      score += 1.5;
      reasons.push("it is gentle, for a day you are taking it easy");
    }
  } else if (state.energy === "high" && (demanding || setting === "outdoors")) {
    score += 1;
    reasons.push("you have energy today");
  }

  if (state.indoors) {
    if (setting === "outdoors") score -= 8;
    else if (setting === "indoors") {
      score += 1;
      reasons.push("it is indoors, as you would like today");
    }
  }

  if (state.lessWalking) {
    if (has(c, "walking")) score -= 10;
    if (how.travelMinutes > 20) score -= 1;
  }

  return { score: Math.max(-12, Math.min(3, score)), reasons, exclude };
}

/**
 * Pure: a request with no mood of its own takes the one they said they feel like
 * today. A mood chosen for this request always wins: choosing "Food" in the sheet is
 * more specific than "Get outside" at breakfast.
 */
export function requestWithDailyState<T extends { mood: Mood | null }>(request: T, state: DailyState | null): T {
  if (request.mood || !state?.intention) return request;
  return { ...request, mood: state.intention };
}
