import { describe, expect, it } from "vitest";
import type { OpportunityCandidate } from "@/lib/opportunities/engine";
import type { AffinityScores } from "@/lib/memory/scoring";
import {
  diversify,
  EMPTY_HISTORY,
  evaluateCandidate,
  findFoodStop,
  moodBonus,
  repetitionPenalty,
  type Evaluated,
  type MemberContext,
  type ScoringInput,
} from "@/lib/someTime/score";
import type { TimeWindow } from "@/lib/someTime/window";

// Friday 2 October 2026. Free from 13:10 for two hours: 13:10-15:10.
const WINDOW: TimeWindow = { date: "2026-10-02", startMin: 13 * 60 + 10, endMin: 15 * 60 + 10, availableMinutes: 120, minUsefulMinutes: 45 };
const BARNET = { lat: 51.65309, lng: -0.2002261 };
const NO_AFFINITY: AffinityScores = { categoryScores: {}, tagScores: {}, activityScores: {}, recentCategoryCounts: {} };

const member = (overrides: Partial<MemberContext> = {}): MemberContext => ({
  budget_band: null,
  interests: [],
  goals: [],
  dietary: null,
  mobility_notes: null,
  travel: { drives: true, uses_public_transport: null, mobility_notes: null },
  home: BARNET,
  ...overrides,
});

const input = (overrides: Partial<ScoringInput> = {}): ScoringInput => ({
  window: WINDOW,
  request: { start: "now", duration: "1-2h", who: "just_me", mood: null, exclude: [] },
  member: member(),
  affinity: NO_AFFINITY,
  history: EMPTY_HISTORY,
  pleasantWeather: false,
  ...overrides,
});

let n = 0;
/** A candidate `km` north of home. */
const place = (overrides: Partial<OpportunityCandidate> & { km?: number } = {}): OpportunityCandidate => {
  const { km = 1, ...rest } = overrides;
  return {
    id: `c${++n}`,
    title: `Place ${n}`,
    description: null,
    category: "Explore",
    address: null,
    price_estimate: null,
    tags: [],
    rating: null,
    accessibility_notes: null,
    location_lat: BARNET.lat + km / 111,
    location_lng: BARNET.lng,
    booking_url: null,
    date_time: null,
    expires_at: null,
    recurrence_rule: null,
    duration_minutes: 45,
    ...rest,
  };
};

const score = (c: OpportunityCandidate, i: ScoringInput = input()) => evaluateCandidate(c, i)?.score ?? null;

describe("evaluateCandidate — does it fit the time?", () => {
  it("accepts something that fits and works out when to leave, arrive and be home", () => {
    const e = evaluateCandidate(place({ km: 2, duration_minutes: 60 }), input())!;
    expect(e).not.toBeNull();
    expect(e.arriveMin).toBe(WINDOW.startMin + e.travelMinutes);
    expect(e.endMin).toBe(e.arriveMin + 60);
    expect(e.homeMin).toBe(e.endMin + e.travelMinutes);
    expect(e.leaveMin).toBe(WINDOW.startMin);
    expect(e.homeMin).toBeLessThanOrEqual(WINDOW.endMin);
  });

  it("rejects something too long for the time available", () => {
    expect(evaluateCandidate(place({ duration_minutes: 150 }), input())).toBeNull();
  });

  it("counts the journey there and back, not just the visit", () => {
    const short = { ...WINDOW, endMin: WINDOW.startMin + 30, availableMinutes: 30, minUsefulMinutes: 15 };
    // A 15-minute visit that is 20 minutes away needs 55 minutes in all.
    expect(evaluateCandidate(place({ km: 10, duration_minutes: 15 }), input({ window: short }))).toBeNull();
    expect(evaluateCandidate(place({ km: 0.3, duration_minutes: 15 }), input({ window: short }))).not.toBeNull();
  });

  it("includes the distance as facts a member can check", () => {
    const e = evaluateCandidate(place({ km: 3, duration_minutes: 60, price_estimate: 0 }), input())!;
    expect(e.facts.some((f) => /min/.test(f))).toBe(true);
    expect(e.facts).toContain("Free");
    expect(e.facts).toContain("about 1 hour");
  });
});

