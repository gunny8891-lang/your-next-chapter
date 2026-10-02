import { describe, expect, it } from "vitest";
import { computeAffinity, scoreActivity, summarizeAffinity, type PreferenceSignalRow } from "@/lib/memory/scoring";

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

const signal = (signal_type: string, activity_id: string, category: string, tags: string[], created_at: string): PreferenceSignalRow => ({
  signal_type,
  activity_id,
  created_at,
  activities: { category, tags },
});

describe("computeAffinity", () => {
  it("rewards liked and penalises disliked signals, per category, tag and activity", () => {
    const a = computeAffinity([
      signal("liked", "a1", "Move", ["walking"], daysAgo(0)),
      signal("disliked", "a2", "Learn", ["talks"], daysAgo(0)),
    ]);
    expect(a.categoryScores.Move).toBeGreaterThan(0);
    expect(a.categoryScores.Learn).toBeLessThan(0);
    expect(a.tagScores.walking).toBeGreaterThan(0);
    expect(a.activityScores.a2).toBeLessThan(0);
  });

  it("weights older signals less, but never to nothing", () => {
    const fresh = computeAffinity([signal("liked", "a", "Move", [], daysAgo(0))]).categoryScores.Move;
    const old = computeAffinity([signal("liked", "a", "Move", [], daysAgo(27))]).categoryScores.Move;
    expect(old).toBeLessThan(fresh);
    expect(old).toBeGreaterThan(0);
  });
});

describe("scoreActivity", () => {
  it("ranks an activity the member already liked above an unknown one", () => {
    const affinity = computeAffinity([signal("liked", "liked-one", "Move", ["walking"], daysAgo(0))]);
    const liked = scoreActivity({ id: "liked-one", category: "Move", tags: ["walking"], rating: null }, affinity);
    const unknown = scoreActivity({ id: "other", category: "Joy", tags: [], rating: null }, affinity);
    expect(liked).toBeGreaterThan(unknown);
  });
});

describe("summarizeAffinity", () => {
  it("with no history, reports every category as a gap rather than inventing scores", () => {
    const summary = summarizeAffinity(computeAffinity([]));
    expect(summary).toMatch(/no recent activity/);
    expect(summary).toContain("Move");
    expect(summary).not.toMatch(/affinity scores/);
    // The "first week" fallback inside summarizeAffinity is unreachable: with no
    // signals every category counts as a gap, so the summary is never empty.
  });
});

describe("computeAffinity — feedback reasons", () => {
  it("counts too far and too expensive against that activity only, not its category or tags", () => {
    const a = computeAffinity([
      signal("too_far", "a1", "Move", ["walking"], daysAgo(0)),
      signal("too_expensive", "a2", "Joy", ["theatre"], daysAgo(0)),
    ]);
    expect(a.activityScores.a1).toBeLessThan(0);
    expect(a.activityScores.a2).toBeLessThan(0);
    expect(a.categoryScores.Move).toBeUndefined();
    expect(a.categoryScores.Joy).toBeUndefined();
    expect(a.tagScores.walking).toBeUndefined();
    expect(a.recentCategoryCounts.Move).toBeUndefined();
  });

  it("still lets a plain dislike or an already-seen-it count against the category", () => {
    const a = computeAffinity([
      signal("disliked", "a1", "Learn", ["talks"], daysAgo(0)),
      signal("too_similar", "a2", "Learn", ["talks"], daysAgo(0)),
    ]);
    expect(a.categoryScores.Learn).toBeLessThan(0);
    expect(a.tagScores.talks).toBeLessThan(0);
  });
});
