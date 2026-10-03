import { describe, expect, it } from "vitest";
import type { OpportunityCandidate } from "@/lib/opportunities/engine";
import type { AffinityScores } from "@/lib/memory/scoring";
import { activityNoun, buildPlan, cleanTitle, estimateCost, fallbackExperienceTitle, titleFitsPlan } from "@/lib/someTime/experience";
import { EMPTY_HISTORY, evaluateCandidate, findFoodStop, type Evaluated, type ScoringInput } from "@/lib/someTime/score";
import { parseChoices } from "@/lib/someTime/prompt";

// Saturday 3 October 2026, free from 13:00 for four hours.
const WINDOW = { date: "2026-10-03", startMin: 13 * 60, endMin: 17 * 60, availableMinutes: 240, minUsefulMinutes: 120 };
const HOME = { lat: 51.65309, lng: -0.2002261 };
const NO_AFFINITY: AffinityScores = { categoryScores: {}, tagScores: {}, activityScores: {}, recentCategoryCounts: {} };

const input: ScoringInput = {
  window: WINDOW,
  request: { start: "now", duration: "half_day", who: "just_me", mood: null, exclude: [] },
  member: {
    budget_band: null,
    interests: [],
    goals: [],
    dietary: null,
    mobility_notes: null,
    travel: { drives: true, uses_public_transport: null, mobility_notes: null },
    home: HOME,
  },
  affinity: NO_AFFINITY,
  history: EMPTY_HISTORY,
  pleasantWeather: false,
};

let n = 0;
const place = (overrides: Partial<OpportunityCandidate> & { km?: number } = {}): OpportunityCandidate => {
  const { km = 1.5, ...rest } = overrides;
  return {
    id: `c${++n}`,
    title: `Place ${n}`,
    description: null,
    category: "Explore",
    address: "Chaplin Square, High Barnet, EN5 1AB",
    price_estimate: null,
    tags: [],
    rating: null,
    accessibility_notes: null,
    location_lat: HOME.lat + km / 111,
    location_lng: HOME.lng,
    booking_url: "https://example.org/place",
    date_time: null,
    expires_at: null,
    recurrence_rule: null,
    duration_minutes: 60,
    ...rest,
  };
};

const evaluate = (c: OpportunityCandidate): Evaluated => evaluateCandidate(c, input)!;
const cafeNear = (main: Evaluated, overrides: Partial<OpportunityCandidate> = {}) =>
  place({
    title: "The Corner Cafe",
    address: "High Street, High Barnet",
    tags: ["food-venue", "cafe"],
    duration_minutes: 40,
    location_lat: main.candidate.location_lat! + 0.3 / 111,
    location_lng: main.candidate.location_lng,
    booking_url: "https://example.org/cafe",
    ...overrides,
  });

describe("activityNoun", () => {
  it("says what the main thing is in plain words", () => {
    expect(activityNoun(["walking", "outdoors"], "Move", "Trent Park")).toBe("A walk");
    expect(activityNoun(["museum", "history"], "Explore", "Kenwood")).toBe("A museum visit");
    expect(activityNoun([], "Joy", "Barnet Museum")).toBe("A museum visit"); // untagged, but the name says so
    expect(activityNoun(["gardens"], "Joy", "Quiet Garden")).toBe("A garden visit");
    expect(activityNoun(["theatre"], "Joy", "Intimate Theatre")).toBe("A trip to the theatre");
    expect(activityNoun(["swimming"], "Move", "Finchley Lido")).toBe("A swim");
  });

  it("names a place to eat by what it is", () => {
    expect(activityNoun(["food-venue", "cafe"], "Joy", "Cafe")).toBe("A coffee break");
    expect(activityNoun(["food-venue", "cafe", "afternoon-tea"], "Joy", "Tea Rooms")).toBe("Afternoon tea");
    expect(activityNoun(["food-venue", "pub"], "Joy", "The Queens")).toBe("A drink out");
    expect(activityNoun(["food-venue", "restaurant"], "Joy", "Rossella")).toBe("A meal out");
  });

  it("falls back to the category, and never to nothing", () => {
    expect(activityNoun([], "Learn", "Something")).toBe("Something new");
    expect(activityNoun([], "Mystery", "Something")).toBe("A good way to spend the time");
  });
});

describe("fallbackExperienceTitle", () => {
  it("names the outing from what it is, any food, and where", () => {
    const main = evaluate(place({ tags: ["walking", "outdoors"], category: "Move" }));
    const food = findFoodStop(main, [cafeNear(main)], input);
    expect(fallbackExperienceTitle(main, food)).toMatch(/^A walk, then .+ in High Barnet$/);
    expect(fallbackExperienceTitle(main, null)).toBe("A walk in High Barnet");
  });

  it("lets a one-off event keep its own name", () => {
    const event = evaluate(place({ title: "Handwriting Analysis for Fun", date_time: "2026-10-03T14:30:00Z", duration_minutes: 60, km: 1 }));
    expect(fallbackExperienceTitle(event, null)).toBe("Handwriting Analysis for Fun");
  });
});

