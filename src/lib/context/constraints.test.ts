import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { OpportunityCandidate } from "@/lib/opportunities/engine";
import type { AffinityScores } from "@/lib/memory/scoring";
import { checkConstraints, describeContext, hasActiveConstraints, parseContext, preferVerified, stopWorks } from "@/lib/context/constraints";
import { dogFact } from "@/lib/opportunities/facts";
import { parseTimeRequest } from "@/lib/someTime/request";
import { buildRecommendations, type RecommendInputs } from "@/lib/someTime/recommend";
import { buildUserPrompt } from "@/lib/someTime/prompt";
import { EMPTY_HISTORY, evaluateCandidate } from "@/lib/someTime/score";
import type { TimeWindow } from "@/lib/someTime/window";

const DOG = { dog: true } as const;

describe("what the member says about this outing", () => {
  it("keeps only what is recognised, and never throws", () => {
    expect(parseContext({ dog: true })).toEqual({ dog: true });
    expect(parseContext({ dog: false })).toEqual({ dog: false });
    expect(parseContext({ dog: "yes", grandchildren: true, __proto__: { dog: true } })).toEqual({});
    expect(parseContext(null)).toEqual({});
    expect(parseContext("dog")).toEqual({});
    expect(parseContext(undefined)).toEqual({});
  });

  it("only asks anything of a place when the dog is actually coming", () => {
    expect(hasActiveConstraints({ dog: true })).toBe(true);
    expect(hasActiveConstraints({ dog: false })).toBe(false);
    expect(hasActiveConstraints({})).toBe(false);
    expect(hasActiveConstraints(undefined)).toBe(false);
  });

  it("is carried by the request from the browser, and absent when nothing was said", () => {
    const base = { start: "now", duration: "1-2h", who: "just_me" };
    expect(parseTimeRequest({ ...base, context: { dog: true } })?.context).toEqual({ dog: true });
    expect(parseTimeRequest({ ...base, context: { dog: "maybe" } })).not.toHaveProperty("context");
    expect(parseTimeRequest(base)).not.toHaveProperty("context");
  });

  it("is described for the model only when it says something", () => {
    expect(describeContext({ dog: true })[0]).toMatch(/dog is coming/i);
    expect(describeContext({ dog: false })).toEqual([]);
    expect(describeContext(undefined)).toEqual([]);
  });
});

describe("whether a place works when the dog is coming", () => {
  const welcome = { dog_access: "allowed", dog_confidence: "verified", dog_source: "https://example.org/dogs" };

  it("works, and says why, where dogs are known to be welcome", () => {
    const r = checkConstraints(welcome, DOG);
    expect(r.excluded).toBe(false);
    expect(r.unverified).toEqual([]);
    expect(r.reasons).toEqual(["dogs are welcome, so the dog can come"]);
    expect(r.facts).toEqual(["Dogs welcome"]);
    expect(r.bonus).toBeGreaterThan(0);
  });

  it("is left out where dogs are known to be refused, including assistance-dogs-only", () => {
    expect(checkConstraints({ dog_access: "not_allowed" }, DOG).excluded).toBe(true);
    expect(checkConstraints({ dog_access: "assistance_dogs_only", dog_confidence: "verified" }, DOG).excluded).toBe(true);
    // Refused is refused even when nobody wrote down how sure they were: the safe direction.
    expect(checkConstraints({ dog_access: "not_allowed", dog_confidence: "unknown" }, DOG).excluded).toBe(true);
  });

  it("says to check, and claims nothing, where access is unknown", () => {
    for (const place of [{}, { dog_access: "unknown" }, { dog_access: null }]) {
      const r = checkConstraints(place, DOG);
      expect(r.excluded).toBe(false);
      expect(r.unverified).toEqual(["Check dog access"]);
      expect(r.facts).toEqual([]);
      expect(r.reasons).toEqual([]);
      expect(r.bonus).toBe(0);
    }
  });

  it("does not promise a welcome that nothing stands behind", () => {
    // Something is recorded as allowed but with no source and no report behind it.
    expect(checkConstraints({ dog_access: "allowed", dog_confidence: "unknown" }, DOG).unverified).toEqual(["Check dog access"]);
  });

  it("asks nothing of any place when the dog is not coming", () => {
    for (const place of [{}, { dog_access: "not_allowed" }, welcome]) {
      expect(checkConstraints(place, { dog: false })).toEqual({ excluded: false, unverified: [], reasons: [], facts: [], bonus: 0 });
      expect(checkConstraints(place, undefined)).toEqual({ excluded: false, unverified: [], reasons: [], facts: [], bonus: 0 });
    }
  });

  it("words the card line by where, how sure, and any rule", () => {
    expect(dogFact({ dog_access: "outdoor_only", dog_confidence: "verified" })).toBe("Dogs welcome outdoors");
    expect(dogFact({ dog_access: "selected_areas", dog_confidence: "verified" })).toBe("Dogs welcome in some areas");
    expect(dogFact({ dog_access: "allowed", dog_confidence: "reported" })).toBe("Dogs reportedly welcome");
    expect(dogFact({ dog_access: "allowed", dog_confidence: "verified", dog_restrictions: "  on leads  " })).toBe("Dogs welcome (on leads)");
    expect(dogFact({ dog_access: "unknown" })).toBeNull();
    expect(dogFact({ dog_access: "not_allowed" })).toBeNull();
  });

  it("lets a stop (somewhere to eat) join an outing only if it works outright", () => {
    expect(stopWorks(welcome, DOG)).toBe(true);
    expect(stopWorks({}, DOG)).toBe(false);
    expect(stopWorks({ dog_access: "not_allowed" }, DOG)).toBe(false);
    expect(stopWorks({}, { dog: false })).toBe(true);
    expect(stopWorks({}, undefined)).toBe(true);
  });
});

