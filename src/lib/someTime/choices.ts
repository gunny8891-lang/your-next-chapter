import { clockLabel, durationLabel } from "@/lib/someTime/window";
import type { DurationChoice, Mood, StartChoice } from "@/lib/someTime/request";
import type { SurpriseWho } from "@/lib/surprise/context";

/**
 * The questions "I've got some time" asks, and the small amount of logic that
 * decides which to offer. Kept out of the component so it can be tested.
 *
 * The aim is the fewest possible taps: one question at a time, sensible answers
 * remembered or inferred, and "when" and "who with" tucked behind a quiet link.
 */

export const DURATION_OPTIONS: { value: Exclude<DurationChoice, "until_next">; label: string; hint: string }[] = [
  { value: "30m", label: "30 mins", hint: "A quick break" },
  { value: "1-2h", label: "1–2 hours", hint: "A good stretch" },
  { value: "half_day", label: "Half a day", hint: "Around four hours" },
  { value: "rest_of_day", label: "Rest of today", hint: "Until this evening" },
];

/** Surprise me first and most prominent; the rest are ways to steer it. */
export const MOOD_OPTIONS: { value: Mood; label: string }[] = [
  { value: "surprise", label: "Surprise me" },
  { value: "outdoors", label: "Outdoors" },
  { value: "food", label: "Food" },
  { value: "culture", label: "Culture" },
  { value: "social", label: "Social" },
  { value: "relaxed", label: "Relaxed" },
];

export const WHO_OPTIONS: { value: SurpriseWho; label: string }[] = [
  { value: "just_me", label: "Just me" },
  { value: "partner", label: "Partner" },
  { value: "friends", label: "Friends" },
  { value: "family", label: "Family" },
];

const START_LABEL: Record<StartChoice, string> = {
  now: "Starting now",
  afternoon: "This afternoon",
  evening: "This evening",
};

/** The starts still worth offering at this hour: "this afternoon" is no use at 6pm. */
export function availableStarts(hour: number): { value: StartChoice; label: string }[] {
  const starts: { value: StartChoice; label: string }[] = [{ value: "now", label: "Now" }];
  if (hour < 17) starts.push({ value: "afternoon", label: "This afternoon" });
  if (hour < 21) starts.push({ value: "evening", label: "This evening" });
  return starts;
}

export function startLabel(start: StartChoice): string {
  return START_LABEL[start];
}

export type Commitment = { title: string; startMin: number };

/**
 * The next thing already in the member's day that has a clock time, after now.
 * `items` are today's planned things; those without a time ("Morning") or that the
 * member has skipped are not commitments.
 */
export function nextCommitment(items: { title: string; time: string; skipped?: boolean }[], nowMin: number): Commitment | null {
  let best: Commitment | null = null;
  for (const item of items) {
    if (item.skipped) continue;
    const m = item.time.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) continue;
    const startMin = Number(m[1]) * 60 + Number(m[2]);
    if (startMin <= nowMin) continue;
    if (!best || startMin < best.startMin) best = { title: item.title, startMin };
  }
  return best;
}

const MIN_GAP_FOR_UNTIL = 40;
const MAX_GAP_FOR_UNTIL = 8 * 60;

/**
 * "Until Tennis", offered as the first choice when there is a sensible gap before
 * a planned thing: enough to do something, not so long that "rest of today" says
 * the same. Null when there is nothing worth offering.
 */
export function untilOption(commitment: Commitment | null, nowMin: number): { label: string; hint: string; untilMin: number } | null {
  if (!commitment) return null;
  const gap = commitment.startMin - nowMin;
  if (gap < MIN_GAP_FOR_UNTIL || gap > MAX_GAP_FOR_UNTIL) return null;
  const title = commitment.title.length > 28 ? `${commitment.title.slice(0, 27).trimEnd()}…` : commitment.title;
  return { label: `Until ${title}`, hint: `Back by ${clockLabel(commitment.startMin)}`, untilMin: commitment.startMin };
}

/** The answers so far, in a line: "1–2 hours · Starting now". */
export function summaryLine(parts: { duration: DurationChoice; start: StartChoice; untilMin?: number | null; mood?: Mood | null }): string {
  const length =
    parts.duration === "until_next" && parts.untilMin != null
      ? `Until ${clockLabel(parts.untilMin)}`
      : (DURATION_OPTIONS.find((d) => d.value === parts.duration)?.label ?? durationLabel(60));
  const mood = parts.mood && parts.mood !== "surprise" ? MOOD_OPTIONS.find((m) => m.value === parts.mood)?.label : null;
  return [length, START_LABEL[parts.start], mood].filter(Boolean).join(" · ");
}
