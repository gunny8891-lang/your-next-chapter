import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { distanceHint, FEW_IDEAS, TRAVEL_DISTANCES, withDistanceHint } from "@/lib/account/distanceHint";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("telling someone a wider distance would show more", () => {
  it("names the next distance up, in the words of the set-up question", () => {
    expect(distanceHint(1, 1)).toBe(`There isn't much within walking distance of you. Choosing "Up to 3 miles" in Account will show you more.`);
    expect(distanceHint(5, 2)).toBe(`There isn't much within 3 miles of you. Choosing "Up to 10 miles" in Account will show you more.`);
    expect(distanceHint(16, 0)).toBe(`There isn't much within 10 miles of you. Choosing "I'm happy to travel further" in Account will show you more.`);
  });

  it("says nothing when there are enough ideas", () => {
    expect(distanceHint(1, FEW_IDEAS)).toBeNull();
    expect(distanceHint(5, 7)).toBeNull();
  });

  it("says nothing to someone who already travels as far as the app goes, or whose distance is not known", () => {
    expect(distanceHint(40, 0)).toBeNull();
    expect(distanceHint(80, 0)).toBeNull();
    expect(distanceHint(null, 0)).toBeNull();
    expect(distanceHint(undefined, 0)).toBeNull();
    expect(distanceHint(Number.NaN, 0)).toBeNull();
  });

  it("treats a distance set some other way as the nearest offered one above it", () => {
    // 3 km is not an option: it sits within "up to 3 miles" (5 km), so the next step is 10 miles.
    expect(distanceHint(3, 1)).toBe(`There isn't much within 3 miles of you. Choosing "Up to 10 miles" in Account will show you more.`);
    expect(distanceHint(10, 1)).toBe(`There isn't much within 10 miles of you. Choosing "I'm happy to travel further" in Account will show you more.`);
  });

  it("is added after any other notice, or stands alone, or is nothing", () => {
    expect(withDistanceHint("That's everything nearby.", "Try more.")).toBe("That's everything nearby. Try more.");
    expect(withDistanceHint(null, "Try more.")).toBe("Try more.");
    expect(withDistanceHint("That's everything nearby.", null)).toBe("That's everything nearby.");
    expect(withDistanceHint(null, null)).toBeNull();
  });
});

describe("the distances offered", () => {
  it("are exactly the answers the set-up and Account give, with the same distances", () => {
    const onboarding = read("src/app/onboarding/actions.ts");
    const account = read("src/components/AccountSettingsForm.tsx");
    for (const d of TRAVEL_DISTANCES) {
      expect(onboarding, d.answer).toContain(`"${d.answer}": ${d.km}`);
    }
    // Account words them as the same four answers (the last in the same wording, as stored kilometres).
    for (const km of [1, 5, 16, 40]) expect(account).toContain(`km: ${km}`);
    expect(TRAVEL_DISTANCES.map((d) => d.km)).toEqual([1, 5, 16, 40]);
  });
});

describe("where the hint appears", () => {
  it("on My Week when the week is thin, never on the example week, with a way to change it", () => {
    const page = read("src/app/week/page.tsx");
    expect(page).toContain("distanceHint(profile.travel_radius_km, items.length)");
    expect(page).toContain("isDemo ? null :");
    const view = read("src/components/ThisWeekView.tsx");
    expect(view).toContain("{distanceHint && (");
    expect(view).toContain('href="/account#field-travel_radius_km"');
  });

  it("in 'I've got some time' only for half a day or more, since a short window being thin is the time, not the distance", () => {
    const recommend = read("src/lib/someTime/recommend.ts");
    expect(recommend).toContain("window.availableMinutes >= 180 ? distanceHint(profile?.travel_radius_km, options.length) : null");
    expect(recommend).toContain("withDistanceHint(notice, hint)");
  });
});
