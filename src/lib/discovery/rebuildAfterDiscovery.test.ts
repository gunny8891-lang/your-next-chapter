import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { triggerDiscoveryForRegion, type TriggerDeps } from "@/lib/discovery/regional";

/** A client that only knows how to say where the member lives. */
const client = (home: { location_lat: number; location_lng: number } | null = { location_lat: 51.9, location_lng: -0.2 }) =>
  ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: home }) }) }) }) }) as unknown as SupabaseClient;

const searched = (insertedActive: number) => ({ searched: [{ insertedActive }] }) as never;

function deps(found: { search?: number; places?: number; events?: number; allowed?: boolean }, overrides: Partial<TriggerDeps> = {}) {
  const rebuildWeek = vi.fn(async () => ({ error: null }));
  const searchRegions = vi.fn(async () => searched(found.search ?? 0));
  const built: TriggerDeps = {
    searchAllowed: (async () => (found.allowed === false ? { allowed: false, reason: "member_daily" } : { allowed: true })) as never,
    searchRegions: searchRegions as never,
    ensurePlaces: (async () => ({ region: "x", status: "added", inserted: found.places ?? 0 })) as never,
    events: async () => found.events ?? 0,
    rebuildWeek: rebuildWeek as never,
    ...overrides,
  };
  return { built, rebuildWeek, searchRegions };
}

describe("a new member's first week, once their area's places have arrived", () => {
  it("is rebuilt when free places were found, so a first plan made before they existed is replaced", async () => {
    const { built, rebuildWeek } = deps({ places: 109 });
    await triggerDiscoveryForRegion(client(), "member-1", "Stevenage", built);
    expect(rebuildWeek).toHaveBeenCalledTimes(1);
    expect((rebuildWeek.mock.calls[0] as unknown[])[1]).toBe("member-1");
  });

  it("is rebuilt when only the paid search, or only events, found something", async () => {
    for (const found of [{ search: 12 }, { events: 4 }]) {
      const { built, rebuildWeek } = deps(found);
      await triggerDiscoveryForRegion(client(), "member-1", "Stevenage", built);
      expect(rebuildWeek).toHaveBeenCalledTimes(1);
    }
  });

  it("is left alone when nothing new arrived: the area was already known, and their week was made from it", async () => {
    const { built, rebuildWeek } = deps({});
    await triggerDiscoveryForRegion(client(), "member-1", "Barnet", built);
    expect(rebuildWeek).not.toHaveBeenCalled();
  });

  it("still gets the free places, and a rebuild, when the paid search is not allowed today", async () => {
    const { built, rebuildWeek, searchRegions } = deps({ places: 80, allowed: false });
    await triggerDiscoveryForRegion(client(), "member-1", "Stevenage", built);
    expect((searchRegions.mock.calls[0] as unknown[])[2]).toMatchObject({ maxSearches: 0 });
    expect(rebuildWeek).toHaveBeenCalledTimes(1);
  });

  it("searches where they live, so a postcode for a place already searched is not searched again", async () => {
    const { built, searchRegions } = deps({});
    await triggerDiscoveryForRegion(client({ location_lat: 51.9253, location_lng: -0.0895 }), "member-1", "SG11 1PX", built);
    expect((searchRegions.mock.calls[0] as unknown[])[1]).toEqual([{ label: "SG11 1PX", lat: 51.9253, lng: -0.0895 }]);
  });

  it("never throws, whatever fails: nothing is waiting on it, and the nightly job tries again", async () => {
    const { built } = deps({ places: 5 }, { rebuildWeek: (async () => { throw new Error("boom"); }) as never });
    await expect(triggerDiscoveryForRegion(client(), "member-1", "Stevenage", built)).resolves.toBeUndefined();
    const failing = deps({}, { ensurePlaces: (async () => { throw new Error("osm down"); }) as never });
    await expect(triggerDiscoveryForRegion(client(), "member-1", "Stevenage", failing.built)).resolves.toBeUndefined();
    expect(failing.rebuildWeek).not.toHaveBeenCalled();
  });
});
