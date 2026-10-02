import { describe, expect, it } from "vitest";
import { decideSearch, normalizeRegionKey, type RegionState } from "@/lib/discovery/throttle";

const NOW = new Date("2026-10-10T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

function state(overrides: Partial<RegionState> = {}): RegionState {
  return {
    region_key: "barnet",
    region_label: "Barnet",
    last_attempt_at: daysAgo(8),
    last_success_at: daysAgo(8),
    empty_runs: 0,
    consecutive_failures: 0,
    ...overrides,
  };
}

describe("normalizeRegionKey", () => {
  it("treats casing, spacing and a 'Near ' prefix as the same place", () => {
    expect(normalizeRegionKey("  Near  Barnet ")).toBe("barnet");
    expect(normalizeRegionKey("BARNET")).toBe("barnet");
    expect(normalizeRegionKey("Guildford,  Surrey")).toBe("guildford, surrey");
  });
});

describe("decideSearch", () => {
  it("searches a region never searched before", () => {
    expect(decideSearch(undefined, NOW)).toEqual({ due: true, reason: "never_searched" });
  });

  it("does not start a second search while one is in flight", () => {
    const result = decideSearch(state({ last_attempt_at: new Date(NOW.getTime() - 5 * 60 * 1000).toISOString() }), NOW);
    expect(result).toEqual({ due: false, reason: "just_attempted" });
  });

  it("waits a week before refreshing a region that keeps yielding results", () => {
    expect(decideSearch(state({ last_success_at: daysAgo(3), last_attempt_at: daysAgo(3) }), NOW).due).toBe(false);
    expect(decideSearch(state({ last_success_at: daysAgo(8), last_attempt_at: daysAgo(8) }), NOW)).toEqual({
      due: true,
      reason: "refresh_due",
    });
  });

  it("backs off 7 -> 14 -> 28 days when searches keep finding nothing new", () => {
    const at = (days: number, emptyRuns: number) =>
      decideSearch(state({ empty_runs: emptyRuns, last_success_at: daysAgo(days), last_attempt_at: daysAgo(days) }), NOW).due;
    expect(at(10, 1)).toBe(false);
    expect(at(15, 1)).toBe(true);
    expect(at(20, 2)).toBe(false);
    expect(at(29, 2)).toBe(true);
    // The backoff stops doubling after two empty runs.
    expect(at(29, 9)).toBe(true);
  });

  it("backs off 1, 2, 4 then 7 days after failures", () => {
    const at = (failures: number, days: number) =>
      decideSearch(state({ consecutive_failures: failures, last_attempt_at: daysAgo(days) }), NOW).due;
    expect(at(1, 0.5)).toBe(false);
    expect(at(1, 1.1)).toBe(true);
    expect(at(2, 1.5)).toBe(false);
    expect(at(2, 2.1)).toBe(true);
    expect(at(3, 3)).toBe(false);
    expect(at(3, 4.1)).toBe(true);
    expect(at(10, 6)).toBe(false);
    expect(at(10, 7.1)).toBe(true);
  });
});
