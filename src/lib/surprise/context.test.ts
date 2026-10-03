import { describe, expect, it } from "vitest";
import { applyOpenTimeContext, describeWindow, parseSlot, windowDates, type OpenTimeContext } from "@/lib/surprise/context";
import { isWetDay, parseForecast, type DayForecast } from "@/lib/nudges/weather";

// Friday 2 October 2026.
const TODAY = "2026-10-02";

type Candidate = { id: string; tags: string[]; date_time: string | null; expires_at: string | null };
const standing = (id: string, tags: string[] = []): Candidate => ({ id, tags, date_time: null, expires_at: null });
const event = (id: string, date_time: string, tags: string[] = []): Candidate => ({ id, tags, date_time, expires_at: null });
const run = (id: string, expires_at: string, tags: string[] = []): Candidate => ({ id, tags, date_time: null, expires_at });

const dry: DayForecast[] = [{ date: TODAY, precipitationProbabilityMax: 10, temperatureMax: 15 }];
const wet: DayForecast[] = [{ date: TODAY, precipitationProbabilityMax: 80, temperatureMax: 11 }];

const ctx = (overrides: Partial<OpenTimeContext> = {}): OpenTimeContext => ({
  when: "today",
  who: "just_me",
  slot: null,
  today: TODAY,
  forecast: null,
  ...overrides,
});

const ids = (list: { id: string }[]) => list.map((c) => c.id);

describe("windowDates", () => {
  it("covers a single day for today and tomorrow", () => {
    expect(windowDates("today", TODAY)).toEqual(["2026-10-02"]);
    expect(windowDates("tomorrow", TODAY)).toEqual(["2026-10-03"]);
  });

  it("finds the coming weekend from a weekday", () => {
    expect(windowDates("weekend", "2026-09-28")).toEqual(["2026-10-03", "2026-10-04"]); // Monday
    expect(windowDates("weekend", TODAY)).toEqual(["2026-10-03", "2026-10-04"]); // Friday
  });

  it("means what is left of the weekend when asked during it", () => {
    expect(windowDates("weekend", "2026-10-03")).toEqual(["2026-10-03", "2026-10-04"]); // Saturday
    expect(windowDates("weekend", "2026-10-04")).toEqual(["2026-10-04"]); // Sunday
  });

  it("describes a window for the prompt", () => {
    expect(describeWindow(["2026-10-03", "2026-10-04"])).toBe("Sat 3 Oct and Sun 4 Oct");
  });
});

describe("parseSlot", () => {
  it("accepts real slots and nothing else (the value comes from the browser)", () => {
    expect(parseSlot("afternoon")).toBe("afternoon");
    expect(parseSlot("midnight")).toBeNull();
    expect(parseSlot(undefined)).toBeNull();
    expect(parseSlot({ evil: true })).toBeNull();
  });
});

describe("applyOpenTimeContext — dates", () => {
  it("drops an event that is not on a requested day (the 'a talk three weeks away, suggested for today' bug)", () => {
    const { candidates } = applyOpenTimeContext(
      [event("later", "2026-10-23T10:30:00Z"), event("today", "2026-10-02T15:00:00Z"), standing("park")],
      ctx()
    );
    expect(ids(candidates)).not.toContain("later");
    expect(ids(candidates)).toEqual(expect.arrayContaining(["today", "park"]));
  });

  it("brings events happening in the window to the front", () => {
    const { candidates } = applyOpenTimeContext(
      [standing("a"), standing("b"), event("today", "2026-10-02T15:00:00Z")],
      ctx()
    );
    expect(candidates[0].id).toBe("today");
  });

  it("only offers events in the free part of the day", () => {
    const list = [event("morning", "2026-10-02T10:30:00Z"), event("afternoon", "2026-10-02T14:00:00Z"), standing("park")];
    expect(ids(applyOpenTimeContext(list, ctx({ slot: "afternoon" })).candidates)).toEqual(["afternoon", "park"]);
    expect(ids(applyOpenTimeContext(list, ctx({ slot: "evening" })).candidates)).toEqual(["park"]);
  });

  it("covers a whole weekend", () => {
    const list = [event("sat", "2026-10-03T11:00:00Z"), event("sun", "2026-10-04T11:00:00Z"), event("mon", "2026-10-05T11:00:00Z")];
    expect(ids(applyOpenTimeContext(list, ctx({ when: "weekend" })).candidates)).toEqual(["sat", "sun"]);
  });

  it("keeps a run that is still on and drops one that has ended", () => {
    const { candidates } = applyOpenTimeContext([run("on", "2026-11-01T23:59:59Z"), run("over", "2026-10-01T23:59:59Z")], ctx());
    expect(ids(candidates)).toEqual(["on"]);
  });

  it("drops a run that will have ended before a future request", () => {
    // Ends Friday; asked about the weekend.
    const { candidates } = applyOpenTimeContext([run("ends-friday", "2026-10-02T23:59:59Z")], ctx({ when: "weekend" }));
    expect(candidates).toEqual([]);
  });
});

