import { describe, expect, it } from "vitest";
import { computeLearnedAffinity, EVENT_WEIGHT, weightOfEvent, weightOfSignal, type LearningEvent, type LearningSignal } from "@/lib/memory/learning";
import { computeAffinity, scoreActivity, PROTECTED_FLOOR, type PreferenceSignalRow } from "@/lib/memory/scoring";

const NOW = new Date("2026-10-05T12:00:00Z");
const daysAgo = (d: number, extraMs = 0) => new Date(NOW.getTime() - d * 86_400_000 + extraMs).toISOString();

const WALK = { category: "Move", tags: ["walking", "outdoors"] };
const MUSEUM = { category: "Explore", tags: ["museum", "history"] };

let n = 0;
const event = (type: string, over: Partial<LearningEvent> & { days?: number; activity?: typeof WALK; id?: string } = {}): LearningEvent => {
  const { days = 1, activity = WALK, id = `a${++n}`, ...rest } = over;
  return { activity_id: id, event_type: type, outcome: null, reason: null, context: null, created_at: daysAgo(days), activities: activity, ...rest };
};
const signal = (type: string, over: Partial<LearningSignal> & { days?: number; activity?: typeof WALK; id?: string } = {}): LearningSignal => {
  const { days = 1, activity = WALK, id = `s${++n}`, ...rest } = over;
  return { signal_type: type, source: null, activity_id: id, created_at: daysAgo(days), activities: activity, ...rest };
};

const walking = (events: LearningEvent[], signals: LearningSignal[] = []) => computeLearnedAffinity(events, signals, NOW).tagScores["walking"] ?? 0;

describe("what each kind of evidence is worth: behaviour over words", () => {
  it("loving something you went to counts far more than planning it, and planning more than glancing at it", () => {
    const loved = walking([event("completed", { outcome: "loved" })]);
    const planned = walking([event("planned")]);
    const opened = walking([event("opened")]);
    expect(loved).toBeGreaterThan(planned);
    expect(planned).toBeGreaterThan(opened);
    expect(opened).toBeGreaterThan(0);
  });

  it("going and finding it fine is a faint yes; going and not liking it is a clear no", () => {
    expect(walking([event("completed", { outcome: "fine" })])).toBeGreaterThan(0);
    expect(walking([event("completed", { outcome: "fine" })])).toBeLessThan(walking([event("planned")]));
    expect(walking([event("completed", { outcome: "not_for_me" })])).toBeLessThan(-1);
  });

  it("is about taste only when the refusal is about taste", () => {
    expect(walking([event("dismissed", { reason: "not_my_thing" })])).toBeLessThan(0);
    for (const reason of ["too_far", "too_expensive", "seen_it", "didnt_go"]) {
      expect(walking([event("dismissed", { reason })])).toBe(0);
    }
  });

  it("learns nothing against walking from a refusal the day explains", () => {
    expect(walking([event("dismissed", { reason: "not_my_thing", context: { explainedByState: true } })])).toBe(0);
  });

  it("weighs the numbers it documents", () => {
    expect(weightOfEvent({ event_type: "completed", outcome: "loved", reason: null })).toBe(EVENT_WEIGHT.lovedIt);
    expect(weightOfEvent({ event_type: "shown", outcome: null, reason: null })).toBeNull();
  });
});

describe("quietly passing something over", () => {
  const museums = (shownDaysAgo: number, count: number, engage = false) => [
    ...Array.from({ length: count }, (_, i) => event("shown", { id: `m${i}`, activity: MUSEUM, days: shownDaysAgo })),
    ...(engage ? Array.from({ length: count }, (_, i) => event("opened", { id: `m${i}`, activity: MUSEUM, days: shownDaysAgo })) : []),
  ];
  const museumScore = (events: LearningEvent[]) => computeLearnedAffinity(events, [], NOW).tagScores["museum"] ?? 0;

  it("counts ideas shown and never touched as a faint no, once they have had time to respond", () => {
    expect(museumScore(museums(5, 6))).toBeLessThan(0);
    expect(museumScore(museums(5, 6))).toBeGreaterThan(-1.5); // faint: an impression is not a verdict
  });

  it("does not count an idea shown only a moment ago", () => {
    expect(museumScore(museums(0.5, 6))).toBe(0);
  });

  it("does not count ideas they did engage with", () => {
    expect(museumScore(museums(5, 6, true))).toBeGreaterThan(0);
  });

  it("counts each idea once, however many times it was shown", () => {
    const once = [event("shown", { id: "x", activity: MUSEUM, days: 5 })];
    const many = Array.from({ length: 5 }, (_, i) => event("shown", { id: "x", activity: MUSEUM, days: 5 + i }));
    expect(museumScore(many)).toBe(museumScore(once));
  });
});

