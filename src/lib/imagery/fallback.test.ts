import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FALLBACK_RULES, fallbackImageFor } from "@/lib/imagery/fallback";

describe("fallbackImageFor", () => {
  it.each([
    [["walking", "nature", "outdoors", "grandchildren"], "woodland"], // nature reserve
    [["walking", "outdoors", "grandchildren"], "woodland"], // park
    [["gardens", "outdoors"], "garden"],
    [["swimming", "gentle exercise"], "pool"],
    [["books", "quiet", "indoor"], "library"],
    [["theatre"], "theatre"],
    [["cinema"], "theatre"],
    [["film", "afternoon tea", "social"], "theatre"],
    [["arts", "classes"], "crafts"],
    [["craft", "knitting", "social", "skills"], "crafts"],
    [["food-venue", "cafe", "coffee", "brunch", "lunch"], "cafe"],
    [["food-venue", "cafe", "afternoon-tea"], "cafe"],
    // The kinds added to cover the listings that had only the plain panel.
    [["yoga", "relaxation"], "yoga"],
    [["tai_chi", "wellness", "outdoors"], "yoga"],
    [["museum", "history"], "museum"],
    [["art", "gallery", "culture", "indoor"], "museum"],
    [["castle", "history", "heritage"], "heritage"],
    [["National Trust", "history"], "heritage"],
    [["music", "social"], "events"],
    [["playground", "grandchildren"], "playground"],
    [["grandchildren", "toddlers", "family", "play"], "playground"],
    [["fitness", "indoor"], "sport"],
    [["community", "social", "community-centre"], "social"],
    [["u3a", "talk"], "social"],
  ])("%j gets the %s picture", (tags, name) => {
    expect(fallbackImageFor(tags)?.src).toBe(`/images/fallback/${name}.jpg`);
  });

  it("prefers the specific to the broad (a garden with a walk is a garden; a museum with children's play is a museum)", () => {
    expect(fallbackImageFor(["walking", "gardens", "outdoors"])?.src).toBe("/images/fallback/garden.jpg");
    expect(fallbackImageFor(["grandchildren", "museum", "history", "family"])?.src).toBe("/images/fallback/museum.jpg");
    expect(fallbackImageFor(["leisure", "swimming", "fitness"])?.src).toBe("/images/fallback/pool.jpg");
  });

  it("stands no picture in for a pub or a restaurant, nor for a bowling alley, golf, soft play or a bike ride", () => {
    expect(fallbackImageFor(["food-venue", "pub", "lunch", "dinner", "drinks"])).toBeNull();
    expect(fallbackImageFor(["food-venue", "restaurant", "lunch"])).toBeNull();
    expect(fallbackImageFor(["bowling", "social", "indoor", "family"])).toBeNull();
    expect(fallbackImageFor(["mini golf", "social", "family", "grandchildren"])).toBeNull();
    expect(fallbackImageFor(["golf", "outdoors"])).toBeNull();
    expect(fallbackImageFor(["grandchildren", "soft play", "indoor", "family"])).toBeNull();
    expect(fallbackImageFor(["cycling", "fitness", "social"])).toBeNull();
  });

  it("has nothing for what it has no picture for", () => {
    expect(fallbackImageFor(["volunteering", "driving"])).toBeNull();
    expect(fallbackImageFor(["family", "wildlife"])).toBeNull();
    expect(fallbackImageFor([])).toBeNull();
  });

  it("is decoration, not a claim: no credit, empty alt text, marked generic", () => {
    expect(fallbackImageFor(["swimming"])).toMatchObject({ alt: "", credit: "", sourceUrl: "", generic: true, license: "CC0" });
  });

  it("only points at pictures that exist, and each has its credit on record", () => {
    const credits = readFileSync("public/images/fallback/CREDITS.md", "utf8");
    for (const rule of FALLBACK_RULES) {
      const src = fallbackImageFor([rule.tags[0]])!.src;
      expect(existsSync(`public${src}`), src).toBe(true);
      expect(credits, rule.image).toContain(`\`${rule.image}.jpg\``);
    }
  });

  it("keeps every picture small enough to be shown quickly on a phone", () => {
    for (const rule of FALLBACK_RULES) {
      const bytes = readFileSync(`public/images/fallback/${rule.image}.jpg`).length;
      expect(bytes, rule.image).toBeLessThan(1_300_000);
    }
  });
});
