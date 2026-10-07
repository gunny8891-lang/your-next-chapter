import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { OpportunityCandidate } from "@/lib/opportunities/engine";
import type { AffinityScores } from "@/lib/memory/scoring";
import { buildRecommendations, moodNotice, type Ask, type RecommendInputs } from "@/lib/someTime/recommend";
import { buildUserPrompt, SYSTEM_PROMPT } from "@/lib/someTime/prompt";
import { EMPTY_HISTORY, evaluateCandidate, moodFits } from "@/lib/someTime/score";
import { fallbackExperienceTitle, titleFitsPlan } from "@/lib/someTime/experience";
import { isPerformanceVenue } from "@/lib/opportunities/kinds";
import type { TimeWindow } from "@/lib/someTime/window";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

// Friday 2 October 2026, free 13:10-15:10 (two hours).
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

// The walkthrough's cases: what a "Culture" request was returning, and what should fit it.
const theatre = () => place({ title: "Chickenshed", category: "Joy", tags: ["theatre", "arts"] });
const library = () => place({ title: "East Finchley Library", category: "Learn", tags: ["books", "indoors"] });
const museum = () => place({ title: "Heritage Museum", category: "Explore", tags: ["museum", "history"] });
const leisureCentre = () => place({ title: "Southgate Leisure Centre", category: "Move", tags: ["fitness", "swimming"] });
const communityCentre = () => place({ title: "Green Man Community Centre", category: "Connect", tags: ["community", "social"] });

const answerAll = (): Ask => async () => "";
const inputs = (candidates: OpportunityCandidate[], overrides: Partial<RecommendInputs> = {}): RecommendInputs => ({
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
  ask: null, // no model: the scored fallback, which is what the filter shapes
  ...overrides,
});
const culture = { start: "now", duration: "1-2h", who: "just_me", mood: "culture", exclude: [] } as const;

describe("a mood the member chose is a requirement", () => {
  it("fits what it should, and not what it should not", () => {
    for (const c of [theatre(), library(), museum()]) expect(moodFits("culture", c), c.title).toBe(true);
    for (const c of [leisureCentre(), communityCentre()]) expect(moodFits("culture", c), c.title).toBe(false);
    expect(moodFits("active", leisureCentre())).toBe(true);
    expect(moodFits("social", communityCentre())).toBe(true);
    expect(moodFits("outdoors", place({ category: "Move", tags: ["walking", "nature"] }))).toBe(true);
    expect(moodFits("outdoors", library())).toBe(false);
    expect(moodFits("relaxed", place({ category: "Wellness", tags: ["relaxation"] }))).toBe(true);
  });

  it("is no restriction when no mood was chosen, or for 'surprise me'", () => {
    expect(moodFits(null, leisureCentre())).toBe(true);
    expect(moodFits("surprise", leisureCentre())).toBe(true);
  });

  it("leaves out the leisure centre and the community centre when the request is 'culture'", async () => {
    const { options } = await buildRecommendations(inputs([theatre(), library(), museum(), leisureCentre(), communityCentre()], { request: { ...culture, exclude: [] } }));
    const titles = options.map((o) => o.title).sort();
    expect(titles).toEqual(["Chickenshed", "East Finchley Library", "Heritage Museum"]);
  });

  it("says plainly that there is less to show, when fewer than three things fit", async () => {
    const { options, notice } = await buildRecommendations(inputs([theatre(), leisureCentre(), communityCentre()], { request: { ...culture, exclude: [] } }));
    expect(options.map((o) => o.title)).toEqual(["Chickenshed"]);
    expect(notice).toBe(`That's everything nearby that suits a cultural mood right now. "Surprise me" will show more.`);
  });

  it("says so when nothing fits at all, and offers a way forward", async () => {
    const { options, notice } = await buildRecommendations(inputs([leisureCentre(), communityCentre()], { request: { ...culture, exclude: [] } }));
    expect(options).toEqual([]);
    expect(notice).toBe(`Nothing nearby suits a cultural mood just now. Try "Surprise me", or a different mood.`);
  });

  it("stays quiet when there is plenty, and when no mood was chosen", async () => {
    const plenty = await buildRecommendations(inputs([theatre(), library(), museum(), place({ tags: ["arts"], category: "Learn" })], { request: { ...culture, exclude: [] } }));
    expect(plenty.notice).toBeNull();
    const none = await buildRecommendations(inputs([leisureCentre()]));
    expect(none.notice).toBeNull();
    expect(none.options).toHaveLength(1);
  });

  it("does not turn a mood that only came from how they feel today into a requirement", async () => {
    const { options } = await buildRecommendations(
      inputs([leisureCentre(), communityCentre()], { dailyState: { energy: "normal", intention: "culture", indoors: false, lessWalking: false } })
    );
    // Nothing cultural nearby, yet Today still has something to offer.
    expect(options.length).toBeGreaterThan(0);
  });

  it("words the notice for each mood", () => {
    expect(moodNotice("outdoors", 1)).toMatch(/suits an outdoors mood/);
    expect(moodNotice("active", 0)).toMatch(/suits an active mood/);
    expect(moodNotice("relaxed", 0)).toMatch(/suits a relaxed mood/);
    expect(moodNotice("social", 2)).toMatch(/sociable mood/);
    expect(moodNotice("surprise", 0)).toBeNull();
    expect(moodNotice(null, 0)).toBeNull();
    expect(moodNotice("culture", 3)).toBeNull();
  });
});