describe("applyOpenTimeContext — weather", () => {
  const outdoors = standing("walk", ["walking", "outdoors"]);
  const indoors = standing("library", ["books"]);

  it("removes outdoor options when every requested day is wet", () => {
    const { candidates, weatherNote } = applyOpenTimeContext([outdoors, indoors], ctx({ forecast: wet }));
    expect(ids(candidates)).toEqual(["library"]);
    expect(weatherNote).toMatch(/80% chance of rain/);
    expect(weatherNote).toMatch(/outdoor options have been removed/);
  });

  it("keeps outdoor options in dry weather", () => {
    const { candidates, weatherNote } = applyOpenTimeContext([outdoors, indoors], ctx({ forecast: dry }));
    expect(ids(candidates)).toEqual(["walk", "library"]);
    expect(weatherNote).not.toMatch(/removed/);
  });

  it("keeps outdoor options if only some of the weekend is wet", () => {
    const forecast: DayForecast[] = [
      { date: "2026-10-03", precipitationProbabilityMax: 90, temperatureMax: 10 },
      { date: "2026-10-04", precipitationProbabilityMax: 5, temperatureMax: 14 },
    ];
    expect(ids(applyOpenTimeContext([outdoors, indoors], ctx({ when: "weekend", forecast })).candidates)).toEqual(["walk", "library"]);
  });

  it("ignores weather entirely when there is no forecast", () => {
    const { candidates, weatherNote } = applyOpenTimeContext([outdoors, indoors], ctx({ forecast: null }));
    expect(ids(candidates)).toEqual(["walk", "library"]);
    expect(weatherNote).toBeNull();
  });

  it("ignores forecast days outside the window", () => {
    const forecast: DayForecast[] = [{ date: "2026-10-09", precipitationProbabilityMax: 100, temperatureMax: 9 }];
    expect(ids(applyOpenTimeContext([outdoors], ctx({ forecast })).candidates)).toEqual(["walk"]);
  });
});

describe("applyOpenTimeContext — who", () => {
  const playground = standing("playground", ["playground", "grandchildren"]);
  const soft = standing("soft-play", ["grandchildren"]);
  const museum = standing("museum");

  it("offers playgrounds only for a family outing", () => {
    expect(ids(applyOpenTimeContext([playground, museum], ctx({ who: "just_me" })).candidates)).toEqual(["museum"]);
    expect(ids(applyOpenTimeContext([playground, museum], ctx({ who: "friends" })).candidates)).toEqual(["museum"]);
    expect(ids(applyOpenTimeContext([playground, museum], ctx({ who: "family" })).candidates)).toContain("playground");
  });

  it("puts family-suited places first for a family outing, so the shortlist can't cut them off", () => {
    const many = Array.from({ length: 30 }, (_, i) => standing(`other-${i}`));
    const { candidates } = applyOpenTimeContext([...many, soft], ctx({ who: "family" }));
    expect(candidates[0].id).toBe("soft-play");
  });
});

describe("weather parsing", () => {
  it("turns an Open-Meteo response into per-date forecasts, skipping incomplete days", () => {
    const days = parseForecast({
      daily: {
        time: ["2026-10-02", "2026-10-03", "2026-10-04"],
        precipitation_probability_max: [10, null, 70],
        temperature_2m_max: [15.2, 12, 9.5],
      },
    });
    expect(days).toEqual([
      { date: "2026-10-02", precipitationProbabilityMax: 10, temperatureMax: 15.2 },
      { date: "2026-10-04", precipitationProbabilityMax: 70, temperatureMax: 9.5 },
    ]);
  });

  it("copes with an empty response", () => {
    expect(parseForecast({})).toEqual([]);
  });

  it("calls 60% or more a wet day", () => {
    expect(isWetDay({ precipitationProbabilityMax: 59 })).toBe(false);
    expect(isWetDay({ precipitationProbabilityMax: 60 })).toBe(true);
  });
});

describe("applyOpenTimeContext — venues for children", () => {
  const withTitle = (title: string, tags: string[]) => ({ id: title, title, tags, date_time: null, expires_at: null });
  const softPlay = withTitle("Toddlers World Soft Play - Barnet", ["grandchildren"]);
  const park = withTitle("Arkley Lane Pastures", ["walking", "outdoors", "grandchildren"]);

  it("does not offer a soft play centre to someone going alone, with a partner or with friends", () => {
    for (const who of ["just_me", "partner", "friends"] as const) {
      const titles = applyOpenTimeContext([softPlay, park], ctx({ who })).candidates.map((c) => c.id);
      expect(titles).toEqual(["Arkley Lane Pastures"]);
    }
  });

  it("does offer it for a family outing", () => {
    const titles = applyOpenTimeContext([softPlay, park], ctx({ who: "family" })).candidates.map((c) => c.id);
    expect(titles).toContain("Toddlers World Soft Play - Barnet");
  });

  it("keeps a park that merely carries the grandchildren tag", () => {
    expect(applyOpenTimeContext([park], ctx({ who: "just_me" })).candidates).toHaveLength(1);
  });
});
