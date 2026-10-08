import { describe, expect, it, vi } from "vitest";
import type { OpportunityCandidate } from "@/lib/opportunities/engine";
import type { AffinityScores } from "@/lib/memory/scoring";
import { buildRecommendations, type Ask, type RecommendInputs } from "@/lib/someTime/recommend";
import { buildUserPrompt, fallbackWhy, parseChoices, SYSTEM_PROMPT } from "@/lib/someTime/prompt";
import { EMPTY_HISTORY, evaluateCandidate } from "@/lib/someTime/score";
import type { TimeWindow } from "@/lib/someTime/window";

// Friday 2 October 2026, free 13:10–15:10 (two hours).
const WINDOW: TimeWindow = { date: "2026-10-02", startMin: 13 * 60 + 10, endMin: 15 * 60 + 10, availableMinutes: 120, minUsefulMinutes: 45 };
const BARNET = { lat: 51.65309, lng: -0.2002261 };
const NO_AFFINITY: AffinityScores = { categoryScores: {}, tagScores: {}, activityScores: {}, recentCategoryCounts: {} };

let n = 0;
const place = (overrides: Partial<OpportunityCandidate> & { km?: number } = {}): OpportunityCandidate => {
  const { km = 1.5, ...rest } = overrides;
  return {
    id: `id-${++n}`,
    title: `Place ${n}`,
    description: null,
    category: "Explore",
    address: "Somewhere, Barnet",
    price_estimate: null,
    tags: [],
    rating: null,
    accessibility_notes: null,
    location_lat: BARNET.lat + km / 111,
    location_lng: BARNET.lng,
    booking_url: "https://example.org",
    date_time: null,
    expires_at: null,
    recurrence_rule: null,
    duration_minutes: 45,
    ...rest,
  };
};

const cafeNear = (main: OpportunityCandidate, overrides: Partial<OpportunityCandidate> = {}) =>
  place({
    title: "The Corner Cafe",
    tags: ["food-venue", "cafe", "coffee"],
    duration_minutes: 30,
    location_lat: main.location_lat! + 0.3 / 111,
    location_lng: main.location_lng,
    ...overrides,
  });

const inputs = (candidates: OpportunityCandidate[], ask: Ask | null, overrides: Partial<RecommendInputs> = {}): RecommendInputs => ({
  request: { start: "now", duration: "1-2h", who: "just_me", mood: null, exclude: [] },
  window: WINDOW,
  candidates,
  weatherNote: null,
  pleasantWeather: false,
  member: {
    budget_band: null,
    interests: [],
    goals: [],
    dietary: null,
    mobility_notes: null,
    travel: { drives: true, uses_public_transport: null, mobility_notes: null },
    home: BARNET,
  },
  affinity: NO_AFFINITY,
  history: EMPTY_HISTORY,
  profile: { goals: [], interests: [], budget_band: null, dietary: null, mobility_notes: null, personality: null },
  aspirations: [],
  ask,
  ...overrides,
});

const answer = (options: { id: string; why: string; with_food?: boolean }[]): Ask => async () => JSON.stringify({ options });

describe("parseChoices", () => {
  const valid = new Set(["a", "b", "c", "d"]);
  const withFood = new Set(["a"]);

  it("keeps real ids with a real explanation, and reads food only where it was offered", () => {
    const text = JSON.stringify({ options: [{ id: "a", why: "Nice.", with_food: true }, { id: "b", why: "Good.", with_food: true }] });
    expect(parseChoices(text, valid, withFood)).toEqual([
      { id: "a", why: "Nice.", withFood: true, title: null },
      { id: "b", why: "Good.", withFood: false, title: null }, // b has no food stop, so the model cannot add one
    ]);
  });

  it("drops invented ids, repeats, empty explanations and junk", () => {
    const text = JSON.stringify({
      options: [{ id: "zzz", why: "Invented." }, { id: "a", why: "ok" }, { id: "a", why: "again" }, { id: "b", why: "   " }, null, "x", { why: "no id" }],
    });
    expect(parseChoices(text, valid, withFood).map((c) => c.id)).toEqual(["a"]);
  });

  it("returns at most three", () => {
    const text = JSON.stringify({ options: ["a", "b", "c", "d"].map((id) => ({ id, why: "ok" })) });
    expect(parseChoices(text, valid, withFood)).toHaveLength(3);
  });

  it("copes with prose around the JSON, and with garbage", () => {
    expect(parseChoices('Here you go: {"options":[{"id":"a","why":"ok"}]} hope that helps', valid, withFood)).toHaveLength(1);
    expect(parseChoices("sorry, I cannot help", valid, withFood)).toEqual([]);
    expect(parseChoices("{not json}", valid, withFood)).toEqual([]);
    expect(parseChoices('{"options": "nope"}', valid, withFood)).toEqual([]);
  });

  it("caps the length of an explanation", () => {
    const text = JSON.stringify({ options: [{ id: "a", why: "x".repeat(2000) }] });
    expect(parseChoices(text, valid, withFood)[0].why.length).toBeLessThanOrEqual(420);
  });
});

