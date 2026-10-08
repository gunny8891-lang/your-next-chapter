import { describe, expect, it } from "vitest";
import { COVERED_RADIUS_KM, coverageBox, isCovered } from "@/lib/discovery/osmPlaces";

const inside = (box: ReturnType<typeof coverageBox>, p: { lat: number; lng: number }) =>
  p.lat >= box.latMin && p.lat <= box.latMax && p.lng >= box.lngMin && p.lng <= box.lngMax;

const STEVENAGE = { lat: 51.9017, lng: -0.2027 };
const ARDELEY = { lat: 51.9253, lng: -0.0895 }; // a village about 8 km east of Stevenage
const FAIRLANDS = { lat: 51.8992, lng: -0.1749 }; // in the town, about 2 km away
const HITCHIN = { lat: 51.9487, lng: -0.2813 };

describe("which places count as already covered by an earlier fetch", () => {
  it("counts the town itself, and somewhere a few kilometres away, as covered", () => {
    const box = coverageBox(STEVENAGE);
    expect(inside(box, FAIRLANDS)).toBe(true);
    expect(inside(box, STEVENAGE)).toBe(true);
  });

  it("does not count a village 8 km from the town as covered by the town's places", () => {
    expect(inside(coverageBox(STEVENAGE), ARDELEY)).toBe(false);
    expect(inside(coverageBox(ARDELEY), STEVENAGE)).toBe(false);
  });

  it("does not count the next town as covered either, even though it sits inside the corner of the box", () => {
    // About 7.5 km away on the diagonal: inside a 6 km-a-side box, outside 6 km as the crow flies.
    expect(inside(coverageBox(STEVENAGE), HITCHIN)).toBe(true);
    expect(isCovered([{ location_lat: STEVENAGE.lat, location_lng: STEVENAGE.lng }], HITCHIN)).toBe(false);
  });

  it("is covered when any one stored place is close enough, and not by places with no position", () => {
    const here = [{ location_lat: 51.95, location_lng: -0.2 }, { location_lat: FAIRLANDS.lat, location_lng: FAIRLANDS.lng }];
    expect(isCovered(here, STEVENAGE)).toBe(true);
    expect(isCovered([{ location_lat: null, location_lng: null }], STEVENAGE)).toBe(false);
    expect(isCovered([], STEVENAGE)).toBe(false);
    expect(isCovered([{ location_lat: STEVENAGE.lat, location_lng: STEVENAGE.lng }], ARDELEY)).toBe(false);
  });

  it("is smaller than the distance between a town and its nearest villages", () => {
    expect(COVERED_RADIUS_KM).toBeLessThanOrEqual(6);
  });

  it("is wider east to west at higher latitude in degrees, so the box is the same distance each way", () => {
    const south = coverageBox({ lat: 36, lng: 0 });
    const north = coverageBox({ lat: 60, lng: 0 });
    expect(north.lngMax - north.lngMin).toBeGreaterThan(south.lngMax - south.lngMin);
    expect(north.latMax - north.latMin).toBeCloseTo(south.latMax - south.latMin, 10);
  });
});
