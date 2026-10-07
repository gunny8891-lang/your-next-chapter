import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { OpportunityCandidate } from "@/lib/opportunities/engine";
import type { AffinityScores } from "@/lib/memory/scoring";
import { buildRecommendations, type Ask, type RecommendInputs } from "@/lib/someTime/recommend";
import { SYSTEM_PROMPT } from "@/lib/someTime/prompt";
import { EMPTY_HISTORY } from "@/lib/someTime/score";
import { PLAIN_WORDS_RULE, containsJargon } from "@/lib/ai/plainWords";
import type { TimeWindow } from "@/lib/someTime/window";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("talking like a person, not like the app's internals", () => {
  it("spots the word 'category' in a sentence for a member", () => {
    expect(containsJargon("Connect is a category you have not touched lately, and this community centre is an easy 30 minutes away.")).toBe(true);
    expect(containsJargon("You haven't tried anything in the Learn category recently.")).toBe(true);
    expect(containsJargon("Nice mix across all seven categories.")).toBe(true);
    expect(containsJargon("It supports your goal of staying active.")).toBe(false);
    expect(containsJargon("A friendly, sociable hour at the community centre.")).toBe(false);
    expect(containsJargon("")).toBe(false);
  });

  it("tells the model to say it in plain words, with examples", () => {
    expect(PLAIN_WORDS_RULE).toMatch(/never use the word "category"/);
    for (const label of ["Move", "Connect", "Learn", "Explore", "Give Back", "Wellness", "Joy"]) expect(PLAIN_WORDS_RULE).toContain(label);
    expect(PLAIN_WORDS_RULE).toMatch(/something social/);
  });

  it("is in every prompt that writes sentences members read: suggestions, the weekly plan, and the concierge", () => {
    expect(SYSTEM_PROMPT).toContain(PLAIN_WORDS_RULE);
    expect(read("src/lib/itinerary/agent.ts")).toContain("${PLAIN_WORDS_RULE}");
    expect(read("src/lib/chat/agent.ts")).toContain("${PLAIN_WORDS_RULE}");
  });
});

describe("an explanation that still talks like the internals is replaced", () => {
  const WINDOW: TimeWindow = { date: "2026-10-02", startMin: 13 * 60 + 10, endMin: 15 * 60 + 10, availableMinutes: 120, minUsefulMinutes: 45 };
  const BARNET = { lat: 51.65309, lng: -0.2002261 };
  const NO_AFFINITY: AffinityScores = { categoryScores: {}, tagScores: {}, activityScores: {}, recentCategoryCounts: {} };
  const centre: OpportunityCandidate = {
    id: "centre-1",
    title: "Green Man Community Centre",
    description: null,
    category: "Connect",
    address: "Fallow Corner, Barnet",
    price_estimate: null,
    tags: ["community", "social"],
    rating: null,
    accessibility_notes: null,
    location_lat: BARNET.lat + 1.5 / 111,
    location_lng: BARNET.lng,
    booking_url: null,
    date_time: null,
    expires_at: null,
    recurrence_rule: null,
    duration_minutes: 60,
  };
  const inputs = (ask: Ask): RecommendInputs => ({
    request: { start: "now", duration: "1-2h", who: "just_me", mood: null, exclude: [] },
    window: WINDOW,
    candidates: [centre],
    weatherNote: null,
    pleasantWeather: false,
    member: { budget_band: null, interests: [], goals: [], dietary: null, mobility_notes: null, travel: { drives: true, uses_public_transport: null, mobility_notes: null }, home: BARNET },
    affinity: NO_AFFINITY,
    history: EMPTY_HISTORY,
    profile: { goals: [], interests: [], budget_band: null, dietary: null, mobility_notes: null, personality: null },
    aspirations: [],
    ask,
  });

  it("swaps a model sentence that says 'category' for one built from the facts", async () => {
    const ask: Ask = async () => JSON.stringify({ options: [{ id: "centre-1", title: "A sociable hour", why: "Connect is a category you have not touched lately, so this community centre is a change of pace.", with_food: false }] });
    const { options } = await buildRecommendations(inputs(ask));
    expect(options[0].why).not.toMatch(/category/i);
    expect(options[0].why).toMatch(/minute/);
  });

  it("keeps a model sentence that is in plain words", async () => {
    const plain = "A friendly place to be around other people at your own pace, just a short drive away.";
    const ask: Ask = async () => JSON.stringify({ options: [{ id: "centre-1", title: "A sociable hour", why: plain, with_food: false }] });
    const { options } = await buildRecommendations(inputs(ask));
    expect(options[0].why).toBe(plain);
  });
});
