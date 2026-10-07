import { describe, expect, it } from "vitest";
import { normaliseTags } from "@/lib/opportunities/tags";

describe("putting tags into one vocabulary", () => {
  it("treats every spelling of National Trust as the same tag", () => {
    for (const spelling of ["National Trust", "national trust", "national_trust", "National-Trust"]) {
      expect(normaliseTags([spelling])).toEqual(["national-trust"]);
    }
  });

  it("joins singular and plural forms of the same idea", () => {
    expect(normaliseTags(["garden"])).toEqual(["gardens"]);
    expect(normaliseTags(["walk"])).toEqual(["walking"]);
    expect(normaliseTags(["U3A", "u3a"])).toEqual(["u3a"]);
    expect(normaliseTags(["day trip", "day_trip"])).toEqual(["day-trip"]);
  });

  it("keeps the tags the rest of the app already looks for exactly as they are", () => {
    const existing = ["gentle exercise", "afternoon-tea", "food-venue", "outdoor-seating", "wheelchair-accessible", "vegetarian-options", "soft play", "outdoors", "walking"];
    expect(normaliseTags(existing)).toEqual(existing);
  });

  it("adds what is plainly implied, after the tag that implies it, without repeating", () => {
    expect(normaliseTags(["nature trail"])).toEqual(["nature trail", "walking", "nature"]);
    expect(normaliseTags(["park"])).toEqual(["park", "outdoors"]);
    expect(normaliseTags(["walking", "guided walk"])).toEqual(["walking", "guided walk"]);
  });

  it("never invents anything about dogs", () => {
    expect(normaliseTags(["park", "parkland", "outdoors", "nature", "gardens"]).filter((t) => /dog|pet|lead/.test(t))).toEqual([]);
  });

  it("copes with nothing, blanks and things that are not text", () => {
    expect(normaliseTags(null)).toEqual([]);
    expect(normaliseTags(undefined)).toEqual([]);
    expect(normaliseTags(["", "  ", "Pub"])).toEqual(["pub"]);
    expect(normaliseTags([5 as unknown as string, "pub"])).toEqual(["pub"]);
  });

  it("leaves the real catalogue's spellings tidy", () => {
    const live = ["National Trust", "national trust", "national_trust", "garden", "gardens", "walk", "walking", "U3A", "u3a", "day trip", "day_trip", "tai_chi", "nature walk", "Bath history", "Age UK"];
    const tidy = normaliseTags(live);
    expect(tidy).toEqual([...new Set(tidy)]);
    expect(tidy.filter((t) => t !== t.toLowerCase())).toEqual([]);
    expect(tidy.filter((t) => t.includes("_"))).toEqual([]);
    expect(tidy).toContain("national-trust");
    expect(tidy).toContain("tai-chi");
  });
});
