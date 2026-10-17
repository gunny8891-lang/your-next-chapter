import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DAY_TRIP_MAX_KM, fetchRankedOpportunities, type OpportunityCandidate } from "@/lib/opportunities/engine";
import { EMPTY_HISTORY, evaluateCandidate, moodBonus, moodFits, type MemberContext, type ScoringInput } from "@/lib/someTime/score";
import { dayTripRequest, moodNotice } from "@/lib/someTime/recommend";
import { MOOD_OPTIONS } from "@/lib/someTime/choices";
import { MOOD_LABEL, parseTimeRequest, type TimeRequest } from "@/lib/someTime/request";
import { resolveWindow } from "@/lib/someTime/window";
import { journeyText, wantsDayTrips, dayTripsText } from "@/lib/chat/dayTrips";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const BARNET = { lat: 51.65309, lng: -0.2002261 };
const request = (over: Partial<TimeRequest> = {}): TimeRequest => ({ start: "tomorrow", duration: "half_day", who: "just_me", mood: "daytrip", exclude: [], ...over });

const row = (id: string, title: string, lat: number, lng: number, tags: string[]) => ({
  id,
  title,
  description: null,
  category: "Explore",
  address: null,
  price_estimate: 0,
  rating: null,
  accessibility_notes: null,
  location_lat: lat,
  location_lng: lng,
  booking_url: null,
  date_time: null,
  expires_at: null,
  recurrence_rule: null,
  duration_minutes: 150,
  tags,
});

// About 16 km from Barnet, 24 km, and well beyond the day-trip limit.
const BRITISH_MUSEUM = row("bm", "British Museum", 51.5194, -0.127, ["museum", "history", "day-trip"]);
const KNEBWORTH = row("kh", "Knebworth House", 51.87, -0.19, ["heritage", "day-trip"]);
const SHEFFIELD = row("sh", "Sheffield Museum", 53.38, -1.47, ["museum", "day-trip"]);
const LOCAL = row("lo", "Barnet Museum", 51.64, -0.2, ["museum"]);

/** A stand-in database: every table answers with canned rows, whatever the filters. */
function fakeDb(profile: Record<string, unknown> | null) {
  const tables: Record<string, unknown[]> = { member_profiles: profile ? [profile] : [], activities: [BRITISH_MUSEUM, KNEBWORTH, SHEFFIELD, LOCAL] };
  return {
    from(table: string) {
      const rows = tables[table] ?? [];
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "not", "gte", "order", "limit", "range"]) chain[m] = () => chain;
      chain.maybeSingle = () => Promise.resolve({ data: rows[0] ?? null, error: null });
      chain.then = (resolve: (v: unknown) => void) => resolve({ data: rows, error: null });
      return chain;
    },
  } as unknown as SupabaseClient;
}
const home = (radius: number | null) => ({ location_lat: BARNET.lat, location_lng: BARNET.lng, travel_radius_km: radius, interests: [] });
const titles = async (profile: Record<string, unknown> | null, options = {}) => (await fetchRankedOpportunities(fakeDb(profile), "m1", options)).candidates.map((c) => c.title).sort();

describe("which places the engine offers", () => {
  it("offers only nearby places in the ordinary way, so a day trip is not an everyday idea", async () => {
    expect(await titles(home(10))).toEqual(["Barnet Museum"]);
  });

  it("offers a day-trip place like any other when it is within their usual distance", async () => {
    expect(await titles(home(20))).toEqual(["Barnet Museum", "British Museum"]);
  });

  it("offers only the day-trip places, up to the day-trip distance, when asked for day trips, whatever their usual distance", async () => {
    expect(await titles(home(5), { dayTrips: true })).toEqual(["British Museum", "Knebworth House"]);
    expect(DAY_TRIP_MAX_KM).toBe(60);
  });

  it("does not show another city's museums as everyday ideas to someone with no position or distance on file", async () => {
    expect(await titles(home(null))).toEqual(["Barnet Museum"]);
    expect(await titles({ location_lat: null, location_lng: null, travel_radius_km: null, interests: [] })).toEqual(["Barnet Museum"]);
  });

  it("has no day trips for someone whose position is not known", async () => {
    expect(await titles({ location_lat: null, location_lng: null, travel_radius_km: 10, interests: [] }, { dayTrips: true })).toEqual([]);
  });

  it("measures from where they are, when they asked for ideas from there", async () => {
    // From Sheffield, the Sheffield museum is a day trip and the London ones are not.
    expect(await titles(home(10), { dayTrips: true, origin: { lat: 53.4, lng: -1.5 } })).toEqual(["Sheffield Museum"]);
  });
});

