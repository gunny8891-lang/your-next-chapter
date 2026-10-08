import type { CategoryName } from "@/lib/categories";
import { foodKindOf, isFoodVenue, isPerformanceVenue } from "@/lib/opportunities/kinds";
import { friendlyDuration, placeLabel } from "@/lib/someTime/format";
import { typicalSpend } from "@/lib/someTime/food";
import type { Evaluated, FoodStop } from "@/lib/someTime/score";
import type { PlanLeg, PlanStop } from "@/lib/someTime/types";
import { clockLabel } from "@/lib/someTime/window";

/**
 * Turns a scored idea into the shape a member reads: a title for the whole
 * outing, the stops in order with the travel between them, and what it will
 * roughly cost. Everything is built from facts we hold — a name, a place, a time,
 * a typical spend — so a plan never claims more than we know.
 */

// What the main thing is, in a phrase a person would use. First match wins.
const NOUNS: [(tags: string[], title: string) => boolean, string][] = [
  [(t, n) => t.includes("museum") || /\bmuseum\b/i.test(n), "A museum visit"],
  [(t) => t.includes("heritage") || t.includes("history"), "A heritage visit"],
  [(t) => t.includes("gardens"), "A garden visit"],
  [(t) => t.includes("walking") || t.includes("nature"), "A walk"],
  [(t) => t.includes("books"), "A quiet hour with books"],
  [(t) => t.includes("theatre"), "A trip to the theatre"],
  [(t) => t.includes("cinema"), "A trip to the cinema"],
  [(t) => t.includes("swimming"), "A swim"],
  [(t) => t.includes("yoga"), "A yoga session"],
  [(t) => t.includes("fitness"), "A workout"],
  [(t) => t.includes("arts") || t.includes("classes"), "A visit to the arts"],
  [(t) => t.includes("community") || t.includes("social"), "A community catch-up"],
  [(t) => t.includes("playground"), "A playground outing"],
];

const CATEGORY_NOUN: Record<string, string> = {
  Move: "An active outing",
  Connect: "Time with other people",
  Learn: "Something new",
  Explore: "A little exploring",
  "Give Back": "A way to give back",
  Wellness: "Time for yourself",
  Joy: "A treat",
};

const FOOD_NOUN = { cafe: "A coffee break", tea_room: "Afternoon tea", pub: "A drink out", restaurant: "A meal out" } as const;

export function activityNoun(tags: string[], category: string, title: string): string {
  const kind = foodKindOf(tags);
  if (kind && tags.includes("food-venue")) return FOOD_NOUN[kind];
  for (const [matches, noun] of NOUNS) if (matches(tags, title)) return noun;
  return CATEGORY_NOUN[category] ?? "A good way to spend the time";
}

/**
 * A title for the whole outing when the model has not supplied one. A one-off
 * event keeps its own name; anything else is "A walk, then coffee and cake in
 * High Barnet".
 */
export function fallbackExperienceTitle(main: Evaluated, food: FoodStop | null): string {
  const c = main.candidate;
  if (main.eventStartMin !== null) return c.title;
  // A theatre or cinema with nothing listed: do not promise a performance, point at the place.
  if (isPerformanceVenue(c)) return `See what's on at ${c.title}${food ? `, then ${food.meal}` : ""}`;

  const noun = activityNoun(c.tags, c.category, c.title);
  const then = food ? `, then ${food.meal}` : "";
  const place = placeLabel(c.address);
  return `${noun}${then}${place ? ` in ${place}` : ""}`;
}

/**
 * Cleans a title the model wrote: a short plain phrase, never a sentence with
 * shouting, a link or a figure it cannot know. Returns null if it is unusable, so
 * the caller falls back rather than showing something odd.
 */
