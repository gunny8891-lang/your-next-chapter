import { describe, expect, it } from "vitest";
import type { OpportunityCandidate } from "@/lib/opportunities/engine";
import type { AffinityScores } from "@/lib/memory/scoring";
import { checkConstraints, describeContext, parseContext, withinSpend } from "@/lib/context/constraints";
import { parseTimeRequest } from "@/lib/someTime/request";
import { buildRecommendations, type RecommendInputs } from "@/lib/someTime/recommend";
import { balanceCost, EMPTY_HISTORY, evaluateCandidate, limitExpensive, placeFacts, tierOfPlace, type Evaluated } from "@/lib/someTime/score";
import type { TimeWindow } from "@/lib/someTime/window";

describe("what they want to spend on this outing", () => {
  it("is read from the browser only as one of the offered choices", () => {
    expect(parseContext({ spend: "free" })).toEqual({ spend: "free" });
    expect(parseContext({ spend: "low" })).toEqual({ spend: "low" });
    expect(parseContext({ spend: "mid" })).toEqual({ spend: "mid" });
    expect(parseContext({ spend: "any" })).toEqual({});
    expect(parseContext({ spend: 20 })).toEqual({});
    expect(parseContext({ spend: "free", dog: true })).toEqual({ spend: "free", dog: true });
    expect(parseTimeRequest({ start: "now", duration: "1-2h", who: "just_me", context: { spend: "low" } })?.context).toEqual({ spend: "low" });
  });

  it("leaves out what costs more, keeps what fits, and says to check when the price is not known", () => {
    expect(checkConstraints({ price_estimate: 0 }, { spend: "free" }).excluded).toBe(false);
    expect(checkConstraints({ price_estimate: 6 }, { spend: "free" }).excluded).toBe(true);
    expect(checkConstraints({ price_estimate: 15 }, { spend: "low" }).excluded).toBe(false);
    expect(checkConstraints({ price_estimate: 16 }, { spend: "low" }).excluded).toBe(true);
    expect(checkConstraints({ price_estimate: 40 }, { spend: "mid" }).excluded).toBe(false);
    expect(checkConstraints({ price_estimate: 41 }, { spend: "mid" }).excluded).toBe(true);
    expect(checkConstraints({}, { spend: "low" })).toMatchObject({ excluded: false, unverified: ["Check the price"] });
    expect(checkConstraints({ price_type: "free" }, { spend: "free" })).toMatchObject({ excluded: false, unverified: [] });
  });

  it("asks nothing when they did not choose, or said they do not mind", () => {
    expect(checkConstraints({ price_estimate: 500 }, {})).toMatchObject({ excluded: false, unverified: [] });
    expect(checkConstraints({ price_estimate: 500 }, undefined)).toMatchObject({ excluded: false, unverified: [] });
  });

  it("counts the whole outing, the main thing and the stop together", () => {
    expect(withinSpend(15, { spend: "low" })).toBe(true);
    expect(withinSpend(16, { spend: "low" })).toBe(false);
    expect(withinSpend(0, { spend: "free" })).toBe(true);
    expect(withinSpend(1, { spend: "free" })).toBe(false);
    expect(withinSpend(999, {})).toBe(true);
    expect(withinSpend(999, undefined)).toBe(true);
  });

  it("is described to the model with the rule not to call anything free that is not", () => {
    expect(describeContext({ spend: "free" })[0]).toMatch(/free things/);
    expect(describeContext({ spend: "free" })[0]).toMatch(/Never call a place free/);
    expect(describeContext({ spend: "mid" })[0]).toMatch(/£40/);
    expect(describeContext({})).toEqual([]);
  });
});

describe("a place's cost when nothing was recorded", () => {
  const base = { tags: [] as string[], price_estimate: null } as unknown as OpportunityCandidate;

  it("is judged by what its kind of place usually costs, never as free", () => {
    expect(tierOfPlace({ ...base, tags: ["food-venue", "cafe"] })).toBe("low");
    expect(tierOfPlace({ ...base, tags: ["food-venue", "restaurant"] })).toBe("mid");
    expect(placeFacts({ ...base, tags: ["food-venue", "pub"] }).price_estimate).toBe(15);
  });

  it("is unknown, not free, for an ordinary place with no price", () => {
    expect(tierOfPlace(base)).toBeNull();
    expect(tierOfPlace({ ...base, price_estimate: 0 })).toBe("free");
  });
});

// ---- ranking and the mix -------------------------------------------------------------

const WINDOW: TimeWindow = { date: "2026-10-02", startMin: 11 * 60, endMin: 16 * 60, availableMinutes: 300, minUsefulMinutes: 45 };
const BARNET = { lat: 51.65309, lng: -0.2002261 };
const NO_AFFINITY: AffinityScores = { categoryScores: {}, tagScores: {}, activityScores: {}, recentCategoryCounts: {} };

