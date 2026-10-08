import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { OpportunityCandidate } from "@/lib/opportunities/engine";
import type { AffinityScores } from "@/lib/memory/scoring";
import { humanReason } from "@/lib/someTime/copy";
import { titleFitsPlan } from "@/lib/someTime/experience";
import { buildRecommendations, type RecommendInputs } from "@/lib/someTime/recommend";
import { assignRoles, ROLE_LABEL } from "@/lib/someTime/roles";
import { EMPTY_HISTORY, evaluateCandidate } from "@/lib/someTime/score";
import type { TimeRequest } from "@/lib/someTime/request";
import type { TimeWindow } from "@/lib/someTime/window";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const o = (category: string, tags: string[], isFood = false) => ({ category, tags, isFood });

describe("which idea is which", () => {
  const walk = o("Move", ["walking", "outdoors"]);
  const museum = o("Explore", ["museum"]);
  const group = o("Connect", ["u3a", "community"]);
  const gallery = o("Learn", ["arts"]);

  it("calls the first the best match, the first social one the social one, and one that differs the different one", () => {
    expect(assignRoles([walk, museum, group], "just_me")).toEqual(["best", "different", "social"]);
    expect(assignRoles([walk, group, museum], "just_me")).toEqual(["best", "social", "different"]);
  });

  it("labels nothing when there is only one idea", () => {
    expect(assignRoles([walk], "just_me")).toEqual([null]);
    expect(assignRoles([], "just_me")).toEqual([]);
  });

  it("never calls an idea social that is not, nor different when it is the same kind as the best", () => {
    // Only one idea is called different; the third is left without a label rather than given one that is not true.
    expect(assignRoles([walk, museum, gallery], "just_me")).toEqual(["best", "different", null]);
    const twoWalks = assignRoles([walk, o("Move", ["walking", "nature"])], "just_me");
    expect(twoWalks).toEqual(["best", null]);
    expect(assignRoles([walk, museum], "just_me")).toEqual(["best", "different"]);
  });

  it("leaves out 'something social' for someone already going with company, and still offers a different one", () => {
    expect(assignRoles([walk, museum, group], "friends")).toEqual(["best", "different", null]);
    expect(assignRoles([walk, group], "partner")).toEqual(["best", "different"]);
  });

  it("counts a pub, a tea room, a class or a club as social, and a café or a museum as not", () => {
    expect(assignRoles([walk, o("Joy", ["food-venue", "pub"], true)], "just_me")[1]).toBe("social");
    expect(assignRoles([walk, o("Joy", ["food-venue", "afternoon-tea"], true)], "just_me")[1]).toBe("social");
    expect(assignRoles([walk, o("Learn", ["classes"])], "just_me")[1]).toBe("social");
    expect(assignRoles([walk, o("Joy", ["food-venue", "cafe"], true)], "just_me")[1]).toBe("different");
    expect(assignRoles([walk, museum], "just_me")[1]).toBe("different");
  });

  it("has the labels the brief names", () => {
    expect(ROLE_LABEL).toEqual({ best: "Best match", different: "Something different", social: "Something social" });
  });
});

// ---- why now -----------------------------------------------------------------------

const WINDOW: TimeWindow = { date: "2026-10-09", startMin: 10 * 60, endMin: 16 * 60, availableMinutes: 360, minUsefulMinutes: 90 };
const BARNET = { lat: 51.65309, lng: -0.2002261 };
const NO_AFFINITY: AffinityScores = { categoryScores: {}, tagScores: {}, activityScores: {}, recentCategoryCounts: {} };
let n = 0;
const place = (overrides: Partial<OpportunityCandidate> = {}): OpportunityCandidate => ({
  id: `id-${++n}`, title: `Place ${n}`, description: null, category: "Explore", address: "Somewhere, Barnet", price_estimate: 0, tags: ["museum"],
  rating: null, accessibility_notes: null, location_lat: BARNET.lat + 1.5 / 111, location_lng: BARNET.lng, booking_url: "https://example.org",
  date_time: null, expires_at: null, recurrence_rule: null, duration_minutes: 60, ...overrides,
});
const request = (over: Partial<TimeRequest> = {}): TimeRequest => ({ start: "now", duration: "half_day", who: "just_me", mood: null, exclude: [], ...over });
const scoring = (over: { request?: TimeRequest; wetDay?: boolean; window?: TimeWindow } = {}) => ({
  window: over.window ?? WINDOW,
  request: over.request ?? request(),
  member: { budget_band: null, interests: [], goals: [], dietary: null, mobility_notes: null, travel: { drives: true, uses_public_transport: null, mobility_notes: null }, home: BARNET },
  affinity: NO_AFFINITY,
  history: EMPTY_HISTORY,
  pleasantWeather: false,
  wetDay: over.wetDay,
});

