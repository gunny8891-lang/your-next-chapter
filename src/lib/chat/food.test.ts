import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OpportunityCandidate } from "@/lib/opportunities/engine";
import { foodLine, foodText, pickFood, wantsFood } from "@/lib/chat/food";
import { buildSystemPrompt } from "@/lib/chat/agent";
import { foodNearbyUrl } from "@/lib/act/directions";
import { ideaActLinks } from "@/lib/act/links";
import { offersFoodSearch } from "@/lib/someTime/recommend";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const BARNET = { lat: 51.65309, lng: -0.2002261 };
let n = 0;
const venue = (title: string, tags: string[], over: Partial<OpportunityCandidate> = {}, km = 1): OpportunityCandidate => ({
  id: `f${++n}`,
  title,
  description: null,
  category: "Joy",
  address: "High Street, Barnet",
  price_estimate: null,
  tags: ["food-venue", ...tags],
  rating: null,
  accessibility_notes: null,
  location_lat: BARNET.lat + km / 111,
  location_lng: BARNET.lng,
  booking_url: null,
  date_time: null,
  expires_at: null,
  recurrence_rule: "Mo-Sa 09:00-17:00",
  duration_minutes: 60,
  ...over,
});

describe("hearing a question about eating", () => {
  it("is about food and drink, in the words people use", () => {
    for (const yes of ["Where can I get lunch?", "any good cafes nearby", "somewhere for a coffee and cake", "I'm hungry", "a pub for Sunday dinner", "afternoon tea?", "Where can we eat after the museum", "a quick bite to eat", "restaurants for my birthday"]) {
      expect(wantsFood(yes), yes).toBe(true);
    }
  });

  it("is not triggered by questions about other things", () => {
    for (const no of ["What's on today?", "Find something to do this afternoon", "How do I add this to my calendar?", "a day trip to Windsor"]) {
      expect(wantsFood(no), no).toBe(false);
    }
  });
});

describe("what the concierge is given", () => {
  it("is a spread of each kind, not twelve of whichever there is most of", () => {
    const ranked = [
      ...Array.from({ length: 10 }, (_, i) => venue(`Cafe ${i}`, ["cafe"])),
      ...Array.from({ length: 4 }, (_, i) => venue(`Pub ${i}`, ["pub"])),
      venue("The Restaurant", ["restaurant"]),
      venue("Tea Rooms", ["cafe", "afternoon-tea"]),
    ];
    const picked = pickFood(ranked).map((v) => v.title);
    expect(picked.filter((t) => t.startsWith("Cafe"))).toHaveLength(3);
    expect(picked.filter((t) => t.startsWith("Pub"))).toHaveLength(3);
    expect(picked).toContain("The Restaurant");
    expect(picked).toContain("Tea Rooms");
    expect(picked.length).toBeLessThanOrEqual(12);
  });

  it("skips anything that is not a place to eat or drink", () => {
    expect(pickFood([venue("Mystery", [])])).toEqual([]);
  });

  it("says what it is, what it serves and what the map says about diets, how far, and when it is open", () => {
    const line = foodLine(venue("Green Kitchen", ["restaurant", "lunch", "dinner", "vegetarian-options", "vegan-options", "italian"]), 1.4);
    expect(line).toContain("Green Kitchen | restaurant");
    expect(line).toContain("serves: italian");
    expect(line).toContain("vegetarian-options, vegan-options");
    expect(line).toContain("1 km from home");
    expect(line).toContain("hours: Mo-Sa 09:00-17:00");
  });

  it("says plainly what is not known", () => {
    const line = foodLine(venue("Plain Cafe", ["cafe"], { recurrence_rule: null, address: null }), null);
    expect(line).toContain("opening hours not known");
    expect(line).toContain("distance not known");
    expect(line).toContain("location TBC");
    expect(line).not.toMatch(/vegetarian|vegan/);
  });

  it("marks a chain as one", () => {
    expect(foodLine(venue("Costa Coffee", ["cafe", "chain"]), 0.5)).toContain("chain");
  });

  /** A stand-in database: every table answers with canned rows, whatever the filters. */
  function fakeDb(rows: unknown[]) {
    const tables: Record<string, unknown[]> = {
      member_profiles: [{ location_lat: BARNET.lat, location_lng: BARNET.lng, travel_radius_km: 10, interests: [] }],
      activities: rows,
    };
    return {
      from(table: string) {
        const chain: Record<string, unknown> = {};
        for (const m of ["select", "eq", "in", "not", "gte", "order", "limit", "range"]) chain[m] = () => chain;
        chain.maybeSingle = () => Promise.resolve({ data: (tables[table] ?? [])[0] ?? null, error: null });
        chain.then = (resolve: (v: unknown) => void) => resolve({ data: tables[table] ?? [], error: null });
        return chain;
      },
    } as unknown as SupabaseClient;
  }

  it("lists only places to eat that are within their distance, and not the everyday activities", async () => {
    const rows = [
      venue("Near Cafe", ["cafe"]),
      venue("Far Pub", ["pub"], {}, 40),
      { ...venue("Barnet Museum", []), tags: ["museum"] },
    ];
    const text = await foodText(fakeDb(rows), "m1");
    expect(text).toContain("Near Cafe");
    expect(text).not.toContain("Far Pub");
    expect(text).not.toContain("Barnet Museum");
  });

  it("says so when there is nothing near, and gives nothing rather than failing when it cannot read", async () => {
    expect(await foodText(fakeDb([]), "m1")).toMatch(/None found near them yet/);
    const broken = { from: () => { throw new Error("db"); } } as unknown as SupabaseClient;
    const warn = console.warn;
    console.warn = () => {};
    expect(await foodText(broken, "m1")).toBe("");
    console.warn = warn;
  });
});

