import { describe, expect, it } from "vitest";
import { buildFallbackItinerary } from "@/lib/itinerary/fallback";
import { validateGeneratedItinerary } from "@/lib/itinerary/schema";
import type { AffinityScores } from "@/lib/memory/scoring";

const affinity = (over: Partial<AffinityScores> = {}): AffinityScores => ({ categoryScores: {}, tagScores: {}, activityScores: {}, recentCategoryCounts: {}, ...over }) as AffinityScores;
const NO_HISTORY = affinity();

let n = 0;
const place = (category: string, over: Partial<{ id: string; title: string; rating: number | null; recurrence_rule: string | null; tags: string[] }> = {}) => ({
  id: over.id ?? `a-${++n}`,
  title: over.title ?? `Place ${n}`,
  category,
  tags: over.tags ?? [],
  rating: over.rating ?? null,
  recurrence_rule: over.recurrence_rule ?? null,
});

const CATEGORIES = ["Move", "Connect", "Learn", "Explore", "Give Back", "Wellness", "Joy"];
/** A town's worth: several of each of a few kinds, as a real area has. */
const town = () => [
  ...["Joy", "Joy", "Joy", "Joy", "Explore", "Explore", "Move", "Move", "Learn", "Connect"].map((c) => place(c)),
];

describe("the week built without the planner", () => {
  it("has five to seven things, as a week the planner would also be allowed to give", () => {
    const { items } = buildFallbackItinerary(town(), NO_HISTORY);
    expect(items.length).toBeGreaterThanOrEqual(5);
    expect(items.length).toBeLessThanOrEqual(7);
  });

  it("passes the same rules the planner's own answer has to pass", () => {
    const candidates = town();
    const result = buildFallbackItinerary(candidates, NO_HISTORY);
    const checked = validateGeneratedItinerary({ items: result.items }, candidates);
    expect(checked.ok, checked.ok ? "" : checked.error).toBe(true);
  });

  it("is not four items, as it was when a town had only four kinds of thing: it takes a second of a kind", () => {
    const fourKinds = ["Move", "Move", "Move", "Learn", "Learn", "Explore", "Explore", "Joy", "Joy"].map((c) => place(c));
    const { items } = buildFallbackItinerary(fourKinds, NO_HISTORY);
    expect(items.length).toBeGreaterThanOrEqual(5);
  });

  it("never has more than two of a kind", () => {
    const lopsided = Array.from({ length: 12 }, () => place("Joy"));
    const { items } = buildFallbackItinerary(lopsided, NO_HISTORY);
    expect(items.length).toBe(2);
  });

  it("has as many different kinds as there are, best first", () => {
    const candidates = [place("Joy", { rating: 5 }), place("Joy", { rating: 5 }), place("Move", { rating: 3 }), place("Learn", { rating: 2 }), place("Explore", { rating: 1 })];
    const { items } = buildFallbackItinerary(candidates, NO_HISTORY);
    const kinds = new Set(items.map((i) => candidates.find((c) => c.id === i.activity_id)!.category));
    expect(kinds.size).toBe(4);
  });

  it("uses what the member has enjoyed to decide which comes first", () => {
    const liked = place("Wellness", { id: "liked" });
    const others = CATEGORIES.filter((c) => c !== "Wellness").map((c) => place(c));
    const likes = affinity({ activityScores: { liked: 10 } });
    const { items } = buildFallbackItinerary([...others, liked], likes);
    expect(items.some((i) => i.activity_id === "liked")).toBe(true);
  });

  it("spreads the week out: different days, with mornings and afternoons mixed, and no evenings it has no reason for", () => {
    const { items } = buildFallbackItinerary(town(), NO_HISTORY);
    expect(new Set(items.map((i) => i.day)).size).toBe(items.length);
    expect(new Set(items.map((i) => i.slot)).size).toBeGreaterThan(1);
    expect(items.some((i) => i.slot === "evening")).toBe(false);
  });

  it("puts something that only meets on a Thursday on the Thursday, in the part of the day it starts", () => {
    const group = place("Connect", { id: "thursday-group", recurrence_rule: "Th 14:00-16:00" });
    const { items } = buildFallbackItinerary([...town(), group], affinity({ categoryScores: { Connect: 10 } }));
    const item = items.find((i) => i.activity_id === "thursday-group")!;
    expect(item.day).toBe("Thu");
    expect(item.slot).toBe("afternoon");
  });

  it("never puts two things in one place in the week", () => {
    const meetsMonday = (id: string) => place("Move", { id, recurrence_rule: "Mo 10:00-11:00" });
    const { items } = buildFallbackItinerary([meetsMonday("m1"), meetsMonday("m2"), ...town()], NO_HISTORY);
    const spots = items.map((i) => `${i.day}|${i.slot}`);
    expect(new Set(spots).size).toBe(spots.length);
  });

  it("reads Monday first, as a person would", () => {
    const { items } = buildFallbackItinerary(town(), NO_HISTORY);
    const days = items.map((i) => ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(i.day));
    expect(days).toEqual([...days].sort((a, b) => a - b));
  });

  it("makes the same week from the same places, every time", () => {
    const candidates = town();
    expect(buildFallbackItinerary(candidates, NO_HISTORY)).toEqual(buildFallbackItinerary(candidates, NO_HISTORY));
  });

  it("gives what there is when there is little, and nothing when there is nothing", () => {
    expect(buildFallbackItinerary([place("Joy"), place("Move")], NO_HISTORY).items).toHaveLength(2);
    expect(buildFallbackItinerary([], NO_HISTORY).items).toEqual([]);
  });

  it("says nothing it cannot stand behind", () => {
    const { items } = buildFallbackItinerary(town(), NO_HISTORY);
    for (const item of items) {
      expect(item.rationale).not.toMatch(/fine-tune|personalised|AI|model/i);
      expect(item.rationale.length).toBeGreaterThan(20);
    }
  });
});
