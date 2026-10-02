import type { SurpriseWho } from "@/lib/surprise/context";

/** When the free time starts: right now, or a later part of today. */
export type StartChoice = "now" | "afternoon" | "evening";
export type DurationChoice = "30m" | "1-2h" | "half_day" | "rest_of_day";
export type Mood = "surprise" | "social" | "active" | "culture" | "relaxed" | "food";

export type TimeRequest = {
  start: StartChoice;
  duration: DurationChoice;
  who: SurpriseWho;
  /** null = the member did not say, which is treated like "surprise me". */
  mood: Mood | null;
  /** Suggestions already seen in this sitting, so "show me different ideas" really is different. */
  exclude: string[];
};

const STARTS: StartChoice[] = ["now", "afternoon", "evening"];
const DURATIONS: DurationChoice[] = ["30m", "1-2h", "half_day", "rest_of_day"];
const WHOS: SurpriseWho[] = ["just_me", "partner", "friends", "family"];
const MOODS: Mood[] = ["surprise", "social", "active", "culture", "relaxed", "food"];
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

  const exclude = Array.isArray(r.exclude)
    ? r.exclude.filter((id): id is string => typeof id === "string" && /^[0-9a-f-]{8,40}$/i.test(id)).slice(0, MAX_EXCLUDED)
    : [];

  return { start, duration, who, mood: oneOf(r.mood, MOODS), exclude };
}

export const MOOD_LABEL: Record<Mood, string> = {
  surprise: "Surprise me",
  social: "Social",
  active: "Active",
  culture: "Culture / interesting",
  relaxed: "Relaxed",
  food: "Food & drink",
};
