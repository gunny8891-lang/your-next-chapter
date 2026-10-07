/**
 * Food and drink places (cafés, pubs, restaurants, tea rooms) live in the same
 * `activities` catalogue as everything else, because the database only allows
 * seven categories and a place to eat is not an activity a weekly plan should be
 * built around. They are told apart by this tag, and kept out of the planner,
 * Surprise Me, nudges and swaps unless a caller asks for them.
 */
export const FOOD_VENUE_TAG = "food-venue";

export type FoodKind = "cafe" | "pub" | "restaurant" | "tea_room";

export function isFoodVenue(a: { tags: string[] }): boolean {
  return a.tags.includes(FOOD_VENUE_TAG);
}

export function foodKindOf(tags: string[]): FoodKind | null {
  if (tags.includes("afternoon-tea")) return "tea_room";
  if (tags.includes("pub")) return "pub";
  if (tags.includes("restaurant")) return "restaurant";
  if (tags.includes("cafe")) return "cafe";
  return null;
}

/**
 * Theatres and cinemas are listed as places, not as shows: nothing in the catalogue says what is on there tonight.
 * Describing a visit as "an evening of theatre" would promise a performance we cannot see, so for these the member
 * is told to check what is on (unless the entry is itself a dated event).
 */
export const PERFORMANCE_VENUE_TAGS = ["theatre", "cinema"];

export function isPerformanceVenue(a: { tags: string[] }): boolean {
  return a.tags.some((t) => PERFORMANCE_VENUE_TAGS.includes(t));
}

export type FoodVenueMode = "exclude" | "include" | "only";

/** Pure: applies a caller's choice about food and drink places to a candidate list. */
export function applyFoodVenueMode<T extends { tags: string[] }>(candidates: T[], mode: FoodVenueMode): T[] {
  if (mode === "include") return candidates;
  return candidates.filter((a) => (mode === "only" ? isFoodVenue(a) : !isFoodVenue(a)));
}
