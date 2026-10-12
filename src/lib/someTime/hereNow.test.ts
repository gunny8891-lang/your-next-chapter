import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseHere, parseTimeRequest } from "@/lib/someTime/request";
import { ensurePlacesNearHere, HERE_FEATURE } from "@/lib/discovery/hereNow";
import { filterByDistance } from "@/lib/geo/filterByDistance";
import { geolocationMessage, GEOLOCATION_UNSUPPORTED } from "@/lib/geo/hereMessages";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("a position from the device", () => {
  it("is kept, rounded to about a hundred metres, when it is somewhere in the UK", () => {
    expect(parseHere({ lat: 51.901734, lng: -0.202719 })).toEqual({ lat: 51.902, lng: -0.203 });
    expect(parseHere({ lat: 57.1497, lng: -2.0943 })).toEqual({ lat: 57.15, lng: -2.094 }); // Aberdeen
  });

  it("is ignored when it is not a place in the UK, or not numbers", () => {
    for (const bad of [{ lat: 48.85, lng: 2.35 }, { lat: 0, lng: 0 }, { lat: "51.9", lng: "-0.2" }, { lat: NaN, lng: -0.2 }, { lat: 51.9 }, null, "here", 42, undefined]) {
      expect(parseHere(bad), JSON.stringify(bad)).toBeNull();
    }
  });

  it("makes a request from here, and a request with nothing sensible is simply from home", () => {
    const base = { start: "now", duration: "1-2h", who: "just_me" };
    expect(parseTimeRequest({ ...base, here: { lat: 51.9, lng: -0.2 } })?.here).toEqual({ lat: 51.9, lng: -0.2 });
    const nonsense = parseTimeRequest({ ...base, here: { lat: 12, lng: 5 } });
    expect(nonsense).not.toBeNull();
    expect(nonsense?.here).toBeUndefined();
    expect(parseTimeRequest(base)?.here).toBeUndefined();
  });
});

describe("distance from where they are", () => {
  const places = [
    { id: "near-here", location_lat: 51.902, location_lng: -0.203 }, // Stevenage
    { id: "near-home", location_lat: 51.653, location_lng: -0.2 }, // Barnet
  ];

  it("measures from the position it is given, so the places near them are the ones found, not those near home", () => {
    const fromHere = filterByDistance(places, { location_lat: 51.9017, location_lng: -0.2027, travel_radius_km: 10 });
    expect(fromHere.map((p) => p.id)).toEqual(["near-here"]);
    const fromHome = filterByDistance(places, { location_lat: 51.653, location_lng: -0.2, travel_radius_km: 10 });
    expect(fromHome.map((p) => p.id)).toEqual(["near-home"]);
  });
});

describe("how it is wired", () => {
  it("measures from here in the engine and in the time options, when asked", () => {
    expect(read("src/lib/opportunities/engine.ts")).toMatch(/options\.origin\s*\?\s*\{ location_lat: options\.origin\.lat/);
    const recommend = read("src/lib/someTime/recommend.ts");
    expect(recommend).toContain("...(request.here ? { origin: request.here } : {})");
    expect(recommend).toContain("home: centre,");
  });

  it("never saves the position: it is not written anywhere, only used", () => {
    const actions = read("src/app/today/timeActions.ts");
    expect(actions).not.toMatch(/\.from\("member_profiles"\)\s*\.update/);
    const choice = read("src/components/HereChoice.tsx");
    expect(choice).not.toMatch(/localStorage|sessionStorage|document\.cookie/);
  });

  it("is on the time sheet and in Explore, and asked for only when tapped", () => {
    expect(read("src/components/TimeSheet.tsx")).toContain("<HereChoice here={here} onChange={setHere} />");
    expect(read("src/components/ExploreView.tsx")).toContain("<HereChoice");
    const choice = read("src/components/HereChoice.tsx");
    expect(choice).toContain("navigator.geolocation.getCurrentPosition");
    // Inside the tap handler, not on load.
    expect(choice.indexOf("const find = ()")).toBeLessThan(choice.indexOf("navigator.geolocation.getCurrentPosition"));
    expect(choice).not.toMatch(/useEffect/);
  });

  it("is told to the privacy notice", () => {
    expect(read("src/lib/legal/privacy.ts")).toContain("Near where I am now");
  });
});

describe("what is said when the device cannot say", () => {
  it("is a kind sentence for each reason, always ending with the way out: carry on from home", () => {
    for (const code of [1, 2, 3, null, undefined]) {
      const message = geolocationMessage(code);
      expect(message).toMatch(/from home/);
      expect(message).toMatch(/[.]$/);
    }
    expect(geolocationMessage(1)).toMatch(/allow location/);
    expect(geolocationMessage(3)).toMatch(/too long/);
    expect(GEOLOCATION_UNSUPPORTED).toMatch(/from home/);
  });
});

describe("learning the place they are in", () => {
  const NOW = new Date("2026-10-12T12:00:00Z");
  const here = { lat: 51.9, lng: -0.2 };

  const fakeAdmin = (recent: boolean) => {
    const inserts: Record<string, unknown>[] = [];
    const admin = {
      from: () => ({
        select: () => ({ eq: () => ({ eq: () => ({ gte: () => ({ limit: async () => ({ data: recent ? [{ id: "x" }] : [], error: null }) }) }) }) }),
        insert: async (row: Record<string, unknown>) => (inserts.push(row), { error: null }),
      }),
    } as unknown as SupabaseClient;
    return { admin, inserts };
  };

  it("fetches the free map layers for a place we know little about, and records that it did", async () => {
    const { admin, inserts } = fakeAdmin(false);
    const ensure = vi.fn(async () => ({ region: "this area", status: "added" as const, inserted: 80 }));
    const outcome = await ensurePlacesNearHere("m1", here, { admin, now: NOW, count: async () => 3, ensure: ensure as never });
    expect(outcome).toBe("fetched");
    expect(ensure).toHaveBeenCalledTimes(1);
    expect(inserts[0]).toMatchObject({ user_id: "m1", feature: HERE_FEATURE });
  });

  it("does nothing for a place that is already well known", async () => {
    const { admin } = fakeAdmin(false);
    const ensure = vi.fn();
    expect(await ensurePlacesNearHere("m1", here, { admin, now: NOW, count: async () => 120, ensure: ensure as never })).toBe("known");
    expect(ensure).not.toHaveBeenCalled();
  });

  it("does nothing when it could not be counted", async () => {
    const { admin } = fakeAdmin(false);
    const ensure = vi.fn();
    expect(await ensurePlacesNearHere("m1", here, { admin, now: NOW, count: async () => null, ensure: ensure as never })).toBe("known");
    expect(ensure).not.toHaveBeenCalled();
  });

  it("is limited to once a day for each member, however many places they ask from", async () => {
    const { admin } = fakeAdmin(true);
    const ensure = vi.fn();
    expect(await ensurePlacesNearHere("m1", here, { admin, now: NOW, count: async () => 3, ensure: ensure as never })).toBe("limited");
    expect(ensure).not.toHaveBeenCalled();
  });

  it("never throws, and says failed when the fetch did", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { admin } = fakeAdmin(false);
    const failing = vi.fn(async () => {
      throw new Error("map service down");
    });
    await expect(ensurePlacesNearHere("m1", here, { admin, now: NOW, count: async () => 3, ensure: failing as never })).resolves.toBe("failed");
    warn.mockRestore();
  });

  it("is started after the answer has gone, so asking is never slower for it", () => {
    const actions = read("src/app/today/timeActions.ts");
    expect(actions).toContain("after(() => ensurePlacesNearHere(user.id, here));");
  });
});
