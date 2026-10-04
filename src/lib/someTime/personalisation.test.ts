import { describe, expect, it } from "vitest";
import type { OpportunityCandidate } from "@/lib/opportunities/engine";
import { computeAffinity, type AffinityScores, type PreferenceSignalRow } from "@/lib/memory/scoring";
import { computeLearnedAffinity, type LearningEvent } from "@/lib/memory/learning";
import { buildRecommendationMemory } from "@/lib/memory/memory";
import { buildRepetitionHistory } from "@/lib/someTime/history";
import { requestWithDailyState, type DailyState } from "@/lib/experience/dailyState";
import { explainedByState, signalForDismissal } from "@/lib/experience/events";
import { buildRecommendations, type RecommendInputs } from "@/lib/someTime/recommend";
import { EMPTY_HISTORY, evaluateCandidate, type ScoringInput } from "@/lib/someTime/score";
import type { TimeRequest } from "@/lib/someTime/request";
import type { TimeWindow } from "@/lib/someTime/window";

/**
 * Personalisation scenarios: does the app behave like something that knows this
 * person, rather than like a search? These are the brief's own examples, written as
 * assertions. They run on the real scoring code with simulated members, because the
 * thing being tested (that accumulated understanding changes what is suggested, and
 * that a bad day is not read as a dislike) cannot be waited for with real members.
 */

// Friday 2 October 2026, four free hours: long enough for a three-hour walk.
const AFTERNOON: TimeWindow = { date: "2026-10-02", startMin: 13 * 60 + 10, endMin: 17 * 60 + 10, availableMinutes: 240, minUsefulMinutes: 45 };
const HOME = { lat: 51.65309, lng: -0.2002261 };
const NONE: AffinityScores = { categoryScores: {}, tagScores: {}, activityScores: {}, recentCategoryCounts: {} };

let n = 0;
const place = (over: Partial<OpportunityCandidate> & { km?: number } = {}): OpportunityCandidate => {
  const { km = 1.5, ...rest } = over;
  return {
    id: `p${++n}`,
    title: `Place ${n}`,
    description: null,
    category: "Explore",
    address: "Barnet",
    price_estimate: 0,
    tags: [],
    rating: null,
    accessibility_notes: null,
    location_lat: HOME.lat + km / 111,
    location_lng: HOME.lng,
    booking_url: "https://example.org",
    date_time: null,
    expires_at: null,
    recurrence_rule: null,
    duration_minutes: 60,
    ...rest,
  };
};

// The same small town for every scenario.
const woodlandWalk = place({ title: "Woodland Trail", category: "Move", tags: ["walking", "outdoors", "nature"], duration_minutes: 180 });
const heritageHouse = place({ title: "Hall Place House", category: "Explore", tags: ["heritage", "history", "museum"], duration_minutes: 100 });
const localMuseum = place({ title: "Town Museum", category: "Explore", tags: ["museum", "history", "indoor"], duration_minutes: 75 });
const rosePark = place({ title: "Rose Garden", category: "Joy", tags: ["gardens", "outdoors", "quiet"], duration_minutes: 45 });
const bookshop = place({ title: "Reading Room Library", category: "Learn", tags: ["books", "quiet", "indoor"], duration_minutes: 50 });
const theatre = place({ title: "Studio Theatre", category: "Joy", tags: ["theatre", "indoor"], duration_minutes: 90 });
const pool = place({ title: "Leisure Centre Pool", category: "Move", tags: ["swimming", "fitness", "indoor"], duration_minutes: 60 });
const TOWN = [woodlandWalk, heritageHouse, localMuseum, rosePark, bookshop, theatre, pool];

const request = (over: Partial<TimeRequest> = {}): TimeRequest => ({ start: "now", duration: "half_day", who: "just_me", mood: null, exclude: [], ...over });

const member = {
  budget_band: null,
  interests: [],
  goals: [],
  dietary: null,
  mobility_notes: null,
  travel: { drives: true, uses_public_transport: null, mobility_notes: null },
  home: HOME,
};

function scoring(over: Partial<ScoringInput> = {}): ScoringInput {
  return { window: AFTERNOON, request: request(), member, affinity: NONE, history: EMPTY_HISTORY, pleasantWeather: false, ...over };
}