describe("evidence, not assumption", () => {
  it("fades with time (half after about two months) and eventually stops counting", () => {
    const fresh = walking([event("completed", { outcome: "loved", days: 0 })]);
    const twoMonths = walking([event("completed", { outcome: "loved", days: 60 })]);
    expect(twoMonths).toBeLessThan(fresh);
    expect(twoMonths).toBeGreaterThan(fresh * 0.3);
    expect(walking([event("completed", { outcome: "loved", days: 400 })])).toBe(0);
  });

  it("a pattern tilts further than one data point, and confidence grows with it", () => {
    const one = computeLearnedAffinity([event("completed", { outcome: "loved" })], [], NOW);
    const ten = computeLearnedAffinity(
      Array.from({ length: 10 }, (_, i) => event("completed", { outcome: "loved", days: i + 1 })),
      [],
      NOW
    );
    expect(ten.tagScores["walking"]).toBeGreaterThan(one.tagScores["walking"]);
    expect(ten.confidence.tag["walking"]).toBeGreaterThan(one.confidence.tag["walking"]);
    expect(one.confidence.tag["walking"]).toBeLessThan(0.9);
    expect(ten.confidence.tag["walking"]).toBeGreaterThan(0.9);
  });

  it("mixed evidence cancels rather than piling up", () => {
    const mixed = walking([event("completed", { outcome: "loved" }), event("completed", { outcome: "not_for_me" })]);
    expect(Math.abs(mixed)).toBeLessThan(0.5);
  });

  it("is the same answer every time for the same history", () => {
    const events = [event("completed", { outcome: "loved" }), event("planned"), event("dismissed", { reason: "not_my_thing", activity: MUSEUM })];
    expect(computeLearnedAffinity(events, [], NOW)).toEqual(computeLearnedAffinity(events, [], NOW));
  });

  it("reads nothing for a member with no history", () => {
    const a = computeLearnedAffinity([], [], NOW);
    expect(a.categoryScores).toEqual({});
    expect(a.tagScores).toEqual({});
    expect(a.evidenceCount).toBe(0);
  });

  it("keeps a score per activity for what was done about that very thing", () => {
    const a = computeLearnedAffinity([event("completed", { id: "same", outcome: "loved" })], [], NOW);
    expect(a.activityScores["same"]).toBeGreaterThan(0);
  });
});

describe("older signals: counted once, and for what they really were", () => {
  it("does not count a signal that the log already describes", () => {
    const e = event("completed", { id: "twin", outcome: "loved", days: 3 });
    const twin = signal("liked", { id: "twin", days: 3, source: "accept" }); // written in the same moment, by the same action
    expect(walking([e], [twin])).toBe(walking([e]));
  });

  it("does count a signal from a different moment, or about a different thing", () => {
    const e = event("completed", { id: "twin", outcome: "loved", days: 3 });
    expect(walking([e], [signal("liked", { id: "twin", days: 2 })])).toBeGreaterThan(walking([e]));
    expect(walking([e], [signal("liked", { id: "other", days: 3 })])).toBeGreaterThan(walking([e]));
  });

  it("reads old history (from before the log) on its own", () => {
    expect(walking([], [signal("liked", { source: "accept" })])).toBeGreaterThan(0);
  });

  it("treats a 'liked' that was only accepting a plan as a yes to a plan, not a verdict", () => {
    expect(weightOfSignal({ signal_type: "liked", source: "accept" })).toBe(EVENT_WEIGHT.planned);
    expect(weightOfSignal({ signal_type: "liked", source: "explicit_feedback" })).toBe(EVENT_WEIGHT.saved);
  });

  it("does not read a skipped plan as a dislike", () => {
    expect(weightOfSignal({ signal_type: "disliked", source: "skip" })).toBeGreaterThan(EVENT_WEIGHT.notMyThing);
    const fiveSkips = Array.from({ length: 5 }, (_, i) => signal("disliked", { source: "skip", days: i + 1 }));
    expect(walking([], fiveSkips)).toBeGreaterThan(-1.5);
    // Where the older scoring read the same five skips as a firm dislike.
    const old = computeAffinity(fiveSkips.map((s) => ({ ...s, signal_type: s.signal_type }) as PreferenceSignalRow));
    expect(old.tagScores["walking"]).toBeLessThan(-5);
  });

  it("says nothing about taste for logistics and 'too similar'", () => {
    for (const type of ["too_far", "too_expensive", "too_similar"]) {
      expect(weightOfSignal({ signal_type: type, source: null })).toBeNull();
      expect(walking([], [signal(type)])).toBe(0);
    }
  });
});

