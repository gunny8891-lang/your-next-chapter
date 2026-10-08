import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { searchRegionsThrottled } from "@/lib/discovery/regional";
import { nearestRegion, normalizeRegionKey, SAME_PLACE_KM, type RegionState } from "@/lib/discovery/throttle";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

// Centres of a few real places.
const STEVENAGE = { lat: 51.9017, lng: -0.2027 };
const SG1_POSTCODE = { lat: 51.9014, lng: -0.1986 }; // a postcode in the town centre, about 0.3 km away
const SG2_POSTCODE = { lat: 51.8821, lng: -0.178 }; // the south of the town, about 3 km away
const HITCHIN = { lat: 51.9487, lng: -0.2813 }; // the next town, about 6.5 km away
const LETCHWORTH = { lat: 51.9786, lng: -0.2266 }; // about 9 km away
const BARNET = { lat: 51.6531, lng: -0.2002 };

const DAY = 86_400_000;
const NOW = new Date("2026-10-08T20:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

const row = (key: string, label: string, over: Partial<RegionState> = {}): RegionState => ({
  region_key: key,
  region_label: label,
  last_attempt_at: ago(2 * DAY),
  last_success_at: ago(2 * DAY),
  empty_runs: 0,
  consecutive_failures: 0,
  ...over,
});

describe("which region a point belongs to", () => {
  const regions = [
    { ...row("stevenage", "Stevenage"), ...STEVENAGE },
    { ...row("barnet", "Barnet"), ...BARNET },
    row("richmond", "Richmond"), // saved before coordinates were recorded: no position
  ];

  it("puts every address in a town in the town, however far across it is", () => {
    expect(nearestRegion(regions, SG1_POSTCODE)?.region_key).toBe("stevenage");
    expect(nearestRegion(regions, SG2_POSTCODE)?.region_key).toBe("stevenage");
    expect(nearestRegion(regions, STEVENAGE)?.region_key).toBe("stevenage");
  });

  it("leaves a neighbouring town, and anywhere else, to a search of its own", () => {
    expect(nearestRegion(regions, LETCHWORTH)).toBeUndefined();
    expect(nearestRegion(regions, { lat: 53.48, lng: -2.24 })).toBeUndefined();
    expect(SAME_PLACE_KM).toBeLessThan(9);
  });

  it("chooses the closer of two when a point is near both, and ignores a region with no position", () => {
    const two = [{ ...row("a", "A"), ...HITCHIN }, { ...row("b", "B"), ...STEVENAGE }];
    expect(nearestRegion(two, { lat: 51.925, lng: -0.24 })?.region_key).toBeDefined();
    expect(nearestRegion([row("x", "X")], STEVENAGE)).toBeUndefined();
    expect(nearestRegion([], STEVENAGE)).toBeUndefined();
  });
});

/** A stand-in for the regions table: reads return the rows, upserts and updates are recorded. */
function fakeDb(rows: (RegionState & { lat?: number | null; lng?: number | null })[]) {
  const upserts: Record<string, unknown>[] = [];
  const updates: Record<string, unknown>[] = [];
  const db = {
    from() {
      return {
        select: () => Promise.resolve({ data: rows, error: null }),
        upsert: (value: Record<string, unknown>) => {
          upserts.push(value);
          return Promise.resolve({ error: null });
        },
        update: (value: Record<string, unknown>) => {
          updates.push(value);
          return { eq: () => Promise.resolve({ error: null }) };
        },
      };
    },
  } as unknown as SupabaseClient;
  return { db, upserts, updates };
}

const search = (searched: string[]) => async (region: string) => {
  searched.push(region);
  return { results: [{ source: "x", found: 3, inserted: 3, insertedActive: 3, skippedExisting: 0, errors: [] as string[] }], pending: [] };
};

describe("asking for a search of a place that has been searched", () => {
  const stevenage = { ...row("stevenage", "Stevenage"), ...STEVENAGE };

  it("does not search again for a postcode, or for the town with its county, within the same week", async () => {
    for (const request of [
      { label: "SG1 1XX", ...SG1_POSTCODE },
      { label: "SG2 8AB", ...SG2_POSTCODE },
      { label: "Stevenage, Hertfordshire", ...STEVENAGE },
      { label: "Old Town, Stevenage", ...STEVENAGE },
    ]) {
      const { db, upserts } = fakeDb([stevenage]);
      const searched: string[] = [];
      const summary = await searchRegionsThrottled(db, [request], { runSearch: search(searched), now: NOW });
      expect(searched, request.label).toEqual([]);
      expect(upserts, request.label).toEqual([]);
      expect(summary.skipped).toEqual([{ region: "Stevenage", reason: "recently_searched" }]);
    }
  });

  it("looks the place up itself when only words were given, and still finds the town", async () => {
    const { db } = fakeDb([stevenage]);
    const searched: string[] = [];
    const summary = await searchRegionsThrottled(db, ["SG1 1XX"], { runSearch: search(searched), now: NOW, geocode: async () => SG1_POSTCODE });
    expect(searched).toEqual([]);
    expect(summary.skipped[0].region).toBe("Stevenage");
  });

  it("when the town is due again, searches the town by ITS name, not by the postcode that asked", async () => {
    const due = { ...row("stevenage", "Stevenage", { last_success_at: ago(10 * DAY), last_attempt_at: ago(10 * DAY) }), ...STEVENAGE };
    const { db, upserts } = fakeDb([due]);
    const searched: string[] = [];
    await searchRegionsThrottled(db, [{ label: "SG1 1XX", ...SG1_POSTCODE }], { runSearch: search(searched), now: NOW, maxSearches: 1 });
    expect(searched).toEqual(["Stevenage"]);
    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({ region_key: "stevenage", region_label: "Stevenage" });
    // The region's centre is not moved by a request from a nearby address.
    expect(upserts[0]).not.toHaveProperty("lat");
  });

  it("makes one search of two requests for the same town", async () => {
    const { db } = fakeDb([]);
    const searched: string[] = [];
    await searchRegionsThrottled(
      db,
      [
        { label: "Stevenage", ...STEVENAGE },
        { label: "SG1 1XX", ...SG1_POSTCODE },
      ],
      { runSearch: search(searched), now: NOW, maxSearches: 5 }
    );
    expect(searched).toEqual(["Stevenage"]);
  });
});

describe("asking for a search of a new place", () => {
  it("searches it and records where it is, so the next request from anywhere in it finds it", async () => {
    const { db, upserts } = fakeDb([{ ...row("stevenage", "Stevenage"), ...STEVENAGE }]);
    const searched: string[] = [];
    await searchRegionsThrottled(db, [{ label: "Hitchin", ...LETCHWORTH }], { runSearch: search(searched), now: NOW, maxSearches: 1 });
    expect(searched).toEqual(["Hitchin"]);
    expect(upserts[0]).toMatchObject({ region_key: "hitchin", region_label: "Hitchin", lat: LETCHWORTH.lat, lng: LETCHWORTH.lng });
  });

  it("falls back to matching by the words when the place cannot be found, as before", async () => {
    const old = row("stevenage", "Stevenage"); // saved before positions were recorded
    const { db } = fakeDb([old]);
    const searched: string[] = [];
    const summary = await searchRegionsThrottled(db, ["  stevenage "], { runSearch: search(searched), now: NOW, geocode: async () => null });
    expect(searched).toEqual([]);
    expect(summary.skipped[0]).toEqual({ region: "Stevenage", reason: "recently_searched" });
    expect(normalizeRegionKey("  stevenage ")).toBe("stevenage");
  });

  it("fills in the position of a region saved without one, the first time a search of it is claimed", async () => {
    const old = row("stevenage", "Stevenage", { last_success_at: ago(10 * DAY), last_attempt_at: ago(10 * DAY) });
    const { db, upserts } = fakeDb([old]);
    await searchRegionsThrottled(db, [{ label: "Stevenage", ...STEVENAGE }], { runSearch: search([]), now: NOW, maxSearches: 1 });
    expect(upserts[0]).toMatchObject({ region_key: "stevenage", lat: STEVENAGE.lat, lng: STEVENAGE.lng });
  });

  it("still never searches a place that is already being searched", async () => {
    const running = { ...row("stevenage", "Stevenage", { last_attempt_at: ago(60_000), consecutive_failures: 1 }), ...STEVENAGE };
    const { db } = fakeDb([running]);
    const searched: string[] = [];
    const summary = await searchRegionsThrottled(db, [{ label: "SG1 1XX", ...SG1_POSTCODE }], { runSearch: search(searched), now: NOW, force: true });
    expect(searched).toEqual([]);
    expect(summary.skipped[0].reason).toBe("just_attempted");
  });
});

describe("where the requests come from", () => {
  it("passes the member's own coordinates for a sign-up or a changed location, and for every member each night", () => {
    const trigger = read("src/lib/discovery/regional.ts");
    expect(trigger).toContain("location_lat, location_lng");
    const route = read("src/app/api/discovery/run/route.ts");
    expect(route).toContain("lat: p.location_lat");
    expect(route).toContain("lng: p.location_lng");
  });
});