describe("prompt", () => {
  it("tells the model never to invent, and to use food only when offered", () => {
    expect(SYSTEM_PROMPT).toMatch(/never invent/i);
    expect(SYSTEM_PROMPT).toMatch(/Never set it true without a "then nearby" entry/);
  });

  it("states the window, mood, weather and each candidate's practicalities", () => {
    const main = place({ title: "Barnet Museum", tags: ["museum"], recurrence_rule: "Mo-Fr 10:00-16:30", price_estimate: 0 });
    const cafe = cafeNear(main);
    const request = { start: "now" as const, duration: "1-2h" as const, who: "partner" as const, mood: "culture" as const, exclude: [] };
    const e = evaluateCandidate(main, { window: WINDOW, request, member: inputs([], answer([])).member, affinity: NO_AFFINITY, history: EMPTY_HISTORY, pleasantWeather: false })!;
    const text = buildUserPrompt(
      {
        window: WINDOW,
        weekdayLabel: "Friday 2 October",
        request,
        weatherNote: "Fri 2 Oct: 18°C, 2% chance of rain",
        profile: { goals: ["fitness"], interests: ["history"], budget_band: "medium", dietary: null, mobility_notes: null, personality: "A long walk" },
        aspirations: ["learn photography"],
        affinitySummary: "none",
      },
      [{ evaluated: e, foodStop: { candidate: cafe, distanceMeters: 300, walkMinutes: 5, arriveMin: 860, endMin: 890, homeMin: 905, meal: "coffee and cake", openUntil: 990 } }]
    );
    expect(text).toContain("from 13:10 for about 2 hours");
    expect(text).toContain("their partner");
    expect(text).toContain("Culture / interesting");
    expect(text).toContain("18°C");
    expect(text).toContain("Barnet Museum");
    expect(text).toContain("open until 16:30");
    expect(text).toContain("then nearby: The Corner Cafe (café, 300 m away, coffee and cake, open until 16:30)");
    expect(text).toContain("learn photography");
    expect(text).not.toContain("food-venue");
  });

  it("builds a fallback explanation only from facts it holds", () => {
    const e = evaluateCandidate(place({ category: "Move", tags: ["walking"] }), {
      window: WINDOW,
      request: { start: "now", duration: "1-2h", who: "just_me", mood: null, exclude: [] },
      member: { ...inputs([], answer([])).member, goals: ["fitness"] },
      affinity: NO_AFFINITY,
      history: EMPTY_HISTORY,
      pleasantWeather: false,
    })!;
    const why = fallbackWhy(e);
    expect(why).toMatch(/^It supports your goal of staying active\. It is /);
    expect(why).toMatch(/takes about 45 min\.$/);
  });
});

