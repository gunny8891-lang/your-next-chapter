import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { mergeDuplicateVenues, planMerges, richness, sameVenue, type VenueRow } from "@/lib/discovery/duplicates";

let counter = 0;
const row = (overrides: Partial<VenueRow>): VenueRow => ({
  id: `id-${++counter}`,
  title: "Fairlands Valley Park",
  location_lat: 51.8992,
  location_lng: -0.1749,
  date_time: null,
  status: "active",
  tags: [],
  booking_url: "https://www.openstreetmap.org/way/1",
  recurrence_rule: null,
  description: null,
  admin_notes: "Place data from OpenStreetMap (© OpenStreetMap contributors, ODbL)",
  source: "discovery_agent",
  created_at: "2026-10-01T00:00:00Z",
  ...overrides,
});

// The two entries Stevenage really had: the council page's point, and the map's, about 400 m apart in a big park.
const FROM_SEARCH = row({ id: "search", booking_url: "https://www.stevenage.gov.uk/parks/fairlands", admin_notes: "Auto-discovered by Claude web search", description: "A large park with a lake, sailing and walks." });
const FROM_MAP = row({ id: "map", location_lat: 51.9015, location_lng: -0.1795 });

describe("the same place found by two sources", () => {
  it("is one place: the same name, close together, a few hundred metres apart in a big park", () => {
    expect(sameVenue(FROM_SEARCH, FROM_MAP)).toBe(true);
  });

  it("ignores capitals, punctuation and 'the' in a name", () => {
    expect(sameVenue(row({ title: "The Fairlands Valley Park" }), row({ title: "fairlands valley park!" }))).toBe(true);
  });

  it("is not one place when the names differ, or they are far apart", () => {
    expect(sameVenue(row({ title: "Fairlands Park" }), row({ title: "Fairlands Valley Park" }))).toBe(false);
    expect(sameVenue(row({}), row({ location_lat: 51.95 }))).toBe(false);
  });

  it("is never a dated session: the same title on two days is correct", () => {
    expect(sameVenue(row({ date_time: "2026-10-10T10:00:00Z" }), row({ date_time: "2026-10-17T10:00:00Z" }))).toBe(false);
  });

  it("is stricter for a café or pub: the same name 1 km apart is two places, within 400 m is one", () => {
    const cafe = (id: string, lat: number) => row({ id, title: "Church Farm Cafe", tags: ["food-venue"], location_lat: lat, location_lng: -0.1 });
    expect(sameVenue(cafe("a", 51.9), cafe("b", 51.9100))).toBe(false); // about 1.1 km
    expect(sameVenue(cafe("a", 51.9), cafe("b", 51.9020))).toBe(true); // about 220 m
  });

  it("treats chain branches as separate unless they are within 50 metres", () => {
    const costa = (id: string, lat: number) => row({ id, title: "Costa", tags: ["food-venue", "chain"], location_lat: lat, location_lng: -0.2 });
    expect(sameVenue(costa("a", 51.9025), costa("b", 51.8926))).toBe(false);
    expect(sameVenue(costa("a", 51.9025), costa("b", 51.9027))).toBe(true);
  });
});

describe("which entry is kept", () => {
  it("is the one that says more: the venue's own page, opening hours, a description", () => {
    expect(richness(FROM_SEARCH)).toBeGreaterThan(richness(FROM_MAP));
    const plans = planMerges([FROM_MAP, FROM_SEARCH]);
    expect(plans).toEqual([{ keepId: "search", dropIds: ["map"], upgradeUrl: null, carry: {} }]);
  });

  it("is a hand-curated entry before one found by search or on the map", () => {
    const curated = row({ id: "curated", source: "manual", admin_notes: "Curated from the venue's own site", booking_url: "https://venue.example/" });
    expect(planMerges([FROM_SEARCH, curated])[0].keepId).toBe("curated");
  });

  it("takes the venue's own page for the entry kept when it only had a map listing", () => {
    const mapRich = row({ id: "map", recurrence_rule: "Mo-Su 09:00-17:00", description: "A park. ".repeat(40) });
    const officialOnly = row({ id: "official", booking_url: "https://venue.example/", admin_notes: null, location_lat: 51.9001 });
    const [plan] = planMerges([mapRich, officialOnly]);
    expect(plan.keepId).toBe(richness(mapRich) >= richness(officialOnly) ? "map" : "official");
    if (plan.keepId === "map") expect(plan.upgradeUrl).toBe("https://venue.example/");
  });

  it("is the earlier one when they say the same", () => {
    const a = row({ id: "a", created_at: "2026-09-01T00:00:00Z" });
    const b = row({ id: "b", created_at: "2026-10-01T00:00:00Z", location_lat: 51.8995 });
    expect(planMerges([b, a])[0]).toMatchObject({ keepId: "a", dropIds: ["b"] });
  });

  it("merges three of one place into one, however the pairs are found", () => {
    const a = row({ id: "a", location_lat: 51.8992 });
    const b = row({ id: "b", location_lat: 51.9050 });
    const c = row({ id: "c", location_lat: 51.9100 }); // far from a, but close to b
    const [plan] = planMerges([a, b, c]);
    expect(plan.dropIds.length + 1).toBe(3);
  });

  it("leaves everything alone when there are no duplicates, and ignores what is not active", () => {
    expect(planMerges([row({ title: "A" }), row({ title: "B" })])).toEqual([]);
    expect(planMerges([row({ status: "removed" }), row({})])).toEqual([]);
  });
});