describe("evaluateCandidate — events happening today", () => {
  const event = (time: string, overrides: Partial<OpportunityCandidate> = {}) =>
    place({ date_time: `2026-10-02T${time}:00Z`, km: 1, duration_minutes: 60, ...overrides });

  it("accepts an event they can reach in time and get home from, arriving a little early", () => {
    // 1 km away is an 18-minute walk: set off 13:10, there by 13:28, event 13:45-14:45, home by 15:03.
    const e = evaluateCandidate(event("13:45"), input())!;
    expect(e).not.toBeNull();
    expect(e.endMin).toBe(14 * 60 + 45);
    expect(e.arriveMin).toBeLessThanOrEqual(13 * 60 + 45);
    expect(e.homeMin).toBeLessThanOrEqual(WINDOW.endMin);
    expect(e.facts).toContain("starts 13:45");
  });

  it("rejects an event that starts before they could get there", () => {
    expect(evaluateCandidate(event("13:15"), input())).toBeNull();
  });

  it("rejects an event that would not be over, with the journey home, inside their time", () => {
    expect(evaluateCandidate(event("14:30"), input())).toBeNull();
  });

  it("rejects an event on another day", () => {
    expect(evaluateCandidate(place({ date_time: "2026-10-03T14:00:00Z", duration_minutes: 60 }), input())).toBeNull();
  });
});

describe("evaluateCandidate — opening hours and mealtimes", () => {
  it("rejects a place that is shut when they would arrive", () => {
    expect(evaluateCandidate(place({ recurrence_rule: "Mo-Fr 09:00-12:00" }), input())).toBeNull();
    expect(evaluateCandidate(place({ recurrence_rule: "Sa-Su 09:00-17:00" }), input())).toBeNull();
  });

  it("accepts an open one, and says when it closes", () => {
    const e = evaluateCandidate(place({ recurrence_rule: "Mo-Fr 09:00-17:30" }), input())!;
    expect(e.openUntil).toBe(17 * 60 + 30);
    expect(e.facts).toContain("open until 17:30");
  });

  it("does not turn unknown hours into closed", () => {
    expect(evaluateCandidate(place({ recurrence_rule: "unsigned" }), input())).not.toBeNull();
    expect(evaluateCandidate(place({ recurrence_rule: null }), input())).not.toBeNull();
  });

  it("will not suggest a restaurant outside mealtimes, but a café is fine", () => {
    expect(evaluateCandidate(place({ tags: ["food-venue", "restaurant"], duration_minutes: 45 }), input({ window: { ...WINDOW, startMin: 15 * 60 + 10, endMin: 17 * 60 + 10 } }))).toBeNull();
    expect(evaluateCandidate(place({ tags: ["food-venue", "cafe"], duration_minutes: 45 }), input({ window: { ...WINDOW, startMin: 15 * 60 + 10, endMin: 17 * 60 + 10 } }))).not.toBeNull();
  });
});

describe("evaluateCandidate — budget", () => {
  const low = input({ member: member({ budget_band: "low" }) });

  it("rules out something far beyond the budget", () => {
    expect(evaluateCandidate(place({ price_estimate: 80 }), low)).toBeNull();
  });

  it("marks down something over the budget, and prefers free on a tight one", () => {
    const free = score(place({ price_estimate: 0 }), low)!;
    const fine = score(place({ price_estimate: 10 }), low)!;
    const stretch = score(place({ price_estimate: 20 }), low)!;
    expect(free).toBeGreaterThan(fine);
    expect(fine).toBeGreaterThan(stretch);
  });

  it("applies no budget when none is set", () => {
    expect(evaluateCandidate(place({ price_estimate: 80 }), input())).not.toBeNull();
  });

  it("judges a restaurant by a typical meal, since the place has no price", () => {
    const restaurant = place({ tags: ["food-venue", "restaurant"], duration_minutes: 60 });
    const lunch = input({ member: member({ budget_band: "low" }) });
    const cafe = place({ tags: ["food-venue", "cafe"], duration_minutes: 45 });
    expect(score(cafe, lunch)!).toBeGreaterThan(score(restaurant, lunch)!);
  });
});

