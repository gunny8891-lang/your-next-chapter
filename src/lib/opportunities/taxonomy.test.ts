import { describe, expect, it } from "vitest";
import { normaliseTags } from "@/lib/opportunities/tags";
import { opportunityPool, primaryTheme, themesOf } from "@/lib/opportunities/taxonomy";

const place = (title: string, tags: string[], category = "Explore") => ({ title, category, tags: normaliseTags(tags) });

describe("live or go", () => {
  it("calls a one-off event or something that ends live, and a standing place go", () => {
    expect(opportunityPool({ date_time: "2099-01-01T19:30:00Z", expires_at: null })).toBe("live");
    expect(opportunityPool({ date_time: null, expires_at: "2099-01-01T00:00:00Z" })).toBe("live");
    expect(opportunityPool({ date_time: null, expires_at: null })).toBe("go");
  });
});

describe("what kind of thing it is", () => {
  it("finds a day out in a heritage place, not in an ordinary park", () => {
    expect(themesOf(place("Osterley Park and House", ["National Trust", "history", "gardens"]))).toEqual(expect.arrayContaining(["days_out", "outdoors"]));
    expect(primaryTheme(place("Osterley Park and House", ["National Trust", "history", "gardens"]))).toBe("days_out");
    expect(themesOf(place("Oak Hill Park", ["park"]))).not.toContain("days_out");
    expect(primaryTheme(place("Oak Hill Park", ["park"]))).toBe("outdoors");
  });

  it("sees cafés and pubs as food and drink", () => {
    expect(primaryTheme(place("The Old Bull", ["food-venue", "pub"], "Joy"))).toBe("food_drink");
  });

  it("sees theatres, museums and talks as culture, and classes as learning", () => {
    expect(primaryTheme(place("Chickenshed", ["theatre"], "Joy"))).toBe("culture");
    expect(themesOf(place("Local history talk", ["talk", "history"], "Learn"))).toContain("culture");
    expect(themesOf(place("Pottery for beginners", ["classes", "crafts"], "Learn"))).toContain("learning");
  });

  it("sees active, wellbeing, family, community and volunteering", () => {
    expect(themesOf(place("Pool", ["swimming"], "Move"))).toContain("active");
    expect(themesOf(place("Yoga", ["yoga"], "Wellness"))).toEqual(expect.arrayContaining(["active", "wellbeing"]));
    expect(themesOf(place("Soft play", ["soft play", "grandchildren"], "Joy"))).toContain("family");
    expect(themesOf(place("u3a group", ["u3a"], "Connect"))).toContain("community");
    expect(themesOf(place("Befriending", ["volunteering"], "Give Back"))).toContain("volunteering");
  });

  it("sees a day trip as a short trip", () => {
    expect(themesOf(place("Cambridge by train", ["day_trip"]))).toContain("short_trips");
  });

  it("returns nothing, rather than a guess, when the tags say nothing", () => {
    expect(themesOf({ title: "Thing", tags: [] })).toEqual([]);
    expect(primaryTheme({ title: "Thing", tags: [] })).toBeNull();
  });

  it("puts the priorities first when several apply", () => {
    const order = themesOf(place("Hall", ["National Trust", "gardens", "walking", "museum"]));
    expect(order.indexOf("days_out")).toBeLessThan(order.indexOf("outdoors"));
    expect(order.indexOf("outdoors")).toBeLessThan(order.indexOf("culture"));
  });
});