describe("why this is worth doing now", () => {
  it("says an exhibition is ending, in words that match how soon, and only when the end date is recorded", () => {
    const endsOn = (iso: string) => evaluateCandidate(place({ expires_at: `${iso}T23:59:00Z` }), scoring())!.reasons;
    expect(endsOn("2026-10-09")).toContain("it ends today");
    expect(endsOn("2026-10-10")).toContain("it ends tomorrow");
    expect(endsOn("2026-10-11")).toContain("it closes on Sunday");
    expect(endsOn("2026-10-20").some((r) => /ends|closes/.test(r))).toBe(false);
    expect(evaluateCandidate(place(), scoring())!.reasons.some((r) => /ends|closes/.test(r))).toBe(false);
  });

  it("puts that ahead of a general reason, so it is the one said", () => {
    const e = evaluateCandidate(place({ expires_at: "2026-10-11T23:59:00Z" }), { ...scoring(), member: { ...scoring().member, interests: ["museum"] } })!;
    expect(e.reasons[0]).toBe("it closes on Sunday");
    expect(humanReason(e.reasons)).toBe("It closes on Sunday, and it matches your interest in museum.");
  });

  it("says an indoor place suits a wet day, nudges it up, and says nothing of the kind on a dry day or for a place outdoors", () => {
    const museum = place({ tags: ["museum"] });
    const wet = evaluateCandidate(museum, scoring({ wetDay: true }))!;
    const dry = evaluateCandidate(museum, scoring({ wetDay: false }))!;
    expect(wet.reasons).toContain("it is a wet day and this is indoors");
    expect(wet.score).toBeGreaterThan(dry.score);
    expect(dry.reasons).not.toContain("it is a wet day and this is indoors");
    expect(evaluateCandidate(place({ tags: ["walking", "outdoors"] }), scoring({ wetDay: true }))!.reasons).not.toContain("it is a wet day and this is indoors");
    expect(humanReason(wet.reasons)).toBe("It is a wet day and this is under cover.");
  });

  it("says an event is on tomorrow when that is the day asked about, not today", () => {
    const show = (start: "now" | "tomorrow") => evaluateCandidate(place({ tags: ["theatre"], date_time: "2026-10-09T13:00:00Z", duration_minutes: 120 }), scoring({ request: request({ start }) }))!;
    expect(show("tomorrow").reasons).toContain("it is actually happening tomorrow");
    expect(humanReason(show("tomorrow").reasons)).toBe("It is on tomorrow.");
    expect(show("now").reasons).toContain("it is actually happening today");
  });

  it("says it fits before the next plan when that is what they asked for", () => {
    const e = evaluateCandidate(place(), scoring({ request: request({ duration: "until_next", untilMin: 14 * 60 }) }))!;
    expect(e.reasons).toContain("it fits before your next plan");
    expect(humanReason(e.reasons)).toBe("It fits neatly before your next plan.");
  });
});