describe("merging in the catalogue", () => {
  it("marks the extra entries removed with a note, never deleting them, and counts them", async () => {
    const updates: { id: string; values: Record<string, unknown> }[] = [];
    const rows = [FROM_SEARCH, FROM_MAP];
    const admin = {
      from: () => ({
        select: () => ({ eq: () => ({ is: () => ({ not: () => ({ limit: async () => ({ data: rows, error: null }) }) }) }) }),
        update: (values: Record<string, unknown>) => ({
          eq: async (_column: string, id: string) => {
            updates.push({ id, values });
            return { error: null };
          },
        }),
      }),
    } as unknown as SupabaseClient;
    const result = await mergeDuplicateVenues(admin);
    expect(result).toEqual({ merged: 1, error: null });
    expect(updates).toHaveLength(1);
    expect(updates[0].id).toBe("map");
    expect(updates[0].values.status).toBe("removed");
    expect(String(updates[0].values.admin_notes)).toContain("Merged into");
    expect(String(updates[0].values.admin_notes)).toContain("Fairlands Valley Park");
  });

  it("reports a failed read rather than carrying on as if there were nothing to merge", async () => {
    const admin = { from: () => ({ select: () => ({ eq: () => ({ is: () => ({ not: () => ({ limit: async () => ({ data: null, error: { message: "boom" } }) }) }) }) }) }) } as unknown as SupabaseClient;
    expect(await mergeDuplicateVenues(admin)).toEqual({ merged: 0, error: "boom" });
  });
});

describe("where it runs", () => {
  it("is part of the nightly job, and happens before a new member's first week is rebuilt", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    expect(readFileSync(join(process.cwd(), "src/app/api/discovery/run/route.ts"), "utf8")).toContain("mergeDuplicateVenues(admin)");
    const regional = readFileSync(join(process.cwd(), "src/lib/discovery/regional.ts"), "utf8");
    expect(regional.indexOf("mergeDuplicates ?? mergeDuplicateVenues")).toBeLessThan(regional.indexOf("rebuildWeek ?? generateAndSaveItinerary"));
  });
});

