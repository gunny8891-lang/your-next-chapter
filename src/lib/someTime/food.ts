import type { FoodKind } from "@/lib/opportunities/kinds";

/** What a person typically spends at each kind of place. Used only to judge a budget, never shown as a price. */
const TYPICAL_SPEND: Record<FoodKind, number> = {
  cafe: 8,
  pub: 15,
  restaurant: 25,
  tea_room: 22,
};

export function typicalSpend(kind: FoodKind): number {
  return TYPICAL_SPEND[kind];
}

// Times of day (minutes after midnight) when each kind of place makes sense to
// arrive at. A café at 7am is fine; a restaurant at 4pm is not a meal.
const MEAL_WINDOWS: Record<FoodKind, [number, number][]> = {
  cafe: [[7 * 60 + 30, 17 * 60]],
  tea_room: [[13 * 60 + 30, 16 * 60 + 30]],
  pub: [[11 * 60 + 30, 21 * 60 + 30]],
  restaurant: [
    [11 * 60 + 45, 14 * 60 + 30],
    [17 * 60 + 30, 21 * 60],
  ],
};

export function suitsMealTime(kind: FoodKind, arriveMin: number): boolean {
  return MEAL_WINDOWS[kind].some(([from, to]) => arriveMin >= from && arriveMin <= to);
}

/** What the visit is, in words, at that time: "coffee", "lunch", "afternoon tea", "dinner", "a drink". */
export function mealLabel(kind: FoodKind, arriveMin: number): string {
  if (kind === "tea_room") return "afternoon tea";
  if (kind === "restaurant") return arriveMin < 16 * 60 ? "lunch" : "dinner";
  if (kind === "pub") return arriveMin < 15 * 60 ? "lunch" : arriveMin < 17 * 60 + 30 ? "a drink" : "dinner";
  return arriveMin < 11 * 60 ? "breakfast or coffee" : arriveMin < 15 * 60 ? "lunch or coffee" : "coffee and cake";
}