describe("evaluateCandidate — what suits them", () => {
  it("prefers what is closer, all else equal", () => {
    expect(score(place({ km: 0.5 }))!).toBeGreaterThan(score(place({ km: 8 }))!);
  });

  it("prefers a category they have enjoyed, and one that supports a goal", () => {
    const liked: AffinityScores = { ...NO_AFFINITY, categoryScores: { Move: 3 } };
    expect(score(place({ category: "Move" }), input({ affinity: liked }))!).toBeGreaterThan(score(place({ category: "Learn" }), input({ affinity: liked }))!);
    const fitness = input({ member: member({ goals: ["fitness"] }) });
    expect(score(place({ category: "Move" }), fitness)!).toBeGreaterThan(score(place({ category: "Learn" }), fitness)!);
  });

  it("prefers something matching an interest", () => {
    const i = input({ member: member({ interests: ["history"] }) });
    expect(score(place({ tags: ["history"] }), i)!).toBeGreaterThan(score(place({ tags: [] }), i)!);
  });

  it("prefers outdoors in pleasant weather, and not otherwise", () => {
    const park = place({ tags: ["walking", "outdoors"] });
    expect(score(park, input({ pleasantWeather: true }))!).toBeGreaterThan(score(park, input({ pleasantWeather: false }))!);
  });

  it("marks down what they have done recently", () => {
    const thing = place({ category: "Learn" });
    const fresh = score(thing)!;
    const done = score(thing, input({ history: { recentActivityIds: new Set([thing.id]), categoryCounts: {} } }))!;
    expect(done).toBeLessThan(fresh - 5);
  });

  it("marks down a category they have had a lot of this week", () => {
    const thing = place({ category: "Move" });
    const heavy = score(thing, input({ history: { recentActivityIds: new Set(), categoryCounts: { Move: 3 } } }))!;
    expect(heavy).toBeLessThan(score(thing)!);
  });

  it("marks down chains and favours places matching a diet", () => {
    const base = { tags: ["food-venue", "cafe"], duration_minutes: 45 };
    expect(score(place({ ...base, tags: [...base.tags, "chain"] }))!).toBeLessThan(score(place(base))!);
    const veg = input({ member: member({ dietary: "vegetarian" }) });
    expect(score(place({ ...base, tags: [...base.tags, "vegetarian-options"] }), veg)!).toBeGreaterThan(score(place(base), veg)!);
  });

  it("explains itself honestly: reasons only for what is actually true", () => {
    const i = input({ member: member({ goals: ["fitness"], interests: ["swimming"] }), pleasantWeather: true });
    const e = evaluateCandidate(place({ category: "Move", tags: ["swimming", "outdoors"] }), i)!;
    expect(e.reasons).toEqual(
      expect.arrayContaining(["it supports your goal of staying active", "it matches your interest in swimming", "the weather suits being outdoors"])
    );
    const plain = evaluateCandidate(place({ category: "Learn" }), input())!;
    expect(plain.reasons).toEqual([]);
  });
});

describe("moodBonus", () => {
  const move = { category: "Move", tags: ["walking"] };
  const museum = { category: "Explore", tags: ["museum", "history"] };
  const community = { category: "Connect", tags: ["community"] };
  const spa = { category: "Wellness", tags: ["relaxation"] };
  const cafe = { category: "Joy", tags: ["food-venue", "cafe"] };

  it("favours what fits the mood", () => {
    expect(moodBonus("active", move)).toBeGreaterThan(moodBonus("active", museum));
    expect(moodBonus("culture", museum)).toBeGreaterThan(moodBonus("culture", move));
    expect(moodBonus("social", community)).toBeGreaterThan(moodBonus("social", museum));
    expect(moodBonus("relaxed", spa)).toBeGreaterThan(moodBonus("relaxed", move));
    expect(moodBonus("food", cafe)).toBeGreaterThan(moodBonus("food", museum));
  });

  it("has no effect with no mood, or surprise me", () => {
    expect(moodBonus(null, move)).toBe(0);
    expect(moodBonus("surprise", museum)).toBe(0);
  });
});

describe("repetitionPenalty", () => {
  it("penalises the same activity heavily and a crowded category lightly", () => {
    const history = { recentActivityIds: new Set(["a"]), categoryCounts: { Move: 2, Learn: 3 } };
    expect(repetitionPenalty({ id: "a", category: "Joy" }, history)).toBe(6);
    expect(repetitionPenalty({ id: "b", category: "Move" }, history)).toBe(1);
    expect(repetitionPenalty({ id: "b", category: "Learn" }, history)).toBe(2);
    expect(repetitionPenalty({ id: "b", category: "Joy" }, history)).toBe(0);
  });
});