export function cleanTitle(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const title = raw.replace(/\s+/g, " ").trim().replace(/^["'“”]+|["'“”]+$/g, "");
  if (title.length < 6 || title.length > 70) return null;
  if (/[!]|https?:|www\.|@/.test(title)) return null;
  if (title.split(" ").length > 11) return null;
  return title;
}

const PERFORMANCE_WORDS = /\b(shows?|performances?|concerts?|screenings?|gigs?|matinees?|productions?|films?|plays?)\b|\b(evening|night|afternoon|day) (of|at the) (theatre|cinema|film|music|comedy|drama)\b|\bnight out\b|\btrip to the (theatre|cinema)\b/i;

const MEAL_WORDS = /\b(lunch|dinner|breakfast|brunch|coffee|tea|pub|caf[eé]|drinks?|meal|supper|bite)\b/i;

/** A part of the day named in a title, and when it is true to say it (minutes after midnight, when they arrive). */
const PART_OF_DAY: [RegExp, (arriveMin: number) => boolean][] = [
  [/\bmorning\b/i, (m) => m < 12 * 60 + 30],
  [/\bafternoon\b/i, (m) => m >= 12 * 60 && m < 18 * 60],
  [/\b(evening|night)\b/i, (m) => m >= 17 * 60],
];

/**
 * Whether a title is honest about the plan: it may only talk about a meal or a
 * drink if the plan actually includes one, and about a part of the day only if that
 * is when they arrive (the model is told so, but a promise is worth checking).
 */
export function titleFitsPlan(title: string, planIncludesFood: boolean, mainIsFood: boolean, noListing = false, arriveMin: number | null = null): boolean {
  // A theatre or cinema with no show listed: a title must not describe a performance, a film or a night out.
  if (noListing && PERFORMANCE_WORDS.test(title)) return false;
  // "An afternoon of arts" for a plan that starts at twenty-five past ten is a small lie.
  if (arriveMin !== null && PART_OF_DAY.some(([word, fits]) => word.test(title) && !fits(arriveMin))) return false;
  if (planIncludesFood || mainIsFood) return true;
  return !MEAL_WORDS.test(title);
}

/** Roughly what the outing costs per person, from what is known; null when nothing about price is known. */
export function estimateCost(main: Evaluated, food: FoodStop | null): number | null {
  const mainFood = foodKindOf(main.candidate.tags);
  const mainPrice = main.candidate.price_estimate != null ? Number(main.candidate.price_estimate) : mainFood && isFoodVenue(main.candidate) ? typicalSpend(mainFood) : null;
  const foodKind = food ? foodKindOf(food.candidate.tags) : null;
  const foodPrice = food && foodKind ? (food.candidate.price_estimate != null ? Number(food.candidate.price_estimate) : typicalSpend(foodKind)) : null;
  if (mainPrice === null && foodPrice === null) return null;
  return Math.round((mainPrice ?? 0) + (foodPrice ?? 0));
}

const KIND_ICON_CATEGORY: CategoryName = "Joy";

/** The stops in order, and the travel between each pair. */
export function buildPlan(main: Evaluated, food: FoodStop | null): { stops: PlanStop[]; legs: PlanLeg[] } {
  const c = main.candidate;
  const mainIsFood = isFoodVenue(c);
  const stops: PlanStop[] = [
    {
      time: clockLabel(main.eventStartMin ?? main.arriveMin),
      title: c.title,
      subtitle: placeLabel(c.address),
      note: `About ${friendlyDuration(main.durationMinutes)}${main.openUntil != null && main.eventStartMin === null ? ` · open until ${clockLabel(main.openUntil)}` : ""}`,
      kind: mainIsFood ? "food" : "place",
      category: c.category as CategoryName,
      url: c.booking_url,
    },
  ];
  const legs: PlanLeg[] = [];

  if (food) {
    legs.push({ minutes: food.walkMinutes, mode: "walk" });
    stops.push({
      time: clockLabel(food.arriveMin),
      title: food.candidate.title,
      subtitle: placeLabel(food.candidate.address),
      note: `${food.meal.charAt(0).toUpperCase()}${food.meal.slice(1)}${food.openUntil != null ? ` · open until ${clockLabel(food.openUntil)}` : ""}`,
      kind: "food",
      category: KIND_ICON_CATEGORY,
      url: food.candidate.booking_url,
    });
  }
  return { stops, legs };
}
