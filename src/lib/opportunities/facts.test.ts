import { describe, expect, it } from "vitest";
import { costTierOf, dogFriendly, parseCostConfidence, parseDogAccess, parseDogConfidence, priceFrom, priceUpTo, refusesDogs } from "@/lib/opportunities/facts";

describe("dog access", () => {
  it("is friendly only where some of the place is open to a pet dog", () => {
    expect(dogFriendly({ dog_access: "allowed" })).toBe(true);
    expect(dogFriendly({ dog_access: "outdoor_only" })).toBe(true);
    expect(dogFriendly({ dog_access: "selected_areas" })).toBe(true);
  });

  it("is not friendly where none of it is, and assistance dogs are not pet dogs", () => {
    expect(dogFriendly({ dog_access: "not_allowed" })).toBe(false);
    expect(dogFriendly({ dog_access: "assistance_dogs_only" })).toBe(false);
  });

  it("is unknown, not a guess, when nothing is known or the value is not recognised", () => {
    expect(dogFriendly({})).toBeNull();
    expect(dogFriendly({ dog_access: "unknown" })).toBeNull();
    expect(dogFriendly({ dog_access: "yes please" })).toBeNull();
    expect(parseDogAccess(undefined)).toBe("unknown");
    expect(parseDogAccess("allowed")).toBe("allowed");
    expect(parseDogConfidence("verified")).toBe("verified");
    expect(parseDogConfidence("probably")).toBe("unknown");
  });

  it("only leaves out what is known to refuse dogs", () => {
    expect(refusesDogs({ dog_access: "not_allowed" })).toBe(true);
    expect(refusesDogs({ dog_access: "assistance_dogs_only" })).toBe(true);
    expect(refusesDogs({ dog_access: "unknown" })).toBe(false);
    expect(refusesDogs({ dog_access: "allowed" })).toBe(false);
    expect(refusesDogs({})).toBe(false);
  });
});

describe("cost", () => {
  it("falls into the four tiers per person", () => {
    expect(costTierOf({ price_estimate: 0 })).toBe("free");
    expect(costTierOf({ price_estimate: 6 })).toBe("low");
    expect(costTierOf({ price_estimate: 15 })).toBe("low");
    expect(costTierOf({ price_estimate: 16 })).toBe("mid");
    expect(costTierOf({ price_estimate: 40 })).toBe("mid");
    expect(costTierOf({ price_estimate: 41 })).toBe("high");
  });

  it("never shows an unknown price as free", () => {
    expect(costTierOf({})).toBeNull();
    expect(costTierOf({ price_estimate: null, price_type: "unknown" })).toBeNull();
    expect(costTierOf({ price_estimate: "" })).toBeNull();
    expect(costTierOf({ price_estimate: -3 })).toBeNull();
  });

  it("uses the range when there is one, and the single estimate when there is not", () => {
    expect(priceFrom({ price_min: 10, price_max: 30, price_estimate: 20 })).toBe(10);
    expect(priceUpTo({ price_min: 10, price_max: 30, price_estimate: 20 })).toBe(30);
    expect(priceFrom({ price_estimate: 12 })).toBe(12);
    expect(priceUpTo({ price_estimate: 12 })).toBe(12);
    expect(costTierOf({ price_min: 10, price_max: 45 })).toBe("high");
  });

  it("takes a price marked free as free whatever else is stored, and reads database numbers that arrive as text", () => {
    expect(costTierOf({ price_type: "free", price_estimate: null })).toBe("free");
    expect(costTierOf({ price_estimate: "18" })).toBe("mid");
  });

  it("says unknown when the confidence is not recognised", () => {
    expect(parseCostConfidence("known")).toBe("known");
    expect(parseCostConfidence("estimated")).toBe("estimated");
    expect(parseCostConfidence("sure")).toBe("unknown");
  });
});
