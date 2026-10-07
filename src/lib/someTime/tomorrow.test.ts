import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OpportunityCandidate } from "@/lib/opportunities/engine";
import type { AffinityScores } from "@/lib/memory/scoring";
import { availableStarts, durationOptionsFor, DURATION_OPTIONS, startLabel, summaryLine } from "@/lib/someTime/choices";
import { parseTimeRequest } from "@/lib/someTime/request";
import { buildRecommendations, type RecommendInputs } from "@/lib/someTime/recommend";
import { EMPTY_HISTORY } from "@/lib/someTime/score";
import { slotsForWindow } from "@/lib/someTime/slots";
import { clockLabel, resolveWindow } from "@/lib/someTime/window";
import { placeOpenTimeChoice, resolveDate } from "@/lib/surprise/placeInSlot";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
// Friday 2 October 2026, 13:07 in London (British Summer Time).
const FRIDAY = new Date("2026-10-02T12:07:00Z");

describe("tomorrow", () => {
  it("is a stretch of tomorrow starting at ten, whatever time it is now", () => {
    const r = resolveWindow({ start: "tomorrow", duration: "half_day" }, FRIDAY);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.window.date).toBe("2026-10-03");
    expect(clockLabel(r.window.startMin)).toBe("10:00");
    expect(r.window.availableMinutes).toBe(240);
    expect(clockLabel(r.window.endMin)).toBe("14:00");
  });

  it("is still available late at night, when today has nothing left", () => {
    const lateNight = new Date("2026-10-02T21:50:00Z"); // 22:50 London
    expect(resolveWindow({ start: "now", duration: "1-2h" }, lateNight).ok).toBe(false);
    const r = resolveWindow({ start: "tomorrow", duration: "1-2h" }, lateNight);
    expect(r.ok && r.window.date).toBe("2026-10-03");
  });

  it("rolls over a month and a year end", () => {
    const r = resolveWindow({ start: "tomorrow", duration: "1-2h" }, new Date("2026-12-31T12:00:00Z"));
    expect(r.ok && r.window.date).toBe("2027-01-01");
  });

  it("goes by London's date, not UTC's, just after midnight in summer", () => {
    // 23:30 UTC on Fri 2 Oct is 00:30 on Sat 3 Oct in London, so tomorrow is Sunday 4th.
    const r = resolveWindow({ start: "tomorrow", duration: "1-2h" }, new Date("2026-10-02T23:30:00Z"));
    expect(r.ok && r.window.date).toBe("2026-10-04");
  });

  it("has no 'until my next thing': that is about the day they are in", () => {
    const r = resolveWindow({ start: "tomorrow", duration: "until_next", untilMin: 14 * 60 }, FRIDAY);
    // Treated like any other stretch rather than as time before a commitment today.
    expect(r.ok && r.window.date).toBe("2026-10-03");
  });
});

describe("all day", () => {
  it("is about nine hours from ten in the morning", () => {
    const r = resolveWindow({ start: "tomorrow", duration: "all_day" }, FRIDAY);
    expect(r.ok && r.window.availableMinutes).toBe(540);
    expect(r.ok && clockLabel(r.window.endMin)).toBe("19:00");
    expect(r.ok && r.window.minUsefulMinutes).toBe(240);
  });

  it("never runs past the end of a sensible day, even started late today", () => {
    const r = resolveWindow({ start: "now", duration: "all_day" }, new Date("2026-10-02T17:00:00Z")); // 18:00
    expect(r.ok && r.window.endMin).toBe(22 * 60 + 30);
  });
});