describe("diversify", () => {
  const ev = (category: string, score: number, tags: string[] = []): Evaluated =>
    ({ candidate: place({ category, tags }), score }) as unknown as Evaluated;

  it("returns the best first", () => {
    const picked = diversify([ev("Move", 1), ev("Learn", 5), ev("Joy", 3)], 3);
    expect(picked.map((p) => p.score)).toEqual([5, 3, 1]);
  });

  it("never offers more than two of one category", () => {
    const picked = diversify([ev("Move", 9), ev("Move", 8), ev("Move", 7), ev("Learn", 1)], 3);
    expect(picked.filter((p) => p.candidate.category === "Move")).toHaveLength(2);
    expect(picked.some((p) => p.candidate.category === "Learn")).toBe(true);
  });

  it("caps food and drink so three suggestions are not three cafés", () => {
    const food = (s: number) => ev("Joy", s, ["food-venue", "cafe"]);
    const picked = diversify([food(9), food(8), food(7), ev("Move", 1)], 3);
    expect(picked.filter((p) => p.candidate.tags.includes("food-venue"))).toHaveLength(2);
  });

  it("does not let cafés use up the places meant for ordinary Joy activities", () => {
    const food = (s: number) => ev("Joy", s, ["food-venue", "cafe"]);
    const picked = diversify([food(9), food(8), ev("Joy", 2), ev("Joy", 1)], 4);
    expect(picked.filter((p) => !p.candidate.tags.includes("food-venue"))).toHaveLength(2);
  });
});

describe("findFoodStop", () => {
  const i = input();
  const main = (): Evaluated => evaluateCandidate(place({ km: 3, duration_minutes: 45 }), i)!;
  const near = (offsetKm: number, overrides: Partial<OpportunityCandidate> = {}) => {
    const m = main();
    return place({
      tags: ["food-venue", "cafe"],
      duration_minutes: 30,
      location_lat: m.candidate.location_lat! + offsetKm / 111,
      location_lng: m.candidate.location_lng,
      ...overrides,
    });
  };

  it("finds a café close to where they will be", () => {
    const stop = findFoodStop(main(), [near(0.3)], i);
    expect(stop?.candidate.tags).toContain("cafe");
    expect(stop?.distanceMeters).toBeLessThan(400);
    expect(stop?.walkMinutes).toBeGreaterThan(0);
  });

  it("ignores anything too far away", () => {
    expect(findFoodStop(main(), [near(3)], i)).toBeNull();
  });

  it("ignores a place that is shut, or wrong for the time of day", () => {
    expect(findFoodStop(main(), [near(0.3, { recurrence_rule: "Mo-Fr 07:00-12:00" })], i)).toBeNull();

    // Starting at 15:10 they would reach a food stop around 16:15: no restaurant is serving a meal then,
    // but it is still afternoon-tea time.
    const late = input({ window: { ...WINDOW, startMin: 15 * 60 + 10, endMin: 18 * 60 + 10, availableMinutes: 180 } });
    const lateMain = evaluateCandidate(place({ km: 3, duration_minutes: 45 }), late)!;
    const restaurant = place({ tags: ["food-venue", "restaurant"], duration_minutes: 30, location_lat: lateMain.candidate.location_lat! + 0.3 / 111, location_lng: lateMain.candidate.location_lng });
    const tea = { ...restaurant, id: "tea", tags: ["food-venue", "tea_room", "afternoon-tea"] };
    expect(findFoodStop(lateMain, [restaurant], late)).toBeNull();
    expect(findFoodStop(lateMain, [tea], late)?.meal).toBe("afternoon tea");
  });

  it("needs time for it: nothing if the visit already fills the window", () => {
    const full = evaluateCandidate(place({ km: 3, duration_minutes: 80 }), i)!;
    expect(findFoodStop(full, [near(0.3)], i)).toBeNull();
  });

  it("is never offered after something that is itself food", () => {
    const cafe = evaluateCandidate(place({ km: 1, tags: ["food-venue", "cafe"], duration_minutes: 30 }), i)!;
    expect(findFoodStop(cafe, [near(0.3)], i)).toBeNull();
  });

  it("prefers an independent over a chain, and a nearer place over a farther one", () => {
    const independent = near(0.5, { title: "Independent" });
    const chain = near(0.2, { title: "Chain", tags: ["food-venue", "cafe", "chain"] });
    expect(findFoodStop(main(), [chain, independent], i)?.candidate.title).toBe("Independent");
    const closer = near(0.1, { title: "Closer" });
    const farther = near(0.9, { title: "Farther" });
    expect(findFoodStop(main(), [farther, closer], i)?.candidate.title).toBe("Closer");
  });

  it("respects the budget", () => {
    const low = input({ member: member({ budget_band: "low" }) });
    const evaluated = evaluateCandidate(place({ km: 3, duration_minutes: 45 }), low)!;
    const pricey = near(0.3, { tags: ["food-venue", "restaurant"], price_estimate: 80, duration_minutes: 30 });
    expect(findFoodStop(evaluated, [pricey], low)).toBeNull();
  });
});