describe("the concierge's instructions about food", () => {
  const profile = { location_text: "Barnet", travel_radius_km: 10, interests: [], goals: [], budget_band: null, mobility_notes: null, dietary_preferences: "vegetarian" };
  const prompt = buildSystemPrompt(profile, "Friday 16 October", [], [], "", undefined, [], "", "", "", "- id=f1 | Green Kitchen | restaurant", "12:40");

  it("knows their dietary needs and the time", () => {
    expect(prompt).toContain("Food and dietary needs: vegetarian");
    expect(prompt).toContain("it is 12:40 in London");
  });

  it("lists the places only when asked, from the list only, and never invents a menu or a diet claim", () => {
    expect(prompt).toContain("FOOD AND DRINK NEAR HOME");
    expect(prompt).toContain("- id=f1 | Green Kitchen | restaurant");
    expect(prompt).toMatch(/from this list only/);
    expect(prompt).toMatch(/Never invent a menu, a price, a dish or a booking/);
    expect(prompt).toMatch(/Only say a place has vegetarian or vegan options if its line says so/);
    const quiet = buildSystemPrompt(profile, "Friday 16 October", [], [], "");
    expect(quiet).not.toContain("FOOD AND DRINK NEAR HOME");
  });

  it("is given only when the question is about eating", () => {
    expect(read("src/lib/chat/agent.ts")).toContain('wantsFood(question) ? await foodText(supabase, memberId) : ""');
  });
});

describe("finding food near an outing", () => {
  it("is a map search around the place, and nothing when the place is not known", () => {
    const url = foodNearbyUrl({ lat: 51.5194, lng: -0.127 })!;
    expect(url).toMatch(/^https:\/\/www\.google\.com\/maps\/search\/\?/);
    expect(decodeURIComponent(url.replaceAll("+", " "))).toContain("restaurants and cafes near 51.51940,-0.12700");
    expect(foodNearbyUrl({ lat: null, lng: null })).toBeNull();
    expect(foodNearbyUrl({ lat: 999, lng: 0 })).toBeNull();
  });

  it("is offered for a day trip or a long outing that is not food and has no stop of ours, and otherwise not", () => {
    expect(offersFoodSearch({ tags: ["museum", "day-trip"], duration_minutes: 90 }, false)).toBe(true);
    expect(offersFoodSearch({ tags: ["walking"], duration_minutes: 150 }, false)).toBe(true);
    expect(offersFoodSearch({ tags: ["walking"], duration_minutes: 60 }, false)).toBe(false);
    expect(offersFoodSearch({ tags: ["museum", "day-trip"], duration_minutes: 180 }, true)).toBe(false);
    expect(offersFoodSearch({ tags: ["food-venue", "cafe", "day-trip"], duration_minutes: 180 }, false)).toBe(false);
  });

  const args = { activityId: "a", experienceTitle: "A day out", placeTitle: "British Museum", address: null, lat: 51.5194, lng: -0.127, mode: null, date: "2026-10-17", start: "10:00", end: "16:00", foodId: null, moreUrl: null };

  it("is in the links for an idea when asked for, and absent otherwise", () => {
    expect(ideaActLinks({ ...args, foodNearby: true }).food).toContain("google.com/maps/search");
    expect(ideaActLinks({ ...args }).food).toBeNull();
  });

  it("shows on the card as 'Find food nearby', and on My Week for the same kinds of outing", () => {
    expect(read("src/components/OutAndAbout.tsx")).toContain("Find food nearby");
    expect(read("src/components/OutAndAbout.tsx")).toContain("act.food &&");
    expect(read("src/app/week/page.tsx")).toContain("offersFoodSearch(");
    expect(read("src/lib/someTime/recommend.ts")).toContain("foodNearby: offersFoodSearch(c, stop !== null)");
  });
});