describe("what they have been doing lately (to balance a week)", () => {
  it("counts what they planned, did and turned down in the last four weeks, not impressions", () => {
    const a = computeLearnedAffinity(
      [event("planned", { days: 2 }), event("completed", { outcome: "fine", days: 5 }), event("shown", { days: 3 }), event("opened", { days: 3 }), event("planned", { days: 60 })],
      [],
      NOW
    );
    expect(a.recentCategoryCounts["Move"]).toBe(2);
  });
});

describe("what they told us is not silently overwritten", () => {
  const activity = { id: "x", category: "Explore", tags: ["history"], rating: null };
  const against = computeLearnedAffinity(
    Array.from({ length: 8 }, (_, i) => event("completed", { activity: { category: "Explore", tags: ["history"] }, outcome: "not_for_me", days: i + 1 })),
    [],
    NOW
  );

  it("behaviour can count against a tag", () => {
    expect(scoreActivity(activity, against)).toBeLessThan(-5);
  });

  it("but only so far when they listed it as an interest", () => {
    const protectedScore = scoreActivity(activity, { ...against, protectedTags: ["history"] });
    expect(protectedScore).toBeGreaterThan(scoreActivity(activity, against));
    // The tag's own contribution is floored; the category's learned score still applies.
    const tagOnly = scoreActivity({ ...activity, category: "Nothing" }, { ...against, protectedTags: ["history"] });
    expect(tagOnly).toBe(PROTECTED_FLOOR);
  });

  it("does not protect tags they did not list", () => {
    expect(scoreActivity(activity, { ...against, protectedTags: ["gardening"] })).toBe(scoreActivity(activity, against));
  });
});

describe("breadth counts for more than repetition", () => {
  const garden = { category: "Joy", tags: ["gardens", "outdoors", "quiet"] };
  const softPlay = { category: "Joy", tags: ["playground", "grandchildren", "indoor"] };
  const categoryJoy = (events: LearningEvent[]) => computeLearnedAffinity(events, [], NOW).categoryScores["Joy"] ?? 0;
  const loved = (id: string, days: number, activity = garden) => event("completed", { id, activity, outcome: "loved", days });

  it("one place visited many times says little about its whole category", () => {
    const manyVisits = [1, 5, 9, 13, 17, 21].map((d) => loved("same-garden", d));
    const oneVisit = [loved("same-garden", 1)];
    // Six visits is not six times the evidence about "Joy": it is capped.
    expect(categoryJoy(manyVisits)).toBeLessThan(categoryJoy(oneVisit) * 2.2);
  });

  it("but the place itself is remembered whole", () => {
    const a = computeLearnedAffinity([1, 5, 9].map((d) => loved("same-garden", d)), [], NOW);
    const b = computeLearnedAffinity([loved("same-garden", 1)], [], NOW);
    expect(a.activityScores["same-garden"]).toBeGreaterThan(b.activityScores["same-garden"] * 2);
  });

  it("different places say more about a category than the same place again and again", () => {
    const broad = [1, 5, 9].map((d, i) => loved(`garden-${i}`, d));
    const narrow = [1, 5, 9].map((d) => loved("same-garden", d));
    expect(categoryJoy(broad)).toBeGreaterThan(categoryJoy(narrow) * 1.5);
  });

  it("a loved garden does not lift an unrelated place in the same category much", () => {
    const history = [1, 6, 11].map((d) => loved("same-garden", d));
    const learned = computeLearnedAffinity(history, [], NOW);
    const soft = { id: "soft", category: softPlay.category, tags: softPlay.tags, rating: null };
    const theGarden = { id: "same-garden", category: garden.category, tags: garden.tags, rating: null };
    // The unrelated place (shares only the category) gains something, but far less than the garden itself.
    expect(scoreActivity(soft, learned)).toBeGreaterThan(0);
    expect(scoreActivity(soft, learned)).toBeLessThan(scoreActivity(theGarden, learned) / 2);
  });

  it("spreads one place's evidence across its tags instead of shouting through each", () => {
    const manyTags = { category: "Joy", tags: ["a", "b", "c", "d"] };
    const oneTag = { category: "Joy", tags: ["a"] };
    const tagA = (activity: typeof manyTags) => computeLearnedAffinity([loved("x", 1, activity)], [], NOW).tagScores["a"];
    expect(tagA(manyTags)).toBeLessThan(tagA(oneTag));
  });
});
