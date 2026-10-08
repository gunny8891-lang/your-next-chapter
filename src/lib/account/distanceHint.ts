/**
 * Somewhere small has little within reach. A member who chose "walking distance" or "up to 3 miles" in a village sees
 * a week of one or two things and may think the app has little to offer, when a wider distance would show them a lot.
 * This says so, plainly, with the next distance up, only when the result really is thin and a wider setting exists.
 * Pure: it never changes anything, it only says what the setting would do.
 */

/** The distances the set-up and Account offer, in kilometres as stored, nearest first. The words are exactly the answers shown. */
export const TRAVEL_DISTANCES: { km: number; answer: string; reach: string }[] = [
  { km: 1, answer: "Walking distance only", reach: "within walking distance of you" },
  { km: 5, answer: "Up to 3 miles", reach: "within 3 miles of you" },
  { km: 16, answer: "Up to 10 miles", reach: "within 10 miles of you" },
  { km: 40, answer: "I'm happy to travel further", reach: "" },
];

/** Fewer than this many ideas counts as thin. */
export const FEW_IDEAS = 3;

/**
 * "There isn't much within 3 miles of you. Choosing "Up to 10 miles" in Account will show you more." Null when there are
 * enough ideas, when the distance is not known, or when they already travel as far as the app goes.
 */
export function distanceHint(travelRadiusKm: number | null | undefined, ideas: number): string | null {
  if (travelRadiusKm == null || !Number.isFinite(Number(travelRadiusKm)) || ideas >= FEW_IDEAS) return null;
  const index = TRAVEL_DISTANCES.findIndex((d) => d.km >= Number(travelRadiusKm));
  // A distance larger than any offered, or the largest one: nothing wider to suggest.
  if (index === -1 || index === TRAVEL_DISTANCES.length - 1) return null;
  const next = TRAVEL_DISTANCES[index + 1];
  return `There isn't much ${TRAVEL_DISTANCES[index].reach}. Choosing "${next.answer}" in Account will show you more.`;
}

/** A notice with the hint added after it, or whichever of the two there is. */
export function withDistanceHint(notice: string | null, hint: string | null): string | null {
  return [notice, hint].filter((part): part is string => Boolean(part)).join(" ") || null;
}