describe("asking for a day trip", () => {
  it("is a mood they can choose, in the choices and when it arrives from the browser", () => {
    expect(MOOD_OPTIONS.map((m) => m.value)).toContain("daytrip");
    expect(MOOD_LABEL.daytrip).toBe("A day trip");
    expect(parseTimeRequest({ start: "saturday", duration: "all_day", who: "just_me", mood: "daytrip" })?.mood).toBe("daytrip");
  });

  it("makes it a whole day, or what is left of today, whatever length was picked", () => {
    expect(dayTripRequest(request({ start: "saturday", duration: "1-2h" })).duration).toBe("all_day");
    expect(dayTripRequest(request({ start: "now", duration: "30m" })).duration).toBe("rest_of_day");
    const other = request({ mood: "culture", duration: "1-2h" });
    expect(dayTripRequest(other)).toBe(other);
  });

  it("only suits places marked as day trips", () => {
    const tagged = { category: "Explore", tags: ["museum", "day-trip"] };
    const nearby = { category: "Explore", tags: ["museum"] };
    expect(moodBonus("daytrip", tagged)).toBeGreaterThan(moodBonus("daytrip", nearby));
    expect(moodFits("daytrip", tagged)).toBe(true);
    expect(moodFits("daytrip", nearby)).toBe(false);
  });

  it("says plainly when there are none yet, and when that is all there is", () => {
    expect(moodNotice("daytrip", 0)).toMatch(/gathered overnight/);
    expect(moodNotice("daytrip", 2)).toMatch(/every day trip I have/);
    expect(moodNotice("daytrip", 5)).toBeNull();
  });

  const member: MemberContext = { budget_band: null, interests: [], goals: [], dietary: null, mobility_notes: null, travel: { drives: false, uses_public_transport: true, mobility_notes: null }, home: BARNET };
  const candidate = (r: ReturnType<typeof row>) => ({ ...r, price_min: null }) as unknown as OpportunityCandidate;
  const scoringFor = (req: TimeRequest): ScoringInput => {
    const resolved = resolveWindow(req, new Date("2026-10-16T09:00:00Z"));
    if (!resolved.ok) throw new Error(resolved.reason);
    return {
      window: resolved.window,
      request: req,
      member,
      affinity: { categoryScores: {}, tagScores: {}, activityScores: {}, recentCategoryCounts: {} },
      history: EMPTY_HISTORY,
      pleasantWeather: false,
    };
  };

  it("fits in a Saturday with the travel there and back, and says why it was chosen", () => {
    const req = dayTripRequest(request({ start: "saturday" }));
    const e = evaluateCandidate(candidate(BRITISH_MUSEUM), scoringFor(req));
    expect(e).not.toBeNull();
    expect(e!.travelMinutes).toBeGreaterThan(30);
    expect(e!.homeMin).toBeLessThanOrEqual(scoringFor(req).window.endMin);
    expect(e!.reasons.join(" ")).toMatch(/worth a day out/);
  });

  it("does not fit into an afternoon hour, which is why a day trip is always a whole day", () => {
    const short = request({ start: "now", duration: "1-2h", mood: "culture" });
    expect(evaluateCandidate(candidate(BRITISH_MUSEUM), scoringFor(short))).toBeNull();
  });
});

describe("the concierge and day trips", () => {
  it("hears a request for a day out, and nothing else", () => {
    for (const yes of ["Can you suggest a day trip?", "I fancy a day out in London", "somewhere famous to visit", "a day-trip with my sister", "anything touristy?", "let's go up to London", "a whole day somewhere"]) {
      expect(wantsDayTrips(yes), yes).toBe(true);
    }
    for (const no of ["What's on today?", "Find something nearby this afternoon", "Is there a museum near me?", "What's planned this week?"]) {
      expect(wantsDayTrips(no), no).toBe(false);
    }
  });

  it("says how far and how long it takes, as an estimate", () => {
    const text = journeyText(16, { drives: false, uses_public_transport: true, mobility_notes: null });
    expect(text).toMatch(/about 16 km away/);
    expect(text).toMatch(/each way \(an estimate\)/);
    expect(journeyText(null, { drives: null, uses_public_transport: null, mobility_notes: null })).toBe("distance not known");
  });

  it("lists them with ids and journeys, and says plainly when there are none", async () => {
    const withProfile = fakeDb({ ...home(5), drives: false, uses_public_transport: true, mobility_notes: null });
    const text = await dayTripsText(withProfile, "m1", new Set());
    expect(text).toContain("id=bm | British Museum");
    expect(text).toContain("each way (an estimate)");
    expect(text).not.toContain("Barnet Museum");
    expect(text).not.toContain("Sheffield");

    const none = await dayTripsText(fakeDb({ location_lat: 55, location_lng: -3, travel_radius_km: 5, interests: [] }), "m1", new Set());
    expect(none).toMatch(/gathered overnight/);
  });

  it("is put in the instructions only when they ask for a day out", () => {
    const agent = read("src/lib/chat/agent.ts");
    expect(agent).toContain("wantsDayTrips(question) ? await dayTripsText(supabase, memberId, scheduledActivityIds) : \"\"");
    expect(agent).toContain("DAY TRIPS (well-known places further afield");
  });
});
