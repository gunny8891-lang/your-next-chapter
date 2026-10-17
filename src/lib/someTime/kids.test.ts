import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { OpportunityCandidate } from "@/lib/opportunities/engine";
import { KID_TAGS, notForAge, suitsAge, suitsChildren } from "@/lib/opportunities/kids";
import { checkConstraints, describeContext, parseContext, preferVerified } from "@/lib/context/constraints";
import { moodBonus, moodFits } from "@/lib/someTime/score";
import { grandchildrenRequest, moodNotice } from "@/lib/someTime/recommend";
import { MOOD_OPTIONS } from "@/lib/someTime/choices";
import { MOOD_LABEL, parseTimeRequest, type TimeRequest } from "@/lib/someTime/request";
import { kidsLine, pickKidsPlaces, wantsKidsActivities } from "@/lib/chat/kids";
import { themeByKey } from "@/lib/discovery/themes";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("what the tags say about children", () => {
  it("is a place for children when something recorded says so", () => {
    for (const tag of KID_TAGS) expect(suitsChildren([tag]), tag).toBe(true);
    expect(suitsChildren(["museum", "history"])).toBe(false);
    expect(suitsChildren([])).toBe(false);
    expect(suitsChildren(undefined)).toBe(false);
  });

  it("is known not to suit an age when the tags say so: toddlers cannot bowl and a teenager does not want a toddler group", () => {
    expect(notForAge(["bowling", "family"], "toddlers")).toBe(true);
    expect(notForAge(["soft play", "toddlers"], "older")).toBe(true);
    expect(notForAge(["toddlers"], "young")).toBe(true);
    expect(notForAge(["playground", "grandchildren"], "toddlers")).toBe(false);
    expect(notForAge(["bowling", "family"], "older")).toBe(false);
  });

  it("suits an age in particular when the tags say so", () => {
    expect(suitsAge(["soft play", "toddlers"], "toddlers")).toBe(true);
    expect(suitsAge(["bowling"], "older")).toBe(true);
    expect(suitsAge(["bowling"], "toddlers")).toBe(false);
  });
});

describe("saying the grandchildren are coming", () => {
  it("is read from the browser, and anything else is dropped", () => {
    expect(parseContext({ kids: "toddlers" })).toEqual({ kids: "toddlers" });
    expect(parseContext({ kids: "any" })).toEqual({ kids: "any" });
    expect(parseContext({ kids: "teenagers" })).toEqual({});
    expect(parseContext({ kids: true })).toEqual({});
  });

  it("leaves out what is known not to suit that age", () => {
    expect(checkConstraints({ tags: ["bowling", "social", "family"] } as never, { kids: "toddlers" }).excluded).toBe(true);
    expect(checkConstraints({ tags: ["soft play", "toddlers"] } as never, { kids: "older" }).excluded).toBe(true);
  });

  it("is happy with a place that says it suits children, more so for the right age, and says why", () => {
    const any = checkConstraints({ tags: ["playground", "grandchildren"] } as never, { kids: "any" });
    const young = checkConstraints({ tags: ["playground", "grandchildren"] } as never, { kids: "young" });
    expect(any.excluded).toBe(false);
    expect(any.reasons).toEqual(["it suits children"]);
    expect(young.bonus).toBeGreaterThan(any.bonus);
  });

  it("asks them to check a place that does not say, and prefers one that does", () => {
    const unknown = checkConstraints({ tags: ["museum"] } as never, { kids: "any" });
    expect(unknown.unverified).toEqual(["Check it suits children"]);
    const items = [
      { id: "a", unverified: unknown.unverified },
      { id: "b", unverified: [] as string[] },
    ];
    expect(preferVerified(items).map((i) => i.id)).toEqual(["b"]);
  });

  it("asks nothing of somewhere to eat on the way", () => {
    expect(checkConstraints({ tags: ["food-venue", "cafe"] } as never, { kids: "toddlers" }, "stop")).toMatchObject({ excluded: false, unverified: [] });
  });

  it("tells the model what they said, and not to promise safety or an age", () => {
    const [line] = describeContext({ kids: "toddlers" });
    expect(line).toMatch(/grandchildren under five/);
    expect(line).toMatch(/never promise that a place is safe, supervised or right for a particular age/);
    expect(describeContext({})).toEqual([]);
  });
});

