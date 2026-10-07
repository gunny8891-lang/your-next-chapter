import { describe, expect, it } from "vitest";
import { selectBalanced } from "@/lib/opportunities/engine";

const item = (category: string, rank: number) => ({ category, rank });

describe("selectBalanced", () => {
  it("lets every category in even when one dominates the ranking", () => {
    const ranked = [...Array.from({ length: 20 }, (_, i) => item("Joy", i)), item("Move", 20), item("Learn", 21)];
    const picked = selectBalanced(ranked, 8, 2);
    expect(picked).toHaveLength(8);
    expect(picked.some((x) => x.category === "Move")).toBe(true);
    expect(picked.some((x) => x.category === "Learn")).toBe(true);
  });

  it("keeps the original rank order", () => {
    const ranked = [item("Joy", 0), item("Joy", 1), item("Move", 2), item("Joy", 3), item("Learn", 4)];
    const picked = selectBalanced(ranked, 4, 1);
    const ranks = picked.map((x) => x.rank);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });

  it("returns a short list whole", () => {
    expect(selectBalanced([item("Joy", 0), item("Move", 1)], 8, 2)).toHaveLength(2);
  });

  it("never exceeds the limit, even if the per-category floors would", () => {
    const ranked = ["A", "B", "C", "D", "E"].flatMap((c) => [item(c, 0), item(c, 1), item(c, 2)]);
    expect(selectBalanced(ranked, 6, 3)).toHaveLength(6);
  });
});

describe("fetchRankedOpportunities reads tags in one vocabulary", () => {
  /** A stand-in database: every table answers with canned rows, whatever the filters. */
  function fakeDb(tables: Record<string, unknown[]>) {
    return {
      from(table: string) {
        const rows = tables[table] ?? [];
        const chain: Record<string, unknown> = {};
        for (const method of ["select", "eq", "in", "not", "gte", "order", "limit"]) chain[method] = () => chain;
        chain.maybeSingle = () => Promise.resolve({ data: (rows as unknown[])[0] ?? null, error: null });
        chain.then = (resolve: (v: unknown) => void) => resolve({ data: rows, error: null });
        return chain;
      },
    } as never;
  }

  it("fixes the spelling of tags on the way out, without needing the stored rows changed", async () => {
    const { fetchRankedOpportunities } = await import("@/lib/opportunities/engine");
    const row = {
      id: "a1", title: "Osterley Park", description: null, category: "Explore", address: null, price_estimate: 0, rating: null,
      accessibility_notes: null, location_lat: null, location_lng: null, booking_url: null, date_time: null, expires_at: null,
      recurrence_rule: null, duration_minutes: null, tags: ["National Trust", "garden", "walk"],
    };
    const db = fakeDb({ member_profiles: [{ location_lat: null, location_lng: null, travel_radius_km: null, interests: [] }], activities: [row] });
    const { candidates } = await fetchRankedOpportunities(db, "member-1");
    expect(candidates).toHaveLength(1);
    expect(candidates[0].tags).toEqual(["national-trust", "gardens", "walking"]);
  });
});
