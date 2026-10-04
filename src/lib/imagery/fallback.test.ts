import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fallbackImageFor } from "@/lib/imagery/fallback";

describe("fallbackImageFor", () => {
  it.each([
    [["walking", "nature", "outdoors", "grandchildren"], "woodland"], // nature reserve
    [["walking", "outdoors", "grandchildren"], "woodland"], // park
    [["gardens", "outdoors"], "garden"],
    [["swimming", "gentle exercise"], "pool"],
    [["books", "quiet", "indoor"], "library"],
    [["theatre"], "theatre"],
    [["cinema"], "theatre"],
    [["arts", "classes"], "crafts"],
    [["food-venue", "cafe", "coffee", "brunch", "lunch"], "cafe"],
    [["food-venue", "cafe", "afternoon-tea"], "cafe"],
  ])("%j gets the %s picture", (tags, name) => {
    expect(fallbackImageFor(tags)?.src).toBe(`/images/fallback/${name}.jpg`);
  });

  it("prefers the specific to the broad (a garden with a walk is a garden)", () => {
    expect(fallbackImageFor(["walking", "gardens", "outdoors"])?.src).toBe("/images/fallback/garden.jpg");
  });

  it("stands no picture in for a pub or a restaurant, nor for things it has no picture for", () => {
    expect(fallbackImageFor(["food-venue", "pub", "lunch", "dinner", "drinks"])).toBeNull();
    expect(fallbackImageFor(["food-venue", "restaurant", "lunch"])).toBeNull();
    expect(fallbackImageFor(["community", "social"])).toBeNull();
    expect(fallbackImageFor(["yoga", "relaxation"])).toBeNull();
    expect(fallbackImageFor([])).toBeNull();
  });

  it("is decoration, not a claim: no credit, empty alt text, marked generic", () => {
    expect(fallbackImageFor(["swimming"])).toMatchObject({ alt: "", credit: "", sourceUrl: "", generic: true, license: "CC0" });
  });

  it("only points at pictures that exist", () => {
    const tagsFor = [["swimming"], ["books"], ["theatre"], ["gardens"], ["cafe"], ["arts"], ["walking"]];
    for (const tags of tagsFor) {
      const src = fallbackImageFor(tags)!.src;
      expect(existsSync(`public${src}`), src).toBe(true);
    }
  });
});