let n = 0;
const place = (overrides: Partial<OpportunityCandidate> = {}): OpportunityCandidate => ({
  id: `id-${++n}`,
  title: `Place ${n}`,
  description: null,
  category: "Explore",
  address: "Somewhere, Barnet",
  price_estimate: null,
  tags: ["museum"],
  rating: null,
  accessibility_notes: null,
  location_lat: BARNET.lat + 1.5 / 111,
  location_lng: BARNET.lng,
  booking_url: "https://example.org",
  date_time: null,
  expires_at: null,
  recurrence_rule: null,
  duration_minutes: 60,
  ...overrides,
});

const scoringInput = (extra: Partial<Parameters<typeof evaluateCandidate>[1]> = {}): Parameters<typeof evaluateCandidate>[1] => ({
  window: WINDOW,
  request: { start: "now", duration: "half_day", who: "just_me", mood: null, exclude: [] },
  member: { budget_band: null, interests: [], goals: [], dietary: null, mobility_notes: null, travel: { drives: true, uses_public_transport: null, mobility_notes: null }, home: BARNET },
  affinity: NO_AFFINITY,
  history: EMPTY_HISTORY,
  pleasantWeather: false,
  ...extra,
});

const evaluated = (c: OpportunityCandidate, score: number): Evaluated => ({ ...evaluateCandidate(c, scoringInput())!, score });

describe("keeping the options mixed in cost", () => {
  const dear = (title: string, score: number) => evaluated(place({ title, price_estimate: 60 }), score);
  const cheap = (title: string, score: number) => evaluated(place({ title, price_estimate: 5 }), score);
  const unknown = (title: string, score: number) => evaluated(place({ title }), score);

  it("keeps no more than one expensive option among those shown, bringing the next best up", () => {
    const sorted = [dear("A", 9), dear("B", 8), dear("C", 7), cheap("D", 6), cheap("E", 5)];
    const titles = balanceCost(sorted).map((e) => e.candidate.title);
    expect(titles.slice(0, 3)).toEqual(["A", "D", "E"]);
    expect(titles).toHaveLength(5);
    expect(titles.slice(3).sort()).toEqual(["B", "C"]);
  });

  it("brings a cheap idea up when the first few offer nothing like it", () => {
    const sorted = [dear("A", 9), evaluated(place({ title: "M1", price_estimate: 30 }), 8), evaluated(place({ title: "M2", price_estimate: 25 }), 7), cheap("D", 6)];
    const titles = balanceCost(sorted).map((e) => e.candidate.title);
    expect(titles.slice(0, 3)).toContain("D");
    expect(titles).toHaveLength(4);
  });

  it("does not disturb a list that is already mixed, or an idea whose price is not known", () => {
    const sorted = [dear("A", 9), unknown("U", 8), cheap("C", 7), cheap("D", 6)];
    expect(balanceCost(sorted).map((e) => e.candidate.title)).toEqual(["A", "U", "C", "D"]);
    expect(balanceCost([])).toEqual([]);
  });

  it("does the same check on a choice the model made", () => {
    const e1 = dear("A", 9);
    const e2 = dear("B", 8);
    const e3 = cheap("C", 7);
    const kept = limitExpensive([e1, e2, e3].map((e) => ({ evaluated: e })));
    expect(kept.map((k) => k.evaluated.candidate.title)).toEqual(["A", "C"]);
  });
});

const inputs = (candidates: OpportunityCandidate[], extra: Partial<RecommendInputs> = {}): RecommendInputs => ({
  request: { start: "now", duration: "half_day", who: "just_me", mood: null, exclude: [] },
  window: WINDOW,
  candidates,
  weatherNote: null,
  pleasantWeather: false,
  daylight: { sunriseMin: 7 * 60, sunsetMin: 18 * 60 },
  member: { budget_band: null, interests: [], goals: [], dietary: null, mobility_notes: null, travel: { drives: true, uses_public_transport: null, mobility_notes: null }, home: BARNET },
  affinity: NO_AFFINITY,
  history: EMPTY_HISTORY,
  profile: { goals: [], interests: [], budget_band: null, dietary: null, mobility_notes: null, personality: null },
  aspirations: [],
  ask: null,
  ...extra,
});