describe("through the whole recommendation", () => {
  const inputs = (candidates: OpportunityCandidate[], extra: Partial<RecommendInputs> = {}): RecommendInputs => ({
    request: request(), window: WINDOW, candidates, weatherNote: null, pleasantWeather: false, daylight: { sunriseMin: 7 * 60, sunsetMin: 18 * 60 },
    member: scoring().member, affinity: NO_AFFINITY, history: EMPTY_HISTORY,
    profile: { goals: [], interests: [], budget_band: null, dietary: null, mobility_notes: null, personality: null }, aspirations: [], ask: null, ...extra,
  });

  it("labels the ideas shown, best first, and says what each is", async () => {
    const { options } = await buildRecommendations(
      inputs([
        place({ title: "Woodland Walk", category: "Move", tags: ["walking", "outdoors"], price_estimate: 0, rating: 5 }),
        place({ title: "Local Museum", category: "Explore", tags: ["museum"], price_estimate: 5 }),
        place({ title: "u3a Coffee Morning", category: "Connect", tags: ["u3a", "community", "coffee morning"], price_estimate: 2 }),
      ])
    );
    expect(options.length).toBe(3);
    expect(options[0].role).toBe("best");
    expect(options.filter((x) => x.role === "social").map((x) => x.title)).toEqual(["u3a Coffee Morning"]);
    expect(options.filter((x) => x.role === "different")).toHaveLength(1);
  });

  it("labels nothing when there is only one idea", async () => {
    const { options } = await buildRecommendations(inputs([place({ title: "Only One" })]));
    expect(options).toHaveLength(1);
    expect(options[0].role).toBeNull();
  });

  it("carries the day and the tags the card and the labels need", async () => {
    const { options } = await buildRecommendations(inputs([place({ title: "Tomorrow Show", tags: ["theatre"], date_time: "2026-10-09T13:00:00Z", duration_minutes: 120 })], { request: request({ start: "tomorrow" }) }));
    expect(options[0].dayWord).toBe("tomorrow");
    expect(options[0].tags).toContain("theatre");
    expect(options[0].reason).toBe("It is on tomorrow.");
  });
});

describe("what the card shows", () => {
  const card = read("src/components/ExperienceCard.tsx");

  it("groups only the ideas in the sheet, with an icon and the words, not emoji", () => {
    expect(card).toContain('variant === "result" && option.role');
    expect(card).toContain("ROLE_LABEL[option.role]");
    expect(card).toContain("{ best: Star, different: Sparkles, social: Users }");
    expect(card).not.toMatch(/[⭐✨\u{1F465}]/u);
  });

  it("says which day an event is on", () => {
    expect(card).toContain("On {option.dayWord}");
    expect(card).not.toContain(">On today<");
  });

  it("is told about a wet day by the recommendation", () => {
    expect(read("src/lib/someTime/recommend.ts")).toContain("wetDay: todayForecast ? isWetDay(todayForecast) : false");
  });
});

describe("a title may only name a part of the day that is true", () => {
  const at =(h: number, m = 0) => h * 60 + m;

  it("rejects an afternoon for a plan that starts in the morning, and a morning for one that starts after lunch", () => {
    expect(titleFitsPlan("An afternoon of arts and lunch", true, false, false, at(10, 25))).toBe(false);
    expect(titleFitsPlan("A slow morning in Barnet", false, false, false, at(14))).toBe(false);
    expect(titleFitsPlan("An evening of yoga", false, false, false, at(15))).toBe(false);
  });

  it("accepts the part of the day when it is when they arrive", () => {
    expect(titleFitsPlan("A slow morning in Barnet", false, false, false, at(10, 25))).toBe(true);
    expect(titleFitsPlan("An afternoon of arts and lunch", true, false, false, at(13, 30))).toBe(true);
    expect(titleFitsPlan("An evening of yoga", false, false, false, at(19, 15))).toBe(true);
  });

  it("says nothing about the day when the title does not, or when the time is not known", () => {
    expect(titleFitsPlan("An hour with local history", false, false, false, at(10))).toBe(true);
    expect(titleFitsPlan("A yoga session to start the day", false, false, false, at(10))).toBe(true);
    expect(titleFitsPlan("An afternoon of arts", false, false)).toBe(true);
  });

  it("is given the arrival time, and the model is told", () => {
    expect(read("src/lib/someTime/recommend.ts")).toContain("e.eventStartMin ?? e.arriveMin)");
    expect(read("src/lib/someTime/prompt.ts")).toContain("Only name a part of the day (morning, afternoon, evening) if it is when they arrive.");
  });
});
