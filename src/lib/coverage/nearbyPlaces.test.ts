import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AREA_LEARNING_MESSAGE, countNearbyPlaces, isThinArea, NEARBY_KM, THIN_AREA_PLACES } from "@/lib/coverage/nearbyPlaces";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("whether an area is still being learned", () => {
  it("is when there are fewer places nearby than a town would have", () => {
    expect(isThinArea(0)).toBe(true);
    expect(isThinArea(THIN_AREA_PLACES - 1)).toBe(true);
    expect(isThinArea(THIN_AREA_PLACES)).toBe(false);
    expect(isThinArea(400)).toBe(false);
  });

  it("is never claimed when the places could not be counted", () => {
    expect(isThinArea(null)).toBe(false);
  });

  it("is said kindly, and promises only what happens: more places, every night", () => {
    expect(AREA_LEARNING_MESSAGE).toMatch(/still getting to know/);
    expect(AREA_LEARNING_MESSAGE).toMatch(/every night/);
    expect(AREA_LEARNING_MESSAGE).not.toMatch(/error|sorry|failed/i);
  });
});

describe("counting the places near a member", () => {
  const client = (result: { count: number | null; error: { message: string } | null }, seen: Record<string, unknown>[] = []) => {
    const builder: Record<string, unknown> = {};
    const chain = (name: string) => (...args: unknown[]) => {
      seen.push({ [name]: args });
      return builder;
    };
    for (const name of ["eq", "gte", "lte"]) builder[name] = chain(name);
    builder.then = (resolve: (v: unknown) => unknown) => resolve(result);
    return { from: () => ({ select: (...args: unknown[]) => (seen.push({ select: args }), builder) }) } as unknown as SupabaseClient;
  };

  it("asks only for active places inside a box around them, counting without fetching the rows", async () => {
    const seen: Record<string, unknown>[] = [];
    const n = await countNearbyPlaces(client({ count: 12, error: null }, seen), 51.9, -0.2);
    expect(n).toBe(12);
    expect(seen[0]).toEqual({ select: ["id", { count: "exact", head: true }] });
    expect(seen).toContainEqual({ eq: ["status", "active"] });
    const lat = seen.filter((s) => "gte" in s || "lte" in s).map((s) => Object.values(s)[0] as [string, number]);
    const latMin = lat.find((a) => a[0] === "location_lat" && a[1] < 51.9)![1];
    // About NEARBY_KM either side: a degree of latitude is about 111 km.
    expect(51.9 - latMin).toBeCloseTo(NEARBY_KM / 111, 3);
  });

  it("gives nothing for a member with no position, without asking", async () => {
    expect(await countNearbyPlaces(client({ count: 5, error: null }), null, null)).toBeNull();
    expect(await countNearbyPlaces(client({ count: 5, error: null }), 51.9, null)).toBeNull();
  });

  it("gives nothing, rather than zero, when the count fails", async () => {
    expect(await countNearbyPlaces(client({ count: null, error: { message: "boom" } }), 51.9, -0.2)).toBeNull();
  });
});

describe("where the note is shown", () => {
  it("is on Today and Explore, from the same count and the same rule", () => {
    for (const page of ["src/app/today/page.tsx", "src/app/explore/page.tsx"]) {
      const source = read(page);
      expect(source).toContain("countNearbyPlaces(");
      expect(source).toContain("learningArea={isThinArea(nearbyPlaces)}");
    }
    expect(read("src/components/TodayView.tsx")).toContain("{learningArea && <AreaLearningNote />}");
    expect(read("src/components/ExploreView.tsx")).toContain("{learningArea && <AreaLearningNote />}");
  });
});

describe("My Week before there is a plan", () => {
  it("says when it is the area that is still being learned, and only counts the places then", () => {
    const page = read("src/app/week/page.tsx");
    expect(page).toContain("isDemo && isThinArea(await countNearbyPlaces(");
    expect(page).toContain("learningArea={learningArea}");
    const view = read("src/components/ThisWeekView.tsx");
    expect(view).toContain("We're still finding places near you");
    expect(view).toContain("Plan your own and it will be chosen around you.");
  });
});