describe("through the whole recommendation", () => {
  const free = (title: string, category: string) => place({ title, category, price_estimate: 0, price_type: "free", tags: ["museum"] });
  const mid = (title: string, category: string, price = 25) => place({ title, category, price_estimate: price, tags: ["museum"] });
  const noPrice = (title: string, category: string) => place({ title, category, tags: ["museum"] });

  it("offers only what fits when they chose Free, and says to check the price when nothing is known to be free", async () => {
    const { options } = await buildRecommendations(inputs([free("Free Museum", "Explore"), mid("Paid Gallery", "Learn"), noPrice("Mystery", "Joy")], { request: { start: "now", duration: "half_day", who: "just_me", mood: null, exclude: [], context: { spend: "free" } } }));
    expect(options.map((o) => o.title)).toEqual(["Free Museum"]);
    expect(options[0].costTier).toBe("free");

    const unknownOnly = await buildRecommendations(inputs([mid("Paid Gallery", "Learn"), noPrice("Mystery", "Joy")], { request: { start: "now", duration: "half_day", who: "just_me", mood: null, exclude: [], context: { spend: "free" } } }));
    expect(unknownOnly.options.map((o) => o.title)).toEqual(["Mystery"]);
    expect(unknownOnly.options[0].contextNotes).toEqual(["Check the price"]);
    expect(unknownOnly.options[0].costTier).toBeNull();
  });

  it("does not turn a free outing into a paid one by adding lunch", async () => {
    const walk = place({ title: "Free Walk", price_estimate: 0, price_type: "free", tags: ["outdoors", "walking"], duration_minutes: 60 });
    const cafe = place({ title: "Corner Cafe", tags: ["food-venue", "cafe", "coffee", "lunch"], duration_minutes: 40, location_lat: walk.location_lat! + 0.2 / 111, location_lng: walk.location_lng });
    const free = await buildRecommendations(inputs([walk, cafe], { request: { start: "now", duration: "half_day", who: "just_me", mood: null, exclude: [], context: { spend: "free" } } }));
    expect(free.options[0].foodStop).toBeNull();
    const low = await buildRecommendations(inputs([walk, cafe], { request: { start: "now", duration: "half_day", who: "just_me", mood: null, exclude: [], context: { spend: "low" } } }));
    expect(low.options[0].foodStop?.title).toBe("Corner Cafe");
    const none = await buildRecommendations(inputs([walk, cafe]));
    expect(none.options[0].foodStop?.title).toBe("Corner Cafe");
  });

  it("counts the main thing and the stop together against what they want to spend", async () => {
    const gallery = place({ title: "Gallery", price_estimate: 12, tags: ["museum"], duration_minutes: 60 });
    const pub = place({ title: "The Old Bull", tags: ["food-venue", "pub", "lunch"], duration_minutes: 60, location_lat: gallery.location_lat! + 0.2 / 111, location_lng: gallery.location_lng });
    // £12 gallery fits "£" (up to £15) alone, but £12 + a £15 pub lunch does not.
    const low = await buildRecommendations(inputs([gallery, pub], { request: { start: "now", duration: "half_day", who: "just_me", mood: null, exclude: [], context: { spend: "low" } } }));
    expect(low.options[0].title).toBe("Gallery");
    expect(low.options[0].foodStop).toBeNull();
    const mid = await buildRecommendations(inputs([gallery, pub], { request: { start: "now", duration: "half_day", who: "just_me", mood: null, exclude: [], context: { spend: "mid" } } }));
    expect(mid.options[0].foodStop?.title).toBe("The Old Bull");
  });

  it("never rules something out for a low budget alone, only ranks it lower", async () => {
    const dear = place({ title: "Grand Day Out", price_estimate: 90, tags: ["museum"] });
    const { options } = await buildRecommendations(inputs([dear], { member: { ...inputs([]).member, budget_band: "low" } }));
    expect(options.map((o) => o.title)).toEqual(["Grand Day Out"]);
    expect(options[0].costTier).toBe("high");
  });

  it("shows the cost tier for the whole outing, and whether the figure is a guess", async () => {
    const known = place({ title: "Known", price_estimate: 12, price_type: "entry", cost_confidence: "known", tags: ["museum"] });
    const guess = place({ title: "Guessed", category: "Learn", price_estimate: 12, cost_confidence: "estimated", tags: ["museum"] });
    const { options } = await buildRecommendations(inputs([known, guess]));
    const by = Object.fromEntries(options.map((o) => [o.title, o]));
    expect(by.Known.costTier).toBe("low");
    expect(by.Known.costIsEstimate).toBe(false);
    expect(by.Guessed.costIsEstimate).toBe(true);
  });

  it("keeps three options from all being expensive", async () => {
    const candidates = [
      place({ title: "Dear A", category: "Explore", price_estimate: 70, rating: 5 }),
      place({ title: "Dear B", category: "Learn", price_estimate: 65, rating: 5 }),
      place({ title: "Dear C", category: "Joy", price_estimate: 80, rating: 5 }),
      place({ title: "Cheap D", category: "Move", price_estimate: 4 }),
      place({ title: "Cheap E", category: "Wellness", price_estimate: 6 }),
    ];
    const { options } = await buildRecommendations(inputs(candidates));
    expect(options.filter((o) => o.costTier === "high").length).toBeLessThanOrEqual(1);
    expect(options).toHaveLength(3);
  });
});