/** Candidates best first, by the real scorer. */
function ranking(input: ScoringInput, pool = TOWN): string[] {
  return pool
    .map((c) => ({ c, e: evaluateCandidate(c, input) }))
    .filter((x): x is { c: OpportunityCandidate; e: NonNullable<typeof x.e> } => x.e !== null)
    .sort((a, b) => b.e.score - a.e.score)
    .map((x) => x.c.title);
}

const signalOn = (c: OpportunityCandidate, type: string, daysAgo: number): PreferenceSignalRow => ({
  signal_type: type,
  activity_id: c.id,
  created_at: new Date(Date.UTC(2026, 9, 2, 12) - daysAgo * 86_400_000).toISOString(),
  activities: { category: c.category, tags: c.tags },
});

const state = (over: Partial<DailyState> = {}): DailyState => ({ energy: "normal", intention: null, indoors: false, lessWalking: false, ...over });

describe("the defensibility test: someone who has used the app is served better than someone who joined today", () => {
  // A member who, over several weeks, kept choosing historic houses and the theatre, and kept turning down the long walk.
  const history: PreferenceSignalRow[] = [
    ...[1, 4, 8, 12, 18, 24].map((d) => signalOn(heritageHouse, "liked", d)),
    ...[2, 9, 20].map((d) => signalOn(theatre, "liked", d)),
    ...[3, 10, 21].map((d) => signalOn(woodlandWalk, "disliked", d)),
    ...[5, 15].map((d) => signalOn(pool, "disliked", d)),
  ];
  const experienced = scoring({ affinity: computeAffinity(history) });
  const newcomer = scoring();
  const rank = (r: string[], title: string) => r.indexOf(title);

  it("puts what they have shown they love higher than it ranks for a newcomer", () => {
    const before = ranking(newcomer);
    const after = ranking(experienced);
    expect(rank(after, "Hall Place House")).toBeLessThan(rank(before, "Hall Place House"));
    expect(rank(after, "Studio Theatre")).toBeLessThan(rank(before, "Studio Theatre"));
  });

  it("puts what they keep turning down lower", () => {
    expect(rank(ranking(experienced), "Woodland Trail")).toBeGreaterThan(rank(ranking(newcomer), "Woodland Trail"));
    // The pool is already last for a newcomer, so its place cannot fall: its score does.
    expect(evaluateCandidate(pool, experienced)!.score).toBeLessThan(evaluateCandidate(pool, newcomer)!.score);
  });

  it("leads with what they love", () => {
    expect(ranking(experienced)[0]).toBe("Hall Place House");
  });

  it("gives a materially different top three, not a reshuffle of the same thing", () => {
    const top = (r: string[]) => new Set(r.slice(0, 3));
    const a = top(ranking(experienced));
    const b = top(ranking(newcomer));
    const shared = [...a].filter((t) => b.has(t)).length;
    expect(shared).toBeLessThan(3);
  });

  it("explains itself with their own history, which a newcomer cannot be given", () => {
    expect(evaluateCandidate(heritageHouse, experienced)!.reasons.join(" ")).toMatch(/you have enjoyed/);
    expect(evaluateCandidate(heritageHouse, newcomer)!.reasons.join(" ")).not.toMatch(/you have enjoyed/);
  });

  it("goes further with more history: more evidence means a stronger tilt", () => {
    const light = scoring({ affinity: computeAffinity(history.slice(0, 2)) });
    const strength = (input: ScoringInput) => evaluateCandidate(heritageHouse, input)!.score - evaluateCandidate(woodlandWalk, input)!.score;
    expect(strength(experienced)).toBeGreaterThan(strength(light));
    expect(strength(light)).toBeGreaterThan(strength(newcomer));
  });
});

