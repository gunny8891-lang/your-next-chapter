import { describe, expect, it } from "vitest";
import { applyFoodVenueMode, foodKindOf, isFoodVenue } from "@/lib/opportunities/kinds";

const cafe = { id: "cafe", tags: ["food-venue", "cafe", "coffee"] };
const pub = { id: "pub", tags: ["food-venue", "pub", "drinks"] };
const tea = { id: "tea", tags: ["food-venue", "cafe", "afternoon-tea"] };
const park = { id: "park", tags: ["walking", "outdoors"] };
const all = [cafe, pub, park];

describe("food venue handling", () => {
  it("leaves cafés and pubs out by default, so the plan never offers a pub as an activity", () => {
    expect(applyFoodVenueMode(all, "exclude").map((a) => a.id)).toEqual(["park"]);
  });

  it("includes everything when asked", () => {
    expect(applyFoodVenueMode(all, "include")).toHaveLength(3);
  });

  it("can return food and drink only", () => {
    expect(applyFoodVenueMode(all, "only").map((a) => a.id)).toEqual(["cafe", "pub"]);
  });

  it("recognises a food venue by its tag", () => {
    expect(isFoodVenue(cafe)).toBe(true);
    expect(isFoodVenue(park)).toBe(false);
  });

  it("tells a tea room from a café even though both are tagged cafe", () => {
    expect(foodKindOf(tea.tags)).toBe("tea_room");
    expect(foodKindOf(cafe.tags)).toBe("cafe");
    expect(foodKindOf(pub.tags)).toBe("pub");
    expect(foodKindOf(["food-venue", "restaurant"])).toBe("restaurant");
    expect(foodKindOf(park.tags)).toBeNull();
  });
});