describe("what the sheet offers", () => {
  it("offers Tomorrow at every hour, last", () => {
    expect(availableStarts(9).map((s) => s.value)).toEqual(["now", "afternoon", "evening", "tomorrow"]);
    expect(availableStarts(17).map((s) => s.value)).toEqual(["now", "evening", "tomorrow"]);
    expect(availableStarts(23).map((s) => s.value)).toEqual(["now", "tomorrow"]);
  });

  it("offers tomorrow its own lengths of time, and today the four it always had", () => {
    expect(durationOptionsFor("tomorrow").map((d) => d.label)).toEqual(["1–2 hours", "Half a day", "All day"]);
    expect(durationOptionsFor("now")).toBe(DURATION_OPTIONS);
    expect(durationOptionsFor("evening")).toBe(DURATION_OPTIONS);
  });

  it("says what was chosen in words, including all day", () => {
    expect(startLabel("tomorrow")).toBe("Tomorrow");
    expect(summaryLine({ duration: "all_day", start: "tomorrow" })).toBe("All day · Tomorrow");
  });

  it("uses the lengths for the chosen start, and hides 'until my next thing' for tomorrow", () => {
    const sheet = read("src/components/TimeSheet.tsx");
    expect(sheet).toContain("durationOptionsFor(effectiveStart)");
    expect(sheet).toContain("durations.map((d)");
    expect(sheet).toContain('until && effectiveStart !== "tomorrow"');
  });
});

describe("the request from the browser", () => {
  it("accepts tomorrow and all day, and still rejects anything else", () => {
    expect(parseTimeRequest({ start: "tomorrow", duration: "all_day", who: "just_me" })).toMatchObject({ start: "tomorrow", duration: "all_day" });
    expect(parseTimeRequest({ start: "next week", duration: "all_day", who: "just_me" })).toBeNull();
    expect(parseTimeRequest({ start: "tomorrow", duration: "all week", who: "just_me" })).toBeNull();
  });
});

describe("which part of tomorrow it covers", () => {
  it("is the morning first for a day that starts at ten, and all three parts for all day", () => {
    const half = resolveWindow({ start: "tomorrow", duration: "half_day" }, FRIDAY);
    const all = resolveWindow({ start: "tomorrow", duration: "all_day" }, FRIDAY);
    expect(half.ok && slotsForWindow(half.window)).toEqual(["morning", "afternoon"]);
    expect(all.ok && slotsForWindow(all.window)).toEqual(["morning", "afternoon", "evening"]);
  });
});

// ---- recommending for tomorrow ---------------------------------------------------------

const BARNET = { lat: 51.65309, lng: -0.2002261 };
const NO_AFFINITY: AffinityScores = { categoryScores: {}, tagScores: {}, activityScores: {}, recentCategoryCounts: {} };
let n = 0;
const place = (overrides: Partial<OpportunityCandidate> = {}): OpportunityCandidate => ({
  id: `id-${++n}`, title: `Place ${n}`, description: null, category: "Explore", address: "Somewhere, Barnet", price_estimate: 0, tags: ["museum"],
  rating: null, accessibility_notes: null, location_lat: BARNET.lat + 1.5 / 111, location_lng: BARNET.lng, booking_url: "https://example.org",
  date_time: null, expires_at: null, recurrence_rule: null, duration_minutes: 60, ...overrides,
});

const inputsFor = (candidates: OpportunityCandidate[], start: "now" | "tomorrow", duration: "half_day" | "all_day"): RecommendInputs => {
  const r = resolveWindow({ start, duration }, FRIDAY);
  if (!r.ok) throw new Error("window");
  return {
    request: { start, duration, who: "just_me", mood: null, exclude: [] },
    window: r.window,
    candidates,
    weatherNote: null,
    pleasantWeather: false,
    daylight: { sunriseMin: 7 * 60, sunsetMin: 18 * 60 },
    member: { budget_band: null, interests: [], goals: [], dietary: null, mobility_notes: null, travel: { drives: true, uses_public_transport: null, mobility_notes: null }, home: BARNET },
    affinity: NO_AFFINITY,
    history: EMPTY_HISTORY,
    profile: { goals: [], interests: [], budget_band: null, dietary: null, mobility_notes: null, personality: null },
    aspirations: [],
    ask: null,
  };
};