describe("culture mood — what a place is, not its category", () => {
  it("prefers a museum to a nature reserve, even though both are filed under Explore", () => {
    const culture = input({ request: { start: "now", duration: "1-2h", who: "just_me", mood: "culture", exclude: [] } });
    const museum = place({ category: "Explore", tags: ["museum", "history"] });
    const reserve = place({ category: "Explore", tags: ["walking", "nature", "outdoors"] });
    expect(score(museum, culture)!).toBeGreaterThan(score(reserve, culture)!);
  });

  it("recognises a museum from its name when a source gave it no tags (a web-search result filed under Joy)", () => {
    const culture = input({ request: { start: "now", duration: "1-2h", who: "just_me", mood: "culture", exclude: [] } });
    const untaggedMuseum = place({ title: "Barnet Museum", category: "Joy", tags: [] });
    const untaggedShop = place({ title: "Soft Play Barnet", category: "Joy", tags: [] });
    expect(score(untaggedMuseum, culture)!).toBeGreaterThan(score(untaggedShop, culture)!);
  });
});

describe("visits that can be cut down to fit", () => {
  const THIRTY: TimeWindow = { date: "2026-10-02", startMin: 14 * 60 + 20, endMin: 14 * 60 + 50, availableMinutes: 30, minUsefulMinutes: 15 };
  const half = input({ window: THIRTY });

  it("fits a quick coffee into half an hour by shortening the visit", () => {
    const cafe = place({ tags: ["food-venue", "cafe"], duration_minutes: 45, km: 0.1 });
    const e = evaluateCandidate(cafe, half)!;
    expect(e).not.toBeNull();
    expect(e.durationMinutes).toBe(30 - 2 * e.travelMinutes); // whatever is left after the journey
    expect(e.durationMinutes).toBeGreaterThanOrEqual(20);
    expect(e.homeMin).toBeLessThanOrEqual(THIRTY.endMin);
  });

  it("does not shorten a visit below the least that makes sense", () => {
    // 0.4 km is a 6-minute walk each way: only 18 minutes left, under a café's 20-minute floor.
    expect(evaluateCandidate(place({ tags: ["food-venue", "cafe"], duration_minutes: 45, km: 0.4 }), half)).toBeNull();
  });

  it("never shortens something that cannot be rushed, or an event", () => {
    expect(evaluateCandidate(place({ category: "Explore", tags: ["museum"], duration_minutes: 45, km: 0.1 }), half)).toBeNull();
    expect(evaluateCandidate(place({ date_time: "2026-10-02T14:30:00Z", duration_minutes: 60, km: 0.1 }), half)).toBeNull();
  });

  it("uses the full length when there is plenty of time", () => {
    expect(evaluateCandidate(place({ tags: ["food-venue", "cafe"], duration_minutes: 45, km: 0.5 }), input())!.durationMinutes).toBe(45);
  });
});

