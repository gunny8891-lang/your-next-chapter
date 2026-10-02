import { describe, expect, it } from "vitest";
import { filterByDistance } from "@/lib/geo/filterByDistance";

const BARNET = { location_lat: 51.65309, location_lng: -0.2002261, travel_radius_km: 10 };
const near = { id: "near", location_lat: 51.6528, location_lng: -0.201 };
const far = { id: "far", location_lat: 51.4613, location_lng: -0.3037 }; // Richmond, ~23 km
const unlocated = { id: "unlocated", location_lat: null, location_lng: null };

describe("filterByDistance", () => {
  it("keeps what is inside the travel radius and drops what is outside", () => {
    expect(filterByDistance([near, far], BARNET).map((a) => a.id)).toEqual(["near"]);
  });

  it("drops an activity with no coordinates once the member's location is known", () => {
    expect(filterByDistance([near, unlocated], BARNET).map((a) => a.id)).toEqual(["near"]);
  });

  it("does not filter at all when the member's location or radius is unknown", () => {
    const all = [near, far, unlocated];
    expect(filterByDistance(all, { location_lat: null, location_lng: null, travel_radius_km: 10 })).toHaveLength(3);
    expect(filterByDistance(all, { ...BARNET, travel_radius_km: null })).toHaveLength(3);
  });
});
