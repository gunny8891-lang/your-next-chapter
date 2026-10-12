import type { SurpriseWho } from "@/lib/surprise/context";
import { parseContext, type ExperienceContext } from "@/lib/context/constraints";

/** When the free time starts: right now, a later part of today, or another day (from the morning). */
export type StartChoice = "now" | "afternoon" | "evening" | "tomorrow" | "saturday" | "sunday";

/** Whether this is a day that has not started, so it begins in the morning and "until my next thing" means nothing. */
export const isLaterDay = (start: StartChoice): boolean => start === "tomorrow" || start === "saturday" || start === "sunday";
/** "until_next" is the time before the next thing already in the member's day (see untilMin). */
export type DurationChoice = "30m" | "1-2h" | "half_day" | "all_day" | "rest_of_day" | "until_next";
export type Mood = "surprise" | "outdoors" | "social" | "active" | "culture" | "relaxed" | "food";

export type TimeRequest = {
  start: StartChoice;
  duration: DurationChoice;
  who: SurpriseWho;
  /** null = the member did not say, which is treated like "surprise me". */
  mood: Mood | null;
  /** With duration "until_next": when the next commitment starts, in minutes after midnight. */
  untilMin?: number | null;
  /** Suggestions already seen in this sitting, so "show me different ideas" really is different. */
  exclude: string[];
  /** What they have said about THIS outing (the dog is coming): see context/constraints.ts. Absent when they said nothing. */
  context?: ExperienceContext;
  /**
   * Where they are right now, when they asked for ideas near here rather than near home. Used for this search only: it is
   * never stored, and absent means "from home".
   */
  here?: HereLocation;
};

export type HereLocation = { lat: number; lng: number };

/** The United Kingdom's rough bounds: the app is UK-only, and a position outside them is a broken reading, not a place. */
const UK_BOUNDS = { latMin: 49.8, latMax: 60.9, lngMin: -8.7, lngMax: 1.9 };

/** A position from the browser, kept only if it is a sensible one in the UK. Anything else is treated as "from home". */
export function parseHere(raw: unknown): HereLocation | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { lat, lng } = raw as Record<string, unknown>;
  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < UK_BOUNDS.latMin || lat > UK_BOUNDS.latMax || lng < UK_BOUNDS.lngMin || lng > UK_BOUNDS.lngMax) return null;
  // To about 100 metres: enough to find what is near, and no more precise than the search needs.
  return { lat: Math.round(lat * 1000) / 1000, lng: Math.round(lng * 1000) / 1000 };
}

const STARTS: StartChoice[] = ["now", "afternoon", "evening", "tomorrow", "saturday", "sunday"];
const DURATIONS: DurationChoice[] = ["30m", "1-2h", "half_day", "all_day", "rest_of_day", "until_next"];
const WHOS: SurpriseWho[] = ["just_me", "partner", "friends", "family"];
const MOODS: Mood[] = ["surprise", "outdoors", "social", "active", "culture", "relaxed", "food"];
const MAX_EXCLUDED = 40;

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

/**
 * Validates a request that arrived from the browser. Anything unrecognised in a
 * required field rejects the whole request; an unrecognised mood just means "no
 * mood", and the exclusion list is trimmed to plausible ids.
 */
export function parseTimeRequest(raw: unknown): TimeRequest | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;

  const start = oneOf(r.start, STARTS);
  const duration = oneOf(r.duration, DURATIONS);
  const who = oneOf(r.who, WHOS);
  if (!start || !duration || !who) return null;

  // "Until my next thing" only means something with a time to be back for.
  const rawUntil = typeof r.untilMin === "number" && Number.isInteger(r.untilMin) && r.untilMin >= 0 && r.untilMin < 1440 ? r.untilMin : null;
  if (duration === "until_next" && rawUntil === null) return null;

  const exclude = Array.isArray(r.exclude)
    ? r.exclude.filter((id): id is string => typeof id === "string" && /^[0-9a-f-]{8,40}$/i.test(id)).slice(0, MAX_EXCLUDED)
    : [];

  const context = parseContext(r.context);
  const here = parseHere(r.here);
  return {
    start,
    duration,
    who,
    mood: oneOf(r.mood, MOODS),
    untilMin: duration === "until_next" ? rawUntil : null,
    exclude,
    ...(Object.keys(context).length > 0 ? { context } : {}),
    ...(here ? { here } : {}),
  };
}

export const MOOD_LABEL: Record<Mood, string> = {
  surprise: "Surprise me",
  outdoors: "Outdoors",
  social: "Social",
  active: "Active",
  culture: "Culture / interesting",
  relaxed: "Relaxed",
  food: "Food & drink",
};