describe("cleanTitle", () => {
  it("keeps a good short title and trims stray quotes and spaces", () => {
    expect(cleanTitle('  "A slow afternoon in Barnet"  ')).toBe("A slow afternoon in Barnet");
  });

  it("rejects what could embarrass: shouting, links, and the wrong length", () => {
    expect(cleanTitle("What a fantastic day out!")).toBeNull();
    expect(cleanTitle("See https://example.org for more")).toBeNull();
    expect(cleanTitle("Go")).toBeNull();
    expect(cleanTitle("x".repeat(90))).toBeNull();
    expect(cleanTitle("A walk and then a long wander and a late lunch and tea and cake besides")).toBeNull();
  });

  it("rejects anything that is not text", () => {
    expect(cleanTitle(undefined)).toBeNull();
    expect(cleanTitle(42)).toBeNull();
  });
});

describe("titleFitsPlan", () => {
  it("lets a title mention a meal only when the plan includes one", () => {
    expect(titleFitsPlan("A walk and a late lunch", false, false)).toBe(false);
    expect(titleFitsPlan("A walk and a late lunch", true, false)).toBe(true);
    expect(titleFitsPlan("A quiet coffee", false, true)).toBe(true); // the main thing is itself food
  });

  it("is fine with a title that mentions no food", () => {
    expect(titleFitsPlan("A slow afternoon in Barnet", false, false)).toBe(true);
    expect(titleFitsPlan("An hour with local history", false, false)).toBe(true);
  });

  it("does not mistake words that merely contain 'tea' or 'pub'", () => {
    expect(titleFitsPlan("A steady stroll round the republic of trees", false, false)).toBe(true);
  });
});

describe("estimateCost", () => {
  it("adds what the main thing costs to a typical spend at the food stop", () => {
    const main = evaluate(place({ price_estimate: 6, tags: ["museum"] }));
    const food = findFoodStop(main, [cafeNear(main)], input)!;
    expect(estimateCost(main, food)).toBe(14); // £6 + a typical £8 at a café
  });

  it("is just the food when the main thing has no known price", () => {
    const main = evaluate(place({ price_estimate: null }));
    const food = findFoodStop(main, [cafeNear(main)], input)!;
    expect(estimateCost(main, food)).toBe(8);
  });

  it("is zero for something free, and unknown when nothing about price is known", () => {
    expect(estimateCost(evaluate(place({ price_estimate: 0 })), null)).toBe(0);
    expect(estimateCost(evaluate(place({ price_estimate: null })), null)).toBeNull();
  });

  it("uses a typical spend when the main thing is itself somewhere to eat", () => {
    expect(estimateCost(evaluate(place({ tags: ["food-venue", "pub"], duration_minutes: 60 })), null)).toBe(15);
  });
});

describe("buildPlan", () => {
  it("is one stop with no travel when there is nothing to add", () => {
    const main = evaluate(place({ title: "Barnet Museum", tags: ["museum"], recurrence_rule: "Mo-Su 10:00-17:00" }));
    const { stops, legs } = buildPlan(main, null);
    expect(stops).toHaveLength(1);
    expect(legs).toEqual([]);
    expect(stops[0]).toMatchObject({ title: "Barnet Museum", subtitle: "High Barnet", kind: "place", url: "https://example.org/place" });
    expect(stops[0].note).toMatch(/^About 1 hour · open until 17:00$/);
  });

  it("puts the food stop after it, with the walk between them and the right times", () => {
    const main = evaluate(place({ tags: ["museum"] }));
    const food = findFoodStop(main, [cafeNear(main)], input)!;
    const { stops, legs } = buildPlan(main, food);
    expect(stops.map((s) => s.kind)).toEqual(["place", "food"]);
    expect(legs).toEqual([{ minutes: food.walkMinutes, mode: "walk" }]);
    expect(legs).toHaveLength(stops.length - 1);
    expect(stops[1].title).toBe("The Corner Cafe");
    expect(stops[1].time > stops[0].time).toBe(true);
  });

  it("shows an event at its real start time, not when you would arrive", () => {
    const event = evaluate(place({ date_time: "2026-10-03T14:30:00Z", duration_minutes: 60, km: 1 }));
    expect(event.arriveMin).toBeLessThan(14 * 60 + 30);
    expect(buildPlan(event, null).stops[0].time).toBe("14:30");
    expect(buildPlan(event, null).stops[0].note).not.toMatch(/open until/);
  });
});

describe("parseChoices — titles", () => {
  const valid = new Set(["a"]);

  it("reads a usable title alongside the explanation", () => {
    const [choice] = parseChoices(JSON.stringify({ options: [{ id: "a", title: "A slow afternoon in Barnet", why: "Lovely." }] }), valid, new Set());
    expect(choice.title).toBe("A slow afternoon in Barnet");
  });

  it("gives null for a title that is missing or unusable, so a built one is used instead", () => {
    const text = (title: unknown) => JSON.stringify({ options: [{ id: "a", title, why: "Lovely." }] });
    expect(parseChoices(text(undefined), valid, new Set())[0].title).toBeNull();
    expect(parseChoices(text("Wow, amazing!"), valid, new Set())[0].title).toBeNull();
  });
});