describe("how they feel today changes what suits them today", () => {
  const walker = scoring({ affinity: computeAffinity([1, 3, 7, 11, 16].map((d) => signalOn(woodlandWalk, "liked", d))) });

  it("a long walk lover is offered the walk on an ordinary day", () => {
    expect(ranking(walker)[0]).toBe("Woodland Trail");
  });

  it("but is not offered the three-hour walk at all on a day they are taking it easy", () => {
    const tired = ranking({ ...walker, dailyState: state({ energy: "low" }) });
    expect(tired).not.toContain("Woodland Trail");
  });

  it("and is offered something gentle instead", () => {
    const tired = ranking({ ...walker, dailyState: state({ energy: "low" }) });
    expect(["Rose Garden", "Reading Room Library", "Town Museum", "Studio Theatre", "Hall Place House"]).toContain(tired[0]);
  });

  it("an energetic day leaves the walk on top", () => {
    expect(ranking({ ...walker, dailyState: state({ energy: "high" }) })[0]).toBe("Woodland Trail");
  });

  it("indoors preferred puts something indoors on top, however much they love the outdoors", () => {
    const indoors = ranking({ ...walker, dailyState: state({ indoors: true }) });
    expect(["Leisure Centre Pool", "Town Museum", "Hall Place House", "Studio Theatre", "Reading Room Library"]).toContain(indoors[0]);
    expect(indoors.indexOf("Woodland Trail")).toBeGreaterThan(0);
  });

  it("less walking takes the walk off the top, whatever they usually like", () => {
    const less = ranking({ ...walker, dailyState: state({ lessWalking: true }) });
    expect(less[0]).not.toBe("Woodland Trail");
  });

  it("changes nothing at all for someone who never says how they are", () => {
    const a = ranking({ ...walker, dailyState: null });
    const b = ranking({ ...walker, dailyState: undefined });
    expect(a).toEqual(b);
    expect(a).toEqual(ranking(walker));
  });
});

describe("a bad day is not a dislike", () => {
  const liked = [1, 3, 7, 11, 16].map((d) => signalOn(woodlandWalk, "liked", d));
  const walkingScore = (signals: PreferenceSignalRow[]) => computeAffinity(signals).tagScores["walking"] ?? 0;

  it("turning down the long walk on a taking-it-easy day teaches nothing about walking", () => {
    const explained = explainedByState(state({ energy: "low" }), woodlandWalk, { durationMinutes: 180 });
    expect(explained).toBe(true);
    const signal = signalForDismissal("not_my_thing", explained);
    expect(signal).toBeNull();

    // The affinity is exactly what it was: nothing was learned against walking.
    const afterwards = signal ? [...liked, signalOn(woodlandWalk, signal, 0)] : liked;
    expect(walkingScore(afterwards)).toBe(walkingScore(liked));
  });

  it("the same refusal on an ordinary day does count against it", () => {
    const explained = explainedByState(state(), woodlandWalk, { durationMinutes: 180 });
    expect(explained).toBe(false);
    const signal = signalForDismissal("not_my_thing", explained);
    expect(signal).toBe("disliked");
    expect(walkingScore([...liked, signalOn(woodlandWalk, signal!, 0)])).toBeLessThan(walkingScore(liked));
  });

  it("so the walk still comes back on a normal day after a tired-day refusal", () => {
    const walker = scoring({ affinity: computeAffinity(liked) });
    expect(ranking({ ...walker, dailyState: state() })[0]).toBe("Woodland Trail");
  });
});

describe("what they feel like today stands in for a mood they did not choose", () => {
  it("uses the intention when the request has no mood", () => {
    const culture = requestWithDailyState(request(), state({ intention: "culture" }));
    expect(culture.mood).toBe("culture");
    const top = ranking(scoring({ request: culture }))[0];
    expect(["Hall Place House", "Town Museum", "Studio Theatre", "Reading Room Library"]).toContain(top);
  });

  it("never overrides a mood they chose for this request", () => {
    expect(requestWithDailyState(request({ mood: "food" }), state({ intention: "outdoors" })).mood).toBe("food");
  });

  it("does nothing without an intention", () => {
    const r = request();
    expect(requestWithDailyState(r, state())).toBe(r);
    expect(requestWithDailyState(r, null)).toBe(r);
  });
});