describe("a theatre or cinema is a place to check, not a promised show", () => {
  const venue = theatre();

  it("is recognised", () => {
    expect(isPerformanceVenue(venue)).toBe(true);
    expect(isPerformanceVenue(place({ tags: ["cinema"] }))).toBe(true);
    expect(isPerformanceVenue(library())).toBe(false);
  });

  it("is marked 'check what's on' when nothing is listed, and not when it is a dated event", async () => {
    const plain = await buildRecommendations(inputs([venue]));
    expect(plain.options[0].checkWhatsOn).toBe(true);
    const event = place({ title: "A Play in the Park", tags: ["theatre"], date_time: "2026-10-02T13:45:00Z", duration_minutes: 60, km: 1 });
    const dated = await buildRecommendations(inputs([event]));
    expect(dated.options[0].checkWhatsOn).toBe(false);
    expect(dated.options[0].happeningToday).toBe(true);
  });

  it("is not promoted to anything else, such as a museum", async () => {
    const { options } = await buildRecommendations(inputs([museum()]));
    expect(options[0].checkWhatsOn).toBe(false);
  });

  it("gets a title that points at the place, not at a performance", () => {
    const evaluated = evaluateCandidate(venue, {
      window: WINDOW,
      request: { start: "now", duration: "1-2h", who: "just_me", mood: null, exclude: [] },
      member: inputs([]).member,
      affinity: NO_AFFINITY,
      history: EMPTY_HISTORY,
      pleasantWeather: false,
    })!;
    expect(fallbackExperienceTitle(evaluated, null)).toBe("See what's on at Chickenshed");
  });

  it("turns down a model title that describes a show, a film or a night out", () => {
    for (const title of ["An evening of theatre in Cockfosters", "A night out at the theatre", "A trip to the cinema", "Catch a show at Chickenshed", "A film and a late supper", "A proper night out"]) {
      expect(titleFitsPlan(title, true, false, true), title).toBe(false);
    }
    for (const title of ["See what's on at Chickenshed", "A look round the Chickenshed foyer", "An hour in Cockfosters"]) {
      expect(titleFitsPlan(title, true, false, true), title).toBe(true);
    }
  });

  it("still lets a dated event or an ordinary place use words like 'play' and 'film'", () => {
    expect(titleFitsPlan("A play in the park", true, false, false)).toBe(true);
    expect(titleFitsPlan("An evening of theatre in Cockfosters", true, false, false)).toBe(true);
  });

  it("replaces such a model title when the answer comes back", async () => {
    const ask: Ask = async (_s, user) => {
      const id = user.match(/id=([^ ]+) \|/)![1];
      return JSON.stringify({ options: [{ id, title: "An evening of theatre in Cockfosters", why: "A proper night out for your culture mood.", with_food: false }] });
    };
    const { options } = await buildRecommendations(inputs([venue], { ask }));
    expect(options[0].experienceTitle).toBe("See what's on at Chickenshed");
  });

  it("is made plain to the model: the line says venue only, and the rules forbid promising a show", () => {
    const evaluated = evaluateCandidate(venue, {
      window: WINDOW,
      request: { start: "now", duration: "1-2h", who: "just_me", mood: null, exclude: [] },
      member: inputs([]).member,
      affinity: NO_AFFINITY,
      history: EMPTY_HISTORY,
      pleasantWeather: false,
    })!;
    const prompt = buildUserPrompt(
      { window: WINDOW, weekdayLabel: "Friday", request: { start: "now", duration: "1-2h", who: "just_me", mood: null, exclude: [] }, weatherNote: null, profile: inputs([]).profile, aspirations: [], affinitySummary: "none" },
      [{ evaluated, foodStop: null }]
    );
    expect(prompt).toContain("NOTE: a venue only: no show or film is listed for it");
    expect(SYSTEM_PROMPT).toMatch(/a venue only/);
    expect(SYSTEM_PROMPT).toMatch(/Never describe a show, a film, a performance or "a night out"/);
  });

  it("shows the member a 'check what's on' line, with a link to the venue's website when there is one", () => {
    const card = read("src/components/ExperienceCard.tsx");
    expect(card).toContain("option.checkWhatsOn &&");
    expect(card).toContain("Check what&apos;s on before you go.");
    expect(card).toContain("Their website");
  });
});

describe("the notice reaches the member even when some ideas are shown", () => {
  it("Explore and the time sheet both display it alongside results", () => {
    expect(read("src/components/ExploreView.tsx")).toContain("result.options.length > 0 && result.notice &&");
    expect(read("src/components/TimeSheet.tsx")).toContain("{result && result.notice && <p>{result.notice}</p>}");
  });
});

void answerAll;