describe("certain before maybe", () => {
  it("offers only what is certain when anything is", () => {
    const items = [{ id: "a", unverified: [] as string[] }, { id: "b", unverified: ["Check dog access"] }, { id: "c" }];
    expect(preferVerified(items).map((i) => i.id)).toEqual(["a", "c"]);
  });

  it("offers the maybes, labelled, only when nothing is certain", () => {
    const items = [{ id: "b", unverified: ["Check dog access"] }, { id: "d", unverified: ["Check dog access"] }];
    expect(preferVerified(items).map((i) => i.id)).toEqual(["b", "d"]);
    expect(preferVerified([])).toEqual([]);
  });
});

// ---- the whole pipeline -------------------------------------------------------------

const WINDOW: TimeWindow = { date: "2026-10-02", startMin: 11 * 60, endMin: 15 * 60, availableMinutes: 240, minUsefulMinutes: 45 };
const BARNET = { lat: 51.65309, lng: -0.2002261 };
const NO_AFFINITY: AffinityScores = { categoryScores: {}, tagScores: {}, activityScores: {}, recentCategoryCounts: {} };

let n = 0;
const place = (overrides: Partial<OpportunityCandidate> & { km?: number } = {}): OpportunityCandidate => {
  const { km = 1.5, ...rest } = overrides;
  return {
    id: `id-${++n}`,
    title: `Place ${n}`,
    description: null,
    category: "Explore",
    address: "Somewhere, Barnet",
    price_estimate: null,
    tags: ["outdoors", "walking"],
    rating: null,
    accessibility_notes: null,
    location_lat: BARNET.lat + km / 111,
    location_lng: BARNET.lng,
    booking_url: "https://example.org",
    date_time: null,
    expires_at: null,
    recurrence_rule: null,
    duration_minutes: 60,
    ...rest,
  };
};
const friendly = { dog_access: "allowed", dog_confidence: "verified" };

const inputs = (candidates: OpportunityCandidate[], context?: { dog?: boolean }): RecommendInputs => ({
  request: { start: "now", duration: "half_day", who: "just_me", mood: null, exclude: [], ...(context ? { context } : {}) },
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
});