describe("recommending for tomorrow", () => {
  it("offers a one-off event only on the day it happens", async () => {
    const saturdayShow = place({ title: "Saturday Matinee", tags: ["theatre"], date_time: "2026-10-03T13:00:00Z", duration_minutes: 120 });
    const fridayShow = place({ title: "Friday Concert", tags: ["music"], date_time: "2026-10-02T17:00:00Z", duration_minutes: 90 });
    const tomorrow = await buildRecommendations(inputsFor([saturdayShow, fridayShow], "tomorrow", "all_day"));
    expect(tomorrow.options.map((o) => o.title)).toEqual(["Saturday Matinee"]);
    expect(tomorrow.options[0].happeningToday).toBe(true);
  });

  it("offers a place that is open tomorrow morning, and leaves out one that is shut that day", async () => {
    // 3 October 2026 is a Saturday.
    const open = place({ title: "Saturday Museum", recurrence_rule: "Sa 10:00-17:00" });
    const shut = place({ title: "Weekday Museum", category: "Learn", recurrence_rule: "Mo-Fr 10:00-17:00" });
    const { options } = await buildRecommendations(inputsFor([open, shut], "tomorrow", "all_day"));
    expect(options.map((o) => o.title)).toEqual(["Saturday Museum"]);
  });

  it("has a day long enough for a longer outing than a half day would hold", async () => {
    const long = place({ title: "Long Day Out", duration_minutes: 420, tags: ["heritage"] });
    expect((await buildRecommendations(inputsFor([long], "tomorrow", "half_day"))).options).toEqual([]);
    expect((await buildRecommendations(inputsFor([long], "tomorrow", "all_day"))).options.map((o) => o.title)).toEqual(["Long Day Out"]);
  });
});

// ---- accepting something for tomorrow ---------------------------------------------------

type Row = Record<string, unknown>;
function fakeClient(store: Record<string, Row[]>): SupabaseClient {
  let counter = 0;
  const builder = (table: string) => {
    const filters: [string, unknown][] = [];
    let pendingInsert: Row | null = null;
    const matching = () => (store[table] ?? []).filter((r) => filters.every(([c, v]) => r[c] === v));
    const run = () => {
      if (pendingInsert) {
        const row = { id: `${table}-${++counter}`, ...pendingInsert };
        (store[table] ??= []).push(row);
        return { data: [row], error: null };
      }
      return { data: matching(), error: null };
    };
    const api: Record<string, unknown> = {
      select: () => api,
      eq: (c: string, v: unknown) => (filters.push([c, v]), api),
      limit: () => api,
      insert: (row: Row) => ((pendingInsert = row), api),
      upsert: (row: Row) => ((pendingInsert = row), api),
      maybeSingle: async () => ({ data: run().data?.[0] ?? null, error: null }),
      single: async () => ({ data: run().data?.[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => unknown) => resolve(run()),
    };
    return api;
  };
  return { from: builder } as unknown as SupabaseClient;
}

describe("accepting something for tomorrow", () => {
  it("works out the plan week and day of a date, across a Sunday into the next week", () => {
    expect(resolveDate("2026-10-03")).toEqual({ weekStart: "2026-09-28", day: "Sat" });
    expect(resolveDate("2026-10-05")).toEqual({ weekStart: "2026-10-05", day: "Mon" });
  });

  it("puts the choice into tomorrow's day, not today's", async () => {
    const store = { activities: [{ id: "a1" }], itineraries: [{ id: "it-1", member_id: "m1", week_start_date: "2026-09-28" }], itinerary_items: [] as Row[], preference_signals: [] };
    const client = fakeClient(store);
    const result = await placeOpenTimeChoice(client, client, "m1", "a1", "morning", FRIDAY, "You chose this.", "2026-10-03");
    expect(result.error).toBeNull();
    expect(store.itinerary_items).toHaveLength(1);
    expect(store.itinerary_items[0]).toMatchObject({ day_of_week: "Sat", slot: "morning", member_action: "accepted" });
  });

  it("starts next week's plan when tomorrow is Monday", async () => {
    const store = { activities: [{ id: "a1" }], itineraries: [] as Row[], itinerary_items: [] as Row[], preference_signals: [] };
    const client = fakeClient(store);
    const sunday = new Date("2026-10-04T12:00:00Z");
    const result = await placeOpenTimeChoice(client, client, "m1", "a1", "morning", sunday, "You chose this.", "2026-10-05");
    expect(result.error).toBeNull();
    expect(store.itineraries[0]).toMatchObject({ week_start_date: "2026-10-05" });
    expect(store.itinerary_items[0]).toMatchObject({ day_of_week: "Mon" });
  });

  it("is passed the date the window is for", () => {
    expect(read("src/app/today/timeActions.ts")).toContain("rationale, resolved.window.date)");
  });
});