describe("daylight", () => {
  const park = () => place({ tags: ["walking", "outdoors"], duration_minutes: 60, km: 1 });
  // Sunset 18:36. Free from 18:00.
  const EVENING: TimeWindow = { date: "2026-10-02", startMin: 18 * 60, endMin: 22 * 60, availableMinutes: 240, minUsefulMinutes: 120 };
  const dusk = { sunriseMin: 6 * 60 + 52, sunsetMin: 18 * 60 + 36 };

  it("does not offer an outdoor walk that would start around or after sunset", () => {
    expect(evaluateCandidate(park(), input({ window: EVENING, daylight: dusk }))).toBeNull();
  });

  it("offers the same walk when there is no daylight information to say otherwise", () => {
    expect(evaluateCandidate(park(), input({ window: EVENING }))).not.toBeNull();
  });

  it("does not affect indoor things in the evening", () => {
    expect(evaluateCandidate(place({ tags: ["theatre"], duration_minutes: 60, km: 1 }), input({ window: EVENING, daylight: dusk }))).not.toBeNull();
  });

  it("offers an afternoon walk, and marks one down if it runs well past sunset", () => {
    const afternoon = input({ daylight: dusk }); // 13:10 start: plenty of light
    expect(evaluateCandidate(park(), afternoon)).not.toBeNull();

    // Arrive 17:50 (light), visit 17:50-18:50: runs past sunset, so it scores less than the same walk earlier.
    const lateWindow: TimeWindow = { date: "2026-10-02", startMin: 17 * 60 + 30, endMin: 20 * 60, availableMinutes: 150, minUsefulMinutes: 60 };
    const late = evaluateCandidate(park(), input({ window: lateWindow, daylight: dusk }))!;
    const early = evaluateCandidate(park(), input({ window: { ...lateWindow, startMin: 14 * 60, endMin: 16 * 60 + 30 }, daylight: dusk }))!;
    expect(late.score).toBeLessThan(early.score);
  });

  it("does not offer outdoor things before sunrise", () => {
    const earlyMorning: TimeWindow = { date: "2026-10-02", startMin: 5 * 60, endMin: 8 * 60, availableMinutes: 180, minUsefulMinutes: 60 };
    expect(evaluateCandidate(park(), input({ window: earlyMorning, daylight: dusk }))).toBeNull();
  });
});

describe("findFoodStop — nearby means a short walk", () => {
  const i = input();
  const main = () => evaluateCandidate(place({ km: 3, duration_minutes: 45 }), i)!;
  const at = (offsetKm: number) => {
    const m = main();
    return place({
      tags: ["food-venue", "cafe"],
      duration_minutes: 30,
      location_lat: m.candidate.location_lat! + offsetKm / 111,
      location_lng: m.candidate.location_lng,
    });
  };

  it("takes a café a few minutes' walk away", () => {
    expect(findFoodStop(main(), [at(0.4)], i)).not.toBeNull();
  });

  it("does not call a 20-minute walk nearby", () => {
    // 1.2 km straight is ~1.6 km by road: over 20 minutes on foot.
    expect(findFoodStop(main(), [at(1.2)], i)).toBeNull();
  });

  it("shortens the stop to fit the time left rather than losing it", () => {
    // 115 minutes: after the outing and the journeys there are ~36 left for the stop, less than its usual 45.
    const tight = input({ window: { ...WINDOW, endMin: WINDOW.startMin + 115, availableMinutes: 115 } });
    const evaluated = evaluateCandidate(place({ km: 3, duration_minutes: 45 }), tight)!;
    const m = evaluated;
    const cafe = place({ tags: ["food-venue", "cafe"], duration_minutes: 45, location_lat: m.candidate.location_lat! + 0.3 / 111, location_lng: m.candidate.location_lng });
    const stop = findFoodStop(evaluated, [cafe], tight);
    expect(stop).not.toBeNull();
    expect(stop!.homeMin).toBeLessThanOrEqual(tight.window.endMin);
    expect(stop!.endMin - stop!.arriveMin).toBeLessThan(45);
  });
});