describe("end to end, through the real recommendation pipeline", () => {
  const base = (over: Partial<RecommendInputs> = {}): RecommendInputs => ({
    request: request(),
    window: AFTERNOON,
    candidates: TOWN,
    weatherNote: null,
    pleasantWeather: false,
    member,
    affinity: computeAffinity([1, 3, 7, 11, 16].map((d) => signalOn(woodlandWalk, "liked", d))),
    history: EMPTY_HISTORY,
    profile: { goals: [], interests: [], budget_band: null, dietary: null, mobility_notes: null, personality: null },
    aspirations: [],
    ask: null,
    ...over,
  });

  it("offers the walk to its fan on an ordinary day", async () => {
    const { options } = await buildRecommendations(base());
    expect(options[0].title).toBe("Woodland Trail");
  });

  it("never puts the three-hour walk in front of them on a taking-it-easy day, and says why the gentle choices fit", async () => {
    const { options } = await buildRecommendations(base({ dailyState: state({ energy: "low" }) }));
    expect(options.map((o) => o.title)).not.toContain("Woodland Trail");
    expect(options.length).toBeGreaterThan(0);
    expect(options.map((o) => o.reason).join(" ")).toMatch(/gentle|taking it easy|indoors/);
  });

  it("brings in what they said they feel like today", async () => {
    const { options } = await buildRecommendations(base({ affinity: NONE, dailyState: state({ intention: "outdoors" }) }));
    expect(["Woodland Trail", "Rose Garden"]).toContain(options[0].title);
  });
});

// ---------------------------------------------------------------------------
// Phase 1 learning: behaviour in context, memory of what was done and refused.
// ---------------------------------------------------------------------------

