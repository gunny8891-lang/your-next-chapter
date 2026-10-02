import { describe, expect, it } from "vitest";
import { memberAreas } from "@/lib/discovery/areas";

const at = (lat: number, lng: number, km: number | null = 10) => ({ location_lat: lat, location_lng: lng, travel_radius_km: km });
const none = { location_lat: null, location_lng: null, travel_radius_km: 10 };

describe("memberAreas", () => {
  it("gives one area per place members live, not one per member", () => {
    const areas = memberAreas([at(51.653, -0.2), at(51.66, -0.19), at(51.646, -0.205)]);
    expect(areas).toHaveLength(1);
  });

  it("never splits neighbours just because they sit either side of a grid line", () => {
    // ~1 km apart, straddling 51.65 — a fixed grid would have made two areas.
    expect(memberAreas([at(51.649, -0.2), at(51.652, -0.2)])).toHaveLength(1);
  });

  it("keeps distant members apart", () => {
    expect(memberAreas([at(51.653, -0.2), at(51.46, -0.3), at(53.48, -2.24)])).toHaveLength(3);
  });

  it("ignores members whose location isn't resolved", () => {
    expect(memberAreas([none, none])).toEqual([]);
    expect(memberAreas([none, at(51.65, -0.2)])).toHaveLength(1);
  });

  it("centres an area on its members", () => {
    const [area] = memberAreas([at(51.64, -0.2), at(51.66, -0.2)]);
    expect(area.lat).toBeCloseTo(51.65, 5);
  });

  it("reaches as far as the most-travelling member in the area is willing to go", () => {
    const [area] = memberAreas([at(51.65, -0.2, 8), at(51.65, -0.2, 32)]);
    expect(area.radiusMiles).toBe(20); // 32 km ≈ 20 miles
  });

  it("keeps the radius sensible at both extremes, and when none is set", () => {
    expect(memberAreas([at(51.65, -0.2, 1)])[0].radiusMiles).toBe(5);
    expect(memberAreas([at(51.65, -0.2, 500)])[0].radiusMiles).toBe(25);
    expect(memberAreas([at(51.65, -0.2, null)])[0].radiusMiles).toBe(15);
  });

  it("does the busiest areas first, and caps how many", () => {
    const profiles = [at(51.65, -0.2), at(51.46, -0.3), at(51.46, -0.3), at(53.48, -2.24)];
    const areas = memberAreas(profiles, 2);
    expect(areas).toHaveLength(2);
    expect(areas[0].lat).toBeCloseTo(51.46, 2); // two members
  });
});
