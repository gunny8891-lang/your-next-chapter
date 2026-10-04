import { describe, expect, it } from "vitest";
import { formatCost, isUnknownDetail, LOCATION_UNKNOWN, PRICE_UNKNOWN } from "@/lib/itinerary/format";

describe("formatCost", () => {
  it("says Free, a price, or the unknown marker", () => {
    expect(formatCost(0)).toBe("Free");
    expect(formatCost(8)).toBe("£8");
    expect(formatCost(null)).toBe(PRICE_UNKNOWN);
  });
});

describe("isUnknownDetail", () => {
  it("recognises the placeholders screens should leave out, and nothing else", () => {
    expect(isUnknownDetail(PRICE_UNKNOWN)).toBe(true);
    expect(isUnknownDetail(LOCATION_UNKNOWN)).toBe(true);
    expect(isUnknownDetail("Free")).toBe(false);
    expect(isUnknownDetail("Richmond Lock")).toBe(false);
    expect(isUnknownDetail(null)).toBe(false);
  });
});
