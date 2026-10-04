import { describe, expect, it } from "vitest";
import { buildRecommendationMemory, type MemoryEvent } from "@/lib/memory/memory";

const NOW = new Date("2026-10-05T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();
const ev = (id: string, type: string, days: number, over: Partial<MemoryEvent> = {}): MemoryEvent => ({
  activity_id: id,
  event_type: type,
  outcome: null,
  reason: null,
  context: null,
  created_at: daysAgo(days),
  ...over,
});
const done = (id: string, days: number, outcome: "loved" | "fine" | "not_for_me" = "loved") => ev(id, "completed", days, { outcome });
const mem = (events: MemoryEvent[]) => buildRecommendationMemory(events, NOW);

describe("repeatable favourites versus one-offs", () => {
  it("something gone to on two different days is a favourite", () => {
    expect(mem([done("walk", 20), done("walk", 13)]).favouriteIds.has("walk")).toBe(true);
  });

  it("something gone to once is a one-off, not yet a favourite", () => {
    expect(mem([done("gallery", 10)]).favouriteIds.has("gallery")).toBe(false);
  });

  it("twice on the same day is still one visit", () => {
    expect(mem([done("walk", 3), done("walk", 3)]).favouriteIds.has("walk")).toBe(false);
  });

  it("loved once and then chosen again is a favourite", () => {
    expect(mem([done("pub", 14), ev("pub", "planned", 6)]).favouriteIds.has("pub")).toBe(true);
  });

  it("is never a favourite if they have said it was not for them", () => {
    expect(mem([done("walk", 20), done("walk", 13), done("walk", 6, "not_for_me")]).favouriteIds.has("walk")).toBe(false);
  });

  it("a favourite done within the week is 'recent', and one done earlier is not", () => {
    expect(mem([done("walk", 20), done("walk", 4)]).recentFavouriteIds.has("walk")).toBe(true);
    expect(mem([done("walk", 20), done("walk", 12)]).recentFavouriteIds.has("walk")).toBe(false);
  });
});

describe("what they have turned down stays turned down, for as long as it deserves", () => {
  const penalty = (events: MemoryEvent[], id = "x") => mem(events).rejectionPenalty.get(id) ?? 0;

  it("a plain 'not my thing' is remembered for months, and fades", () => {
    const fresh = penalty([ev("x", "dismissed", 1, { reason: "not_my_thing" })]);
    const later = penalty([ev("x", "dismissed", 45, { reason: "not_my_thing" })]);
    expect(fresh).toBeGreaterThan(7);
    expect(later).toBeGreaterThan(3);
    expect(later).toBeLessThan(fresh);
    expect(penalty([ev("x", "dismissed", 100, { reason: "not_my_thing" })])).toBe(0);
  });

  it("is not a rejection at all when the day explains it", () => {
    expect(penalty([ev("x", "dismissed", 1, { reason: "not_my_thing", context: { explainedByState: true } })])).toBe(0);
  });

  it("going and not liking it is remembered like a firm no", () => {
    expect(penalty([done("x", 5, "not_for_me")])).toBeGreaterThan(7);
  });

  it("'I've already done this' keeps something away for half a year, unless it is a favourite", () => {
    expect(penalty([ev("x", "dismissed", 100, { reason: "seen_it" })])).toBeGreaterThan(3);
    expect(penalty([done("x", 40), done("x", 33), ev("x", "dismissed", 2, { reason: "seen_it" })])).toBe(0);
  });

  it("'too far' and 'too expensive' are remembered only for a fortnight", () => {
    expect(penalty([ev("x", "dismissed", 1, { reason: "too_far" })])).toBeGreaterThan(3);
    expect(penalty([ev("x", "dismissed", 20, { reason: "too_far" })])).toBe(0);
    expect(penalty([ev("x", "dismissed", 1, { reason: "too_expensive" })])).toBeGreaterThan(3);
  });

  it("takes the strongest reason when there are several, and keeps ideas apart", () => {
    const m = mem([ev("x", "dismissed", 1, { reason: "too_far" }), ev("x", "dismissed", 1, { reason: "not_my_thing" }), ev("y", "dismissed", 1, { reason: "too_far" })]);
    expect(m.rejectionPenalty.get("x")).toBeGreaterThan(7);
    expect(m.rejectionPenalty.get("y")).toBeLessThan(5);
  });
});

describe("planned but not done", () => {
  it("'I didn't go' means it was not done", () => {
    expect(mem([ev("x", "dismissed", 3, { reason: "didnt_go" })]).notDoneIds.has("x")).toBe(true);
  });

  it("unless they went afterwards", () => {
    expect(mem([ev("x", "dismissed", 6, { reason: "didnt_go" }), done("x", 2)]).notDoneIds.has("x")).toBe(false);
  });

  it("is forgotten after a month", () => {
    expect(mem([ev("x", "dismissed", 40, { reason: "didnt_go" })]).notDoneIds.has("x")).toBe(false);
  });
});

describe("what was actually gone to lately", () => {
  it("is what they completed in the last four weeks, not what they turned down", () => {
    const m = mem([done("a", 10), done("b", 40), done("c", 3, "not_for_me")]);
    expect([...m.recentlyDoneIds]).toEqual(["a"]);
  });

  it("copes with events about activities that no longer exist, and with none at all", () => {
    expect(mem([ev("x", "completed", 1, { activity_id: null, outcome: "loved" })]).favouriteIds.size).toBe(0);
    expect(mem([]).rejectionPenalty.size).toBe(0);
  });
});