describe("what is kept when entries are merged", () => {
  const dogFriendly = { dog_access: "allowed", dog_confidence: "reported", dog_source: "OpenStreetMap contributors (dog=yes)" };

  it("copies what the dropped entry knew about dogs onto the kept one, as happened to Fairlands", () => {
    const keep = row({ id: "keep", booking_url: "https://council.example/", admin_notes: "Auto-discovered by Claude web search", description: "A large park." });
    const dropped = row({ id: "dropped", location_lat: 51.9015, location_lng: -0.1795, ...dogFriendly });
    const [plan] = planMerges([keep, dropped]);
    expect(plan.keepId).toBe("keep");
    expect(plan.carry).toEqual({ dog_access: "allowed", dog_confidence: "reported", dog_source: "OpenStreetMap contributors (dog=yes)" });
  });

  it("copies opening hours and access notes the kept entry lacks", () => {
    const keep = row({ id: "keep", booking_url: "https://council.example/", admin_notes: "Curated", source: "manual" });
    const dropped = row({ id: "dropped", recurrence_rule: "Mo-Su 08:00-18:00", accessibility_notes: "Step-free", location_lat: 51.8995 });
    expect(planMerges([keep, dropped])[0].carry).toEqual({ recurrence_rule: "Mo-Su 08:00-18:00", accessibility_notes: "Step-free" });
  });

  it("never overwrites what the kept entry already knows", () => {
    const keep = row({ id: "keep", booking_url: "https://council.example/", admin_notes: "Curated", source: "manual", dog_access: "not_allowed", recurrence_rule: "Mo-Fr 09:00-17:00" });
    const dropped = row({ id: "dropped", location_lat: 51.8995, recurrence_rule: "Mo-Su 08:00-18:00", ...dogFriendly });
    expect(planMerges([keep, dropped])[0].carry).toEqual({});
  });

  it("is written to the kept entry in the catalogue", async () => {
    const keeperUpdates: Record<string, unknown>[] = [];
    const rows = [row({ id: "keep", booking_url: "https://council.example/", admin_notes: "Auto-discovered", description: "A large park." }), row({ id: "dropped", location_lat: 51.9015, location_lng: -0.1795, ...dogFriendly })];
    const admin = {
      from: () => ({
        select: () => ({ eq: () => ({ is: () => ({ not: () => ({ limit: async () => ({ data: rows, error: null }) }) }) }) }),
        update: (values: Record<string, unknown>) => ({
          eq: async (_c: string, id: string) => {
            if (id === "keep") keeperUpdates.push(values);
            return { error: null };
          },
        }),
      }),
    } as unknown as SupabaseClient;
    await mergeDuplicateVenues(admin);
    expect(keeperUpdates).toEqual([{ dog_access: "allowed", dog_confidence: "reported", dog_source: "OpenStreetMap contributors (dog=yes)" }]);
  });
});

describe("a name with more said", () => {
  const at = (title: string, lat: number, extra: Partial<VenueRow> = {}) => row({ title, location_lat: lat, location_lng: -0.21, address: "Stevenage Leisure Park, Six Hills Way, Stevenage", ...extra });

  it("is the same place when the longer name only adds the town, on the same spot (the map's 'Hollywood Bowl' and the venue's own 'Hollywood Bowl Stevenage')", () => {
    expect(sameVenue(at("Hollywood Bowl", 51.901), at("Hollywood Bowl Stevenage", 51.9011))).toBe(true);
  });

  it("is not the same place when only the first word is shared", () => {
    expect(sameVenue(at("Marriotts Sports Center", 51.9054), at("Marriotts Gymnastics", 51.9057))).toBe(false);
    expect(sameVenue(at("Fairlands Valley Park", 51.8992), at("Fairlands Valley Sailing Centre", 51.8993))).toBe(false);
  });

  it("is not the same place when the longer name adds something that is not the town: a farm and its café", () => {
    expect(sameVenue(at("Church Farm", 51.9272), at("Church Farm Cafe", 51.9273))).toBe(false);
  });

  it("is never a class held in a park, which once merged a park and six classes into one entry", () => {
    const park = at("Hampson Park", 51.9101, { address: "Hampson Park, Stevenage" });
    const zumba = at("Zumba Gold – Hampson Park", 51.9101, { address: "Hampson Park Community Centre, Webb Rise, Stevenage" });
    const chairYoga = at("Chair Yoga – Hampson Park Community Centre", 51.9102, { address: "Hampson Park Community Centre, Webb Rise, Stevenage" });
    expect(sameVenue(park, zumba)).toBe(false);
    expect(sameVenue(zumba, chairYoga)).toBe(false);
    expect(planMerges([park, zumba, chairYoga, at("Positive Movement – Hampson Park", 51.9101, { address: "Hampson Park Community Centre, Stevenage" })])).toEqual([]);
  });

  it("is not the same place when they are far apart, or the shorter name is too short to mean anything", () => {
    expect(sameVenue(at("Hollywood Bowl", 51.901), at("Hollywood Bowl Stevenage", 51.95))).toBe(false);
    expect(sameVenue(at("The Bull", 51.901), at("The Bull Inn", 51.9011))).toBe(false);
  });

  it("keeps the venue's own page and merges away the map's entry", () => {
    const map = at("Hollywood Bowl", 51.901, { id: "map" });
    const own = at("Hollywood Bowl Stevenage", 51.9011, { id: "own", booking_url: "https://www.hollywoodbowl.co.uk/stevenage", admin_notes: "Auto-discovered by Claude web search (indoor entertainment)", description: "Ten-pin bowling centre with 28 lanes at Stevenage Leisure Park, suitable for families." });
    expect(planMerges([map, own])).toEqual([{ keepId: "own", dropIds: ["map"], upgradeUrl: null, carry: {} }]);
  });
});
