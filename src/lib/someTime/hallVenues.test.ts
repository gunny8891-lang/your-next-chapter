import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { OpportunityCandidate } from "@/lib/opportunities/engine";
import type { AffinityScores } from "@/lib/memory/scoring";
import { isHallVenue, isPerformanceVenue, isVenueOnly } from "@/lib/opportunities/kinds";
import { classifyPlace, type NominatimPlace } from "@/lib/discovery/sources/openStreetMap";
import { buildRecommendations, type RecommendInputs } from "@/lib/someTime/recommend";
import { buildUserPrompt } from "@/lib/someTime/prompt";
import { EMPTY_HISTORY, evaluateCandidate } from "@/lib/someTime/score";
import type { TimeWindow } from "@/lib/someTime/window";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("a building with nothing listed in it", () => {
  it("is a hall, a theatre or a cinema, and nothing else", () => {
    expect(isHallVenue({ tags: ["community", "social", "community-centre"] })).toBe(true);
    expect(isVenueOnly({ tags: ["community-centre"] })).toBe(true);
    expect(isVenueOnly({ tags: ["theatre"] })).toBe(true);
    expect(isVenueOnly({ tags: ["cinema"] })).toBe(true);
    // A named group or class that meets in a hall is an activity, even though it is tagged as community and social.
    expect(isVenueOnly({ tags: ["u3a", "community", "social"] })).toBe(false);
    expect(isHallVenue({ tags: ["theatre"] })).toBe(false);
    expect(isPerformanceVenue({ tags: ["community-centre"] })).toBe(false);
  });

  it("is how new community centres from OpenStreetMap are tagged", () => {
    expect(read("src/lib/discovery/sources/openStreetMap.ts")).toContain('tags: ["community", "social", "community-centre"]');
  });

  it("is kept out of the weekly plan, which is made of things worth a morning", () => {
    expect(read("src/lib/itinerary/agent.ts")).toContain("!isHallVenue(a) &&");
  });
});

describe("private clubs, however the name is written", () => {
  const sports = (name: string): NominatimPlace => ({ name, category: "leisure", type: "sports_centre", lat: "51.9", lon: "-0.2", extratags: { opening_hours: "Mo-Su 06:00-22:00" } });

  it("leaves out a members' club whether the name says Club or Clubs", () => {
    expect(classifyPlace(sports("David Lloyd Clubs"), "sports centre")).toBeNull();
    expect(classifyPlace(sports("Riverside Tennis Club"), "sports centre")).toBeNull();
  });

  it("still keeps a public leisure centre", () => {
    expect(classifyPlace(sports("Southgate Leisure Centre"), "sports centre")).toBe("sports_centre");
  });
});

// ---- what a member is shown -----------------------------------------------------------

const WINDOW: TimeWindow = { date: "2026-10-10", startMin: 10 * 60, endMin: 14 * 60, availableMinutes: 240, minUsefulMinutes: 90 };
const HOME = { lat: 51.9253, lng: -0.0895 };
const NO_AFFINITY: AffinityScores = { categoryScores: {}, tagScores: {}, activityScores: {}, recentCategoryCounts: {} };
const hall = (): OpportunityCandidate => ({
  id: "hall-1", title: "Cottered Village Hall", description: null, category: "Connect", address: "Cottered", price_estimate: null,
  tags: ["community", "social", "community-centre"], rating: null, accessibility_notes: null, location_lat: HOME.lat + 0.02, location_lng: HOME.lng,
  booking_url: "https://www.openstreetmap.org/way/1", date_time: null, expires_at: null, recurrence_rule: null, duration_minutes: 60,
});
const member = { budget_band: null, interests: [], goals: [], dietary: null, mobility_notes: null, travel: { drives: true, uses_public_transport: null, mobility_notes: null }, home: HOME };
const inputs = (candidates: OpportunityCandidate[]): RecommendInputs => ({
  request: { start: "now", duration: "half_day", who: "just_me", mood: null, exclude: [] },
  window: WINDOW, candidates, weatherNote: null, pleasantWeather: false, daylight: { sunriseMin: 420, sunsetMin: 1080 }, member, affinity: NO_AFFINITY,
  history: EMPTY_HISTORY, profile: { goals: [], interests: [], budget_band: null, dietary: null, mobility_notes: null, personality: null }, aspirations: [], ask: null,
});

describe("a hall offered in 'I've got some time'", () => {
  it("says to check what is on, and does not call it an activity", async () => {
    const { options } = await buildRecommendations(inputs([hall()]));
    expect(options).toHaveLength(1);
    expect(options[0].checkWhatsOn).toBe(true);
    expect(options[0].experienceTitle).toBe("See what's on at Cottered Village Hall");
  });

  it("tells the model it is a venue only, with no class or group listed", () => {
    const e = evaluateCandidate(hall(), { window: WINDOW, request: { start: "now", duration: "half_day", who: "just_me", mood: null, exclude: [] }, member, affinity: NO_AFFINITY, history: EMPTY_HISTORY, pleasantWeather: false })!;
    const prompt = buildUserPrompt(
      { window: WINDOW, weekdayLabel: "Saturday", request: { start: "now", duration: "half_day", who: "just_me", mood: null, exclude: [] }, weatherNote: null, profile: inputs([]).profile, aspirations: [], affinitySummary: "" },
      [{ evaluated: e, foodStop: null }]
    );
    expect(prompt).toContain("NOTE: a venue only: no class or group is listed for it");
  });
});