describe("buildRecommendations", () => {
  it("returns what the model chose, with times worked out and no more than three", async () => {
    const a = place({ title: "A", category: "Explore", tags: ["museum"] });
    const b = place({ title: "B", category: "Move", tags: ["walking"] });
    const c = place({ title: "C", category: "Learn" });
    const d = place({ title: "D", category: "Wellness" });
    const ask = answer([a, b, c, d].map((p) => ({ id: p.id, why: `Because ${p.title}.` })));

    const { options, notice } = await buildRecommendations(inputs([a, b, c, d], ask));

    expect(notice).toBeNull();
    expect(options.map((o) => o.title)).toEqual(["A", "B", "C"]);
    expect(options[0].why).toBe("Because A.");
    expect(options[0].leaveBy).toBe("13:10");
    expect(options[0].durationMinutes).toBe(45);
    expect(options[0].facts.length).toBeGreaterThan(1);
    expect(options[0].foodStop).toBeNull();
  });

  it("never offers anything that does not fit: too long, shut, or an event on another day", async () => {
    const fits = place({ title: "Fits" });
    const tooLong = place({ title: "Too long", duration_minutes: 200 });
    const shut = place({ title: "Shut", recurrence_rule: "Sa-Su 10:00-17:00" });
    const wrongDay = place({ title: "Wrong day", date_time: "2026-10-09T14:00:00Z" });
    const ask = vi.fn(answer([{ id: fits.id, why: "ok" }]));
    await buildRecommendations(inputs([fits, tooLong, shut, wrongDay], ask));
    const prompt = ask.mock.calls[0][1];
    expect(prompt).toContain("Fits");
    expect(prompt).not.toContain("Too long");
    expect(prompt).not.toContain("Shut");
    expect(prompt).not.toContain("Wrong day");
  });

  it("ignores anything the model invents", async () => {
    const real = place({ title: "Real" });
    const { options } = await buildRecommendations(inputs([real], answer([{ id: "made-up", why: "Fake." }, { id: real.id, why: "Real one." }])));
    expect(options.map((o) => o.title)).toEqual(["Real"]);
  });

  it("falls back to the best-scored candidates, with honest explanations, when the model fails", async () => {
    const a = place({ title: "A", category: "Explore" });
    const b = place({ title: "B", category: "Move" });
    const boom: Ask = async () => {
      throw new Error("model down");
    };
    const { options, notice } = await buildRecommendations(inputs([a, b], boom));
    expect(notice).toBeNull();
    expect(options.length).toBe(2);
    for (const o of options) expect(o.why).toMatch(/takes about 45 min\.$/);
  });

  it("also falls back when the reply is unusable", async () => {
    const a = place({ title: "A" });
    const { options } = await buildRecommendations(inputs([a], async () => "I could not decide."));
    expect(options).toHaveLength(1);
  });

  it("says plainly when nothing fits", async () => {
    const ask = vi.fn(answer([]));
    const { options, notice } = await buildRecommendations(inputs([place({ duration_minutes: 400 })], ask));
    expect(options).toEqual([]);
    expect(notice).toMatch(/Nothing nearby fits/);
    expect(ask).not.toHaveBeenCalled(); // no point paying for a model call
  });

  describe("food and drink", () => {
    it("attaches a nearby café to an outing when the model chooses to end there", async () => {
      const museum = place({ title: "Museum", tags: ["museum"], duration_minutes: 45 });
      const cafe = cafeNear(museum);
      const { options } = await buildRecommendations(inputs([museum, cafe], answer([{ id: museum.id, why: "Lovely.", with_food: true }])));
      expect(options).toHaveLength(1);
      expect(options[0].foodStop).toMatchObject({ title: "The Corner Cafe", kind: "café" });
      expect(options[0].foodStop!.walkMinutes).toBeGreaterThan(0);
      // Getting home takes longer once the stop is added.
      const without = await buildRecommendations(inputs([museum, cafe], answer([{ id: museum.id, why: "Lovely.", with_food: false }])));
      expect(without.options[0].foodStop).toBeNull();
      expect(options[0].homeBy > without.options[0].homeBy).toBe(true);
    });

    it("does not let the model add food where none was offered", async () => {
      const museum = place({ title: "Museum" });
      const { options } = await buildRecommendations(inputs([museum], answer([{ id: museum.id, why: "Lovely.", with_food: true }])));
      expect(options[0].foodStop).toBeNull();
    });

    it("does not offer cafés and pubs as the main idea for an ordinary request", async () => {
      const museum = place({ title: "Museum", tags: ["museum"] });
      const cafe = cafeNear(museum);
      const ask = vi.fn(answer([{ id: museum.id, why: "ok" }]));
      await buildRecommendations(inputs([museum, cafe], ask));
      const lines = ask.mock.calls[0][1].split("\n").filter((l: string) => l.startsWith("- id="));
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain("Museum");
    });

    it("offers food and drink venues as the ideas when that is the mood", async () => {
      const museum = place({ title: "Museum", tags: ["museum"] });
      const cafe = cafeNear(museum);
      const { options } = await buildRecommendations(
        inputs([museum, cafe], answer([{ id: cafe.id, why: "A good coffee." }]), {
          request: { start: "now", duration: "1-2h", who: "just_me", mood: "food", exclude: [] },
        })
      );
      expect(options.map((o) => o.title)).toEqual(["The Corner Cafe"]);
      expect(options[0].isFood).toBe(true);
      expect(options[0].foodStop).toBeNull();
    });

    it("offers a quick coffee as the main idea when there is only half an hour", async () => {
      const cafe = place({ title: "Quick Cafe", tags: ["food-venue", "cafe"], duration_minutes: 20, km: 0.1 }); // next door: 3 min each way, so 26 of the 30 minutes
      const museum = place({ title: "Museum", duration_minutes: 90 });
      const short: TimeWindow = { ...WINDOW, endMin: WINDOW.startMin + 30, availableMinutes: 30, minUsefulMinutes: 15 };
      const { options } = await buildRecommendations(inputs([museum, cafe], answer([{ id: cafe.id, why: "Just right." }]), { window: short }));
      expect(options.map((o) => o.title)).toEqual(["Quick Cafe"]);
    });

    it("never recommends a place to eat that is shut or out of mealtime", async () => {
      const cafe = place({ title: "Shut Cafe", tags: ["food-venue", "cafe"], recurrence_rule: "Mo-Fr 07:00-12:00" });
      const { options, notice } = await buildRecommendations(
        inputs([cafe], answer([{ id: cafe.id, why: "x" }]), { request: { start: "now", duration: "1-2h", who: "just_me", mood: "food", exclude: [] } })
      );
      expect(options).toEqual([]);
      expect(notice).toBeTruthy();
    });
  });

  it("makes a happening-today event stand out, and says so", async () => {
    const event = place({ title: "Talk", date_time: "2026-10-02T13:45:00Z", duration_minutes: 60, km: 1 });
    const { options } = await buildRecommendations(inputs([event], answer([{ id: event.id, why: "On today." }])));
    expect(options[0].happeningToday).toBe(true);
    expect(options[0].facts).toContain("starts 13:45");
  });
});