describe("the grandchildren choice", () => {
  const request = (over: Partial<TimeRequest> = {}): TimeRequest => ({ start: "saturday", duration: "half_day", who: "just_me", mood: "kids", exclude: [], ...over });

  it("is offered with the other ways to steer, and arrives from the browser with its context", () => {
    expect(MOOD_OPTIONS.map((m) => m.value)).toContain("kids");
    expect(MOOD_LABEL.kids).toBe("With the grandchildren");
    const parsed = parseTimeRequest({ start: "saturday", duration: "half_day", who: "just_me", mood: "kids", context: { kids: "young" } });
    expect(parsed?.mood).toBe("kids");
    expect(parsed?.context).toEqual({ kids: "young" });
  });

  it("only suits places that say they suit children, and never somewhere to eat", () => {
    expect(moodFits("kids", { category: "Joy", tags: ["playground", "grandchildren"] })).toBe(true);
    expect(moodFits("kids", { category: "Explore", tags: ["museum"] })).toBe(false);
    expect(moodBonus("kids", { category: "Joy", tags: ["food-venue", "cafe", "family"] })).toBeLessThan(0);
  });

  it("counts as going with family", () => {
    expect(grandchildrenRequest(request()).who).toBe("family");
    expect(grandchildrenRequest(request({ who: "friends" })).who).toBe("family");
    const other = request({ mood: "culture" });
    expect(grandchildrenRequest(other)).toBe(other);
  });

  it("says plainly when little fits", () => {
    expect(moodNotice("kids", 0)).toMatch(/Nothing for children fits/);
    expect(moodNotice("kids", 2)).toMatch(/every idea for children/);
    expect(moodNotice("kids", 5)).toBeNull();
  });

  it("asks how old they are in Explore, only for this choice, and sends it with the search", () => {
    const explore = read("src/components/ExploreView.tsx");
    expect(explore).toContain('mood === "kids" && (');
    expect(explore).toContain("How old are they?");
    expect(explore).toContain('...(chosen === "kids" ? { context: { kids: age } } : {})');
  });
});

describe("finding more of them", () => {
  it("is a search of its own, once a month, the same for every town", () => {
    const theme = themeByKey("grandchildren");
    expect(theme?.focus).toMatch(/soft play/);
    expect(theme?.focus).toMatch(/story and rhyme times/);
    expect(theme?.focus).toMatch(/ages each is for/);
    expect(`${theme?.label} ${theme?.focus}`).not.toMatch(/stevenage|barnet|richmond/i);
  });
});

describe("the concierge and children", () => {
  const venue = (title: string, tags: string[], over: Partial<OpportunityCandidate> = {}): OpportunityCandidate =>
    ({ id: title, title, tags, address: "High Street", price_estimate: 0, recurrence_rule: null, date_time: null, ...over }) as unknown as OpportunityCandidate;

  it("hears a mention of children or grandchildren, and nothing else", () => {
    for (const yes of ["Find something to do with my grandchildren", "the kids are coming Saturday", "somewhere for a toddler", "my granddaughter is 6", "the grandkids birthday"]) {
      expect(wantsKidsActivities(yes), yes).toBe(true);
    }
    for (const no of ["What's on today?", "a day trip to Windsor", "somewhere for lunch"]) expect(wantsKidsActivities(no), no).toBe(false);
  });

  it("lists only places that say they suit children, never somewhere to eat, in the order given", () => {
    const picked = pickKidsPlaces([venue("Museum", ["museum"]), venue("Play Park", ["playground"]), venue("Kids Cafe", ["food-venue", "cafe", "family"]), venue("Farm", ["farm", "animals"])]);
    expect(picked.map((p) => p.title)).toEqual(["Play Park", "Farm"]);
  });

  it("says what sort of place, the price and hours, and what is not known", () => {
    expect(kidsLine(venue("Soft Play", ["soft play", "toddlers", "indoor", "grandchildren"], { recurrence_rule: "Mo-Su 09:00-17:00", price_estimate: 6 }), 2.4)).toBe(
      "- id=Soft Play | Soft Play | soft play, toddlers, indoor | about £6 | High Street | 2 km from home | hours: Mo-Su 09:00-17:00"
    );
    expect(kidsLine(venue("Farm", ["farm"], { price_estimate: null }), null)).toContain("price not known | High Street | distance not known | opening hours not known");
  });

  it("is given only when children are mentioned, with a rule against promising safety or facilities", () => {
    const agent = read("src/lib/chat/agent.ts");
    expect(agent).toContain('wantsKidsActivities(question) ? await kidsText(supabase, memberId, scheduledActivityIds) : ""');
    expect(agent).toContain("THINGS FOR CHILDREN NEAR HOME");
    expect(agent).toContain("Never say a place is safe, supervised or right for an age");
  });
});