describe("with the dog coming, through the whole recommendation", () => {
  it("leaves out a place that refuses dogs and offers the one that welcomes them", async () => {
    const banned = place({ title: "No Dogs Gardens", dog_access: "not_allowed", dog_confidence: "verified" });
    const ok = place({ title: "Dog Friendly Woods", ...friendly });
    const { options } = await buildRecommendations(inputs([banned, ok], { dog: true }));
    expect(options.map((o) => o.title)).toEqual(["Dog Friendly Woods"]);
    expect(options[0].facts).toContain("Dogs welcome");
    expect(options[0].contextNotes).toEqual([]);
    expect(options[0].why).toMatch(/dogs are welcome/i);
  });

  it("offers only the certain ones when some are certain, however good the unknown ones look", async () => {
    const known = place({ title: "Known Woods", ...friendly });
    const unknown = place({ title: "Unknown Park", rating: 5 });
    const { options } = await buildRecommendations(inputs([unknown, known], { dog: true }));
    expect(options.map((o) => o.title)).toEqual(["Known Woods"]);
  });

  it("offers the unknown ones, labelled to check, when nothing is certain", async () => {
    const a = place({ title: "Unknown Park" });
    const b = place({ title: "Unknown Meadow", category: "Move" });
    const { options } = await buildRecommendations(inputs([a, b], { dog: true }));
    expect(options.length).toBeGreaterThan(0);
    for (const o of options) {
      expect(o.contextNotes).toEqual(["Check dog access"]);
      expect(o.facts).toContain("Check dog access");
      expect(o.facts.some((f) => /dogs? (reportedly )?welcome/i.test(f))).toBe(false);
    }
  });

  it("leaves out everything when all of it refuses, rather than showing what cannot work", async () => {
    const { options } = await buildRecommendations(inputs([place({ dog_access: "not_allowed" }), place({ dog_access: "assistance_dogs_only", dog_confidence: "verified" })], { dog: true }));
    expect(options).toEqual([]);
  });

  it("changes nothing at all when the dog is not coming", async () => {
    // Different categories, so the shortlist's one-or-two-per-category spread does not drop any of them.
    const candidates = [
      place({ title: "No Dogs Gardens", dog_access: "not_allowed", category: "Explore" }),
      place({ title: "Unknown Park", category: "Move" }),
      place({ title: "Known Woods", category: "Wellness", ...friendly }),
    ];
    const without = await buildRecommendations(inputs(candidates));
    const no = await buildRecommendations(inputs(candidates, { dog: false }));
    expect(no.options.map((o) => o.title)).toEqual(without.options.map((o) => o.title));
    expect(without.options.map((o) => o.title).sort()).toEqual(["No Dogs Gardens", "Known Woods", "Unknown Park"].sort());
    for (const o of without.options) expect(o.contextNotes).toEqual([]);
  });

  it("will not end a walk with the dog at a pub that has not said it takes dogs", async () => {
    const walk = place({ title: "Dog Friendly Woods", ...friendly });
    const pub = (extra: Partial<OpportunityCandidate>) =>
      place({ title: "The Old Bull", tags: ["food-venue", "pub", "lunch"], duration_minutes: 60, location_lat: walk.location_lat! + 0.2 / 111, location_lng: walk.location_lng, ...extra });
    const plain = { ...inputs([walk], { dog: true }), window: { ...WINDOW, startMin: 11 * 60, endMin: 16 * 60, availableMinutes: 300 } };
    const unknownPub = await buildRecommendations({ ...plain, candidates: [walk, pub({})] });
    expect(unknownPub.options[0].foodStop).toBeNull();
    const dogPub = await buildRecommendations({ ...plain, candidates: [walk, pub({ ...friendly })] });
    expect(dogPub.options[0].foodStop?.title).toBe("The Old Bull");
    const bannedPub = await buildRecommendations({ ...plain, candidates: [walk, pub({ dog_access: "not_allowed" })] });
    expect(bannedPub.options[0].foodStop).toBeNull();
    // And without the dog the same unknown pub is a perfectly good place to finish.
    const noDog = await buildRecommendations({ ...plain, request: { ...plain.request, context: undefined }, candidates: [walk, pub({})] });
    expect(noDog.options[0].foodStop?.title).toBe("The Old Bull");
  });

  it("tells the model the dog is coming, and which places to tell them to check", () => {
    const e = evaluateCandidate(place({ title: "Unknown Park" }), {
      window: WINDOW, request: { start: "now", duration: "half_day", who: "just_me", mood: null, exclude: [], context: { dog: true } },
      member: inputs([]).member, affinity: NO_AFFINITY, history: EMPTY_HISTORY, pleasantWeather: false, daylight: { sunriseMin: 420, sunsetMin: 1080 },
    })!;
    const prompt = buildUserPrompt(
      { window: WINDOW, weekdayLabel: "Friday", request: { start: "now", duration: "half_day", who: "just_me", mood: null, exclude: [], context: { dog: true } }, weatherNote: null, profile: inputs([]).profile, aspirations: [], affinitySummary: "" },
      [{ evaluated: e, foodStop: null }]
    );
    expect(prompt).toMatch(/The dog is coming/);
    expect(prompt).toMatch(/not confirmed, tell them to check: Check dog access/);
  });
});

describe("whether the dog is coming when they did not say", () => {
  it("is what they usually do, only for someone with a dog, and what they say for this outing always wins", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/someTime/recommend.ts"), "utf8");
    expect(source).toContain("request.context?.dog ?? (profile?.has_dog === true && profile?.dog_usually_comes === true)");
    expect(source).toContain("has_dog, dog_usually_comes");
  });
});