describe("what is and is not offered as 'some time right now'", () => {
  it("does not offer a volunteering role, which is something to sign up to, not drop into", async () => {
    const role = place({ title: "Befriending Volunteer", category: "Give Back" });
    const walk = place({ title: "Park", category: "Move", tags: ["walking"] });
    const ask = vi.fn(answer([{ id: walk.id, why: "ok" }]));
    await buildRecommendations(inputs([role, walk], ask));
    expect(ask.mock.calls[0][1]).not.toContain("Befriending Volunteer");
  });

  it("does offer a volunteering session that is actually happening today", async () => {
    const session = place({ title: "Community litter pick", category: "Give Back", date_time: "2026-10-02T13:45:00Z", duration_minutes: 60, km: 1 });
    const { options } = await buildRecommendations(inputs([session], answer([{ id: session.id, why: "On today." }])));
    expect(options.map((o) => o.title)).toEqual(["Community litter pick"]);
  });

  it("logs, rather than hides, a model reply it could not use", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await buildRecommendations(inputs([place({ title: "A" })], async () => '{"options": [{"id": "x", "why": "cut off mid-'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("fallback"));
    warn.mockRestore();
  });
});

describe("without a model (the Today hero)", () => {
  it("builds options from the scoring alone, and never calls a model", async () => {
    const a = place({ title: "A", category: "Move", tags: ["walking"] });
    const b = place({ title: "B", category: "Explore", tags: ["museum"] });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { options } = await buildRecommendations(inputs([a, b], null));
    expect(options.length).toBe(2);
    for (const o of options) expect(o.why).toMatch(/takes about 45 min\.$/);
    // Choosing not to use a model is not a failure, so nothing is logged as one.
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("gives each option a short natural reason and an indoor or outdoor setting", async () => {
    const park = place({ title: "Park", category: "Move", tags: ["walking", "outdoors"] });
    const museum = place({ title: "Museum", category: "Explore", tags: ["museum"] });
    const base = inputs([park, museum], null);
    const { options } = await buildRecommendations({
      ...base,
      pleasantWeather: true,
      member: { ...base.member, goals: ["fitness"] },
    });
    const byTitle = Object.fromEntries(options.map((o) => [o.title, o]));
    expect(byTitle.Park.setting).toBe("outdoors");
    // Why now comes first: the weather, then what suits them in general.
    expect(byTitle.Park.reason).toBe("It is perfect weather for it today, and it supports your goal of staying active.");
    expect(byTitle.Museum.setting).toBe("indoors");
    expect(byTitle.Museum.reason).toBe("");
  });
});