describe("learning from real behaviour, end to end", () => {
  const NOW = new Date("2026-10-02T12:00:00Z");
  const ago = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();
  const eventOn = (c: OpportunityCandidate, type: string, days: number, over: Partial<LearningEvent> = {}): LearningEvent => ({
    activity_id: c.id,
    event_type: type,
    outcome: null,
    reason: null,
    context: null,
    created_at: ago(days),
    activities: { category: c.category, tags: c.tags },
    ...over,
  });
  const completed = (c: OpportunityCandidate, days: number, outcome = "loved") => eventOn(c, "completed", days, { outcome });

  const scoringFor = (events: LearningEvent[]): ScoringInput => {
    const memory = buildRecommendationMemory(events, NOW);
    return scoring({ affinity: computeLearnedAffinity(events, [], NOW), history: buildRepetitionHistory([], [], "2026-10-02", memory) });
  };
  const scoreOf = (c: OpportunityCandidate, input: ScoringInput) => evaluateCandidate(c, input)!.score;

  it("ranks a six-month pattern above a single recent whim", () => {
    // They went to the heritage house on four separate occasions across months, and to the theatre once.
    const events = [completed(heritageHouse, 150), completed(heritageHouse, 110), completed(heritageHouse, 70), completed(heritageHouse, 35), completed(theatre, 2)];
    const input = scoringFor(events);
    const gap = (i: ScoringInput) => scoreOf(heritageHouse, i) - scoreOf(theatre, i);
    expect(scoreOf(heritageHouse, input)).toBeGreaterThan(scoreOf(theatre, input));
    // A newcomer has no such pattern to go on: the history is what widens the gap.
    expect(gap(input)).toBeGreaterThan(gap(scoring()) + 2);
  });

  it("learns to pass over what is shown and never touched, without treating it as a refusal", () => {
    const shown = Array.from({ length: 6 }, (_, i) => eventOn(localMuseum, "shown", 10 + i * 2));
    const input = scoringFor(shown);
    expect(scoreOf(localMuseum, input)).toBeLessThan(scoreOf(localMuseum, scoring()));
    expect(scoreOf(localMuseum, input)).toBeGreaterThan(scoreOf(localMuseum, scoring()) - 2); // faint: it is not a verdict
  });

  describe("repeatable favourites versus one-offs", () => {
    const aWeekAgo = (c: OpportunityCandidate) => [completed(c, 8)];

    it("a one-off done last week is marked down as a repeat", () => {
      const penalised = scoreOf(heritageHouse, scoringFor(aWeekAgo(heritageHouse)));
      const never = scoreOf(heritageHouse, scoring());
      // (it was loved, so the affinity helps, but the repeat penalty must still bite)
      const affinityOnly = scoreOf(heritageHouse, scoring({ affinity: computeLearnedAffinity(aWeekAgo(heritageHouse), [], NOW) }));
      expect(penalised).toBeLessThan(affinityOnly);
      expect(never).toBeLessThan(affinityOnly);
    });

    it("a favourite they keep going back to is not marked down for a repeat", () => {
      const events = [completed(woodlandWalk, 22), completed(woodlandWalk, 15), completed(woodlandWalk, 8)];
      const withMemory = scoringFor(events);
      const affinityOnly = scoring({ affinity: computeLearnedAffinity(events, [], NOW) });
      expect(scoreOf(woodlandWalk, withMemory)).toBe(scoreOf(woodlandWalk, affinityOnly));
    });

    it("but not the very day after the last time", () => {
      const events = [completed(woodlandWalk, 20), completed(woodlandWalk, 10), completed(woodlandWalk, 2)];
      const input = scoringFor(events);
      const affinityOnly = scoring({ affinity: computeLearnedAffinity(events, [], NOW) });
      expect(scoreOf(woodlandWalk, input)).toBeLessThan(scoreOf(woodlandWalk, affinityOnly));
    });
  });

  describe("what was turned down stays turned down", () => {
    it("is kept out of the way while it is fresh, and welcomed back after a long while", () => {
      const refusal = (days: number) => [eventOn(localMuseum, "dismissed", days, { reason: "not_my_thing" })];
      const fresh = scoreOf(localMuseum, scoringFor(refusal(3)));
      const later = scoreOf(localMuseum, scoringFor(refusal(75)));
      expect(fresh).toBeLessThan(later);
      expect(later).toBeLessThan(scoreOf(localMuseum, scoring()) + 1); // still a little cooler than never having been refused
    });

    it("a refusal the day explains is not held against it", () => {
      const explained = [eventOn(woodlandWalk, "dismissed", 3, { reason: "not_my_thing", context: { explainedByState: true } })];
      expect(scoreOf(woodlandWalk, scoringFor(explained))).toBe(scoreOf(woodlandWalk, scoring()));
    });

    it("'too far' is forgotten within a fortnight", () => {
      const tooFar = (days: number) => [eventOn(woodlandWalk, "dismissed", days, { reason: "too_far" })];
      expect(scoreOf(woodlandWalk, scoringFor(tooFar(2)))).toBeLessThan(scoreOf(woodlandWalk, scoring()));
      expect(scoreOf(woodlandWalk, scoringFor(tooFar(20)))).toBe(scoreOf(woodlandWalk, scoring()));
    });
  });

  it("'I didn't go' leaves something not done, so it is not avoided as a repeat", () => {
    // They said yes to the plan (an accepted plan item counts as done), then said they never went.
    const plans = [{ week_start_date: "2026-09-28", itinerary_items: [{ day_of_week: "Wed", member_action: "accepted", activities: { id: theatre.id, category: theatre.category } }] }];
    const didntGo = [eventOn(theatre, "dismissed", 1, { reason: "didnt_go" })];
    const withoutAnswer = buildRepetitionHistory(plans, [], "2026-10-02");
    const memory = buildRecommendationMemory(didntGo, NOW);
    const withAnswer = buildRepetitionHistory(plans, [], "2026-10-02", memory);
    expect(withoutAnswer.recentActivityIds.has(theatre.id)).toBe(true);
    expect(withAnswer.recentActivityIds.has(theatre.id)).toBe(false);
  });

  it("a skipped plan is not read as a dislike: far milder than the older scoring did", () => {
    const skips = Array.from({ length: 5 }, (_, i) => ({
      signal_type: "disliked",
      source: "skip",
      activity_id: woodlandWalk.id,
      created_at: ago(i + 1),
      activities: { category: woodlandWalk.category, tags: woodlandWalk.tags },
    }));
    const learned = scoring({ affinity: computeLearnedAffinity([], skips, NOW) });
    const olderReading = scoring({ affinity: computeAffinity(skips as unknown as PreferenceSignalRow[]) });
    expect(scoreOf(woodlandWalk, learned)).toBeGreaterThan(scoreOf(woodlandWalk, olderReading) + 3);
    // Still a faint note against this one thing (they did skip it five times), not a verdict on walking.
    expect(scoreOf(woodlandWalk, learned)).toBeLessThan(scoreOf(woodlandWalk, scoring()));
  });
});