describe("assumed daytime hours for venues that do not publish any", () => {
  const evening: TimeWindow = { date: "2026-10-02", startMin: 18 * 60, endMin: 21 * 60, availableMinutes: 180, minUsefulMinutes: 90 };

  it("does not send someone to an unrecorded museum or library in the evening", () => {
    expect(evaluateCandidate(place({ title: "Barnet Museum", tags: [], category: "Joy", duration_minutes: 60, km: 0.3 }), input({ window: evening }))).toBeNull();
    expect(evaluateCandidate(place({ tags: ["museum"], duration_minutes: 60, km: 0.3 }), input({ window: evening }))).toBeNull();
    expect(evaluateCandidate(place({ tags: ["books"], duration_minutes: 45, km: 0.3 }), input({ window: evening }))).toBeNull();
  });

  it("offers it in the daytime", () => {
    expect(evaluateCandidate(place({ title: "Barnet Museum", tags: [], duration_minutes: 60, km: 0.3 }), input())).not.toBeNull();
  });

  it("trusts recorded hours over the assumption", () => {
    const lateOpening = place({ tags: ["museum"], duration_minutes: 60, km: 0.3, recurrence_rule: "Mo-Su 10:00-21:00" });
    expect(evaluateCandidate(lateOpening, input({ window: evening }))).not.toBeNull();
  });

  it("does not apply to things that are evening things, or to events", () => {
    expect(evaluateCandidate(place({ tags: ["theatre"], duration_minutes: 60, km: 0.3 }), input({ window: evening }))).not.toBeNull();
    expect(evaluateCandidate(place({ tags: ["museum"], duration_minutes: 60, km: 0.3, date_time: "2026-10-02T18:30:00Z" }), input({ window: evening }))).not.toBeNull();
  });
});

describe("daylight needs time to enjoy it", () => {
  const dusk = { sunriseMin: 6 * 60 + 52, sunsetMin: 18 * 60 + 36 };
  const park = () => place({ tags: ["walking", "outdoors"], duration_minutes: 60, km: 0.7 });

  it("does not offer a walk that would start with only a few minutes of light left", () => {
    // Arrive about 18:12 (a 12-minute walk from 18:00), sunset 18:36: 24 minutes of light for a 60-minute walk.
    const window: TimeWindow = { date: "2026-10-02", startMin: 18 * 60, endMin: 21 * 60, availableMinutes: 180, minUsefulMinutes: 90 };
    expect(evaluateCandidate(park(), input({ window, daylight: dusk }))).toBeNull();
  });

  it("offers it when there is enough light for a proper walk", () => {
    const window: TimeWindow = { date: "2026-10-02", startMin: 17 * 60, endMin: 20 * 60, availableMinutes: 180, minUsefulMinutes: 90 };
    expect(evaluateCandidate(park(), input({ window, daylight: dusk }))).not.toBeNull();
  });
});

describe("reasons read like a person would say them", () => {
  it("names the actual goal, using plain words for the usual ones", () => {
    const reasonFor = (goal: string) =>
      evaluateCandidate(place({ category: goal === "give_back" ? "Give Back" : "Move" }), input({ member: member({ goals: [goal] }) }))!.reasons;
    expect(reasonFor("fitness")).toContain("it supports your goal of staying active");
    expect(reasonFor("give_back")).toContain("it supports your goal of giving back locally");
  });

  it("names the goal that matches, even when the member has also typed one of their own", () => {
    const e = evaluateCandidate(place({ category: "Move" }), input({ member: member({ goals: ["fitness", "walk the coast path"] }) }))!;
    expect(e.reasons).toContain("it supports your goal of staying active");
  });

  it("describes a liked category in everyday words rather than by its internal name", () => {
    const liked: AffinityScores = { ...NO_AFFINITY, categoryScores: { Move: 3, Learn: 3 } };
    const move = evaluateCandidate(place({ category: "Move" }), input({ affinity: liked }))!;
    const learn = evaluateCandidate(place({ category: "Learn" }), input({ affinity: liked }))!;
    expect(move.reasons).toContain("you have enjoyed active outings lately");
    expect(learn.reasons).toContain("you have enjoyed learning lately");
  });
});

describe("outdoors mood", () => {
  it("prefers a walk to a museum, and a garden to a cinema", () => {
    const outdoors = input({ request: { start: "now", duration: "1-2h", who: "just_me", mood: "outdoors", exclude: [] } });
    expect(score(place({ tags: ["walking", "outdoors"] }), outdoors)!).toBeGreaterThan(score(place({ tags: ["museum"] }), outdoors)!);
    expect(score(place({ tags: ["gardens"] }), outdoors)!).toBeGreaterThan(score(place({ tags: ["cinema"] }), outdoors)!);
  });

  it("has no effect on anything when no mood is chosen", () => {
    expect(moodBonus(null, { category: "Move", tags: ["walking", "outdoors"] })).toBe(0);
    expect(moodBonus("outdoors", { category: "Move", tags: ["walking"] })).toBeGreaterThan(moodBonus("outdoors", { category: "Learn", tags: [] }));
  });
});
