import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { OpportunityCandidate } from "@/lib/opportunities/engine";
import type { AffinityScores } from "@/lib/memory/scoring";
import { EMPTY_HISTORY, evaluateCandidate, isSessionRule, type MemberContext, type ScoringInput } from "@/lib/someTime/score";
import { clockLabel, resolveWindow, type TimeWindow } from "@/lib/someTime/window";
import { buildUserPrompt } from "@/lib/someTime/prompt";
import { slotsForWindow } from "@/lib/someTime/slots";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

// Friday 9 October 2026, early afternoon in London.
const FRIDAY = new Date("2026-10-09T12:00:00Z");
const BARNET = { lat: 51.65309, lng: -0.2002261 };
const NO_AFFINITY: AffinityScores = { categoryScores: {}, tagScores: {}, activityScores: {}, recentCategoryCounts: {} };
const member: MemberContext = { budget_band: null, interests: [], goals: [], dietary: null, mobility_notes: null, travel: { drives: true, uses_public_transport: null, mobility_notes: null }, home: BARNET };

let n = 0;
const event = (hour: number, minute = 0, date = "2026-10-10", km = 1): OpportunityCandidate => ({
  id: `e${++n}`,
  title: `Event ${n}`,
  description: null,
  category: "Move",
  address: null,
  price_estimate: 0,
  tags: ["walking"],
  rating: null,
  accessibility_notes: null,
  location_lat: BARNET.lat + km / 111,
  location_lng: BARNET.lng,
  booking_url: null,
  // The hour stored is the hour shown (see schedule.ts).
  date_time: `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`,
  expires_at: null,
  recurrence_rule: null,
  duration_minutes: 60,
});

const place = (): OpportunityCandidate => ({ ...event(0), date_time: null, id: `p${++n}`, title: `Place ${n}`, category: "Explore", tags: ["museum"], duration_minutes: 60 });

const windowFor = (start: "now" | "tomorrow" | "saturday" | "sunday", duration: "1-2h" | "half_day" | "all_day" = "half_day"): TimeWindow => {
  const r = resolveWindow({ start, duration }, FRIDAY);
  if (!r.ok) throw new Error(r.reason);
  return r.window;
};

const input = (window: TimeWindow, start: "now" | "tomorrow" | "saturday" = "tomorrow"): ScoringInput => ({
  window,
  request: { start, duration: "half_day", who: "just_me", mood: null, exclude: [] },
  member,
  affinity: NO_AFFINITY,
  history: EMPTY_HISTORY,
  pleasantWeather: false,
});

describe("the window on a day that has not started", () => {
  it("looks at events from seven, though visits to places still start at ten", () => {
    const w = windowFor("saturday");
    expect(w.date).toBe("2026-10-10");
    expect(clockLabel(w.eventsFromMin!)).toBe("07:00");
    expect(clockLabel(w.startMin)).toBe("10:00");
    expect(clockLabel(w.endMin)).toBe("14:00");
  });

  it("is the same for tomorrow and for Sunday", () => {
    expect(windowFor("tomorrow").eventsFromMin).toBe(7 * 60);
    expect(windowFor("sunday").eventsFromMin).toBe(7 * 60);
  });

  it("is unchanged for today: nothing from before now", () => {
    const w = windowFor("now");
    expect(w.eventsFromMin).toBe(w.startMin);
  });
});

describe("events on that day", () => {
  const w = windowFor("saturday");

  it("includes one at eight in the morning, which a ten o'clock start missed", () => {
    expect(evaluateCandidate(event(8), input(w, "saturday"))).not.toBeNull();
  });

  it("includes one at nine (a parkrun) and at nine thirty (a walking group)", () => {
    expect(evaluateCandidate(event(9), input(w, "saturday"))).not.toBeNull();
    expect(evaluateCandidate(event(9, 30), input(w, "saturday"))).not.toBeNull();
  });

  it("includes one at seven, if there is time to get there", () => {
    expect(evaluateCandidate(event(7, 30), input(w, "saturday"))).not.toBeNull();
  });

  it("leaves out one before seven, or one at seven that cannot be reached in time", () => {
    expect(evaluateCandidate(event(6, 30), input(w, "saturday"))).toBeNull();
    // 20 km away takes longer than the minutes between seven and a quarter past.
    expect(evaluateCandidate(event(7, 10, "2026-10-10", 20), input(w, "saturday"))).toBeNull();
  });

  it("still leaves out one on another day, and one that would not be back in time", () => {
    expect(evaluateCandidate(event(8, 0, "2026-10-11"), input(w, "saturday"))).toBeNull();
    expect(evaluateCandidate(event(13, 30), input(w, "saturday"))).toBeNull();
  });

  it("is told the event starts at its own time, in the morning slot", () => {
    const e = evaluateCandidate(event(8), input(w, "saturday"))!;
    expect(e.eventStartMin).toBe(8 * 60);
    expect(slotsForWindow(w, e.eventStartMin)).toEqual(["morning"]);
  });

  it("does not make a place open before it would be: places still start at ten", () => {
    const e = evaluateCandidate(place(), input(w, "saturday"))!;
    expect(e).not.toBeNull();
    expect(clockLabel(e.leaveMin)).toBe("10:00");
  });
});

describe("on today, nothing changes", () => {
  it("does not offer an event that started before now", () => {
    const w: TimeWindow = { date: "2026-10-09", startMin: 13 * 60, endMin: 17 * 60, availableMinutes: 240, minUsefulMinutes: 120 };
    expect(evaluateCandidate(event(9, 0, "2026-10-09"), input(w, "now"))).toBeNull();
  });
});

describe("what is said", () => {
  it("says the span as the one that is looked at, from seven, in the time sheet's line", () => {
    const source = read("src/lib/someTime/recommend.ts");
    expect(source).toContain("clockLabel(window.eventsFromMin ?? window.startMin)");
  });

  it("tells the planner that events from seven are included, only when that is so", () => {
    const base = { weekdayLabel: "Saturday 10 October", request: { start: "saturday", duration: "half_day", who: "just_me", mood: null, exclude: [] }, weatherNote: null, profile: { goals: [], interests: [], budget_band: null, dietary: null, mobility_notes: null, personality: null }, aspirations: [], affinitySummary: "", dailyState: null } as never;
    const later = buildUserPrompt({ ...(base as object), window: windowFor("saturday") } as never, []);
    const today = buildUserPrompt({ ...(base as object), window: windowFor("now") } as never, []);
    expect(later).toContain("Events that start from 07:00 are included.");
    expect(today).not.toContain("Events that start from");
  });
});

describe("a group that meets at set times, like an event", () => {
  const group = (rule: string, over: Partial<OpportunityCandidate> = {}): OpportunityCandidate => ({ ...place(), title: "A group", tags: ["social"], recurrence_rule: rule, duration_minutes: 90, ...over });
  const saturday = windowFor("saturday");

  it("is included at its own time, from the early morning: a Saturday parkrun at nine", () => {
    const e = evaluateCandidate(group("Sa 09:00-10:00"), input(saturday, "saturday"))!;
    expect(e).not.toBeNull();
    expect(e.eventStartMin).toBe(9 * 60);
    expect(e.facts.join(" ")).toContain("meets at 09:00");
  });

  it("is only planned for the part of the day it meets, not an hour or a day it is not on", () => {
    expect(evaluateCandidate(group("Th 14:00-16:00"), input(saturday, "saturday"))).toBeNull();
  });

  it("is on the 2nd Monday and not the 1st (a '2nd and 4th Monday' group)", () => {
    const rule = "Mo[2,4] 10:00-12:00";
    const second: TimeWindow = { date: "2026-10-12", startMin: 600, endMin: 840, eventsFromMin: 420, availableMinutes: 240, minUsefulMinutes: 120 };
    const first: TimeWindow = { ...second, date: "2026-10-05" };
    expect(evaluateCandidate(group(rule), input(second, "tomorrow"))).not.toBeNull();
    expect(evaluateCandidate(group(rule), input(first, "tomorrow"))).toBeNull();
  });

  it("is offered today only if it has not started, and from when they could get there", () => {
    const afternoon = (nowMin: number): TimeWindow => ({ date: "2026-10-08", startMin: nowMin, endMin: nowMin + 240, availableMinutes: 240, minUsefulMinutes: 120 });
    // Thursday 8 October, a group at 14:00.
    expect(evaluateCandidate(group("Th 14:00-16:00"), input(afternoon(13 * 60), "now"))).not.toBeNull();
    expect(evaluateCandidate(group("Th 14:00-16:00"), input(afternoon(14 * 60 + 30), "now"))).toBeNull();
  });

  it("is not made to look like an event for a place with ordinary long hours", () => {
    const museum = evaluateCandidate({ ...place(), recurrence_rule: "Mo-Su 09:00-17:00" }, input(saturday, "saturday"))!;
    expect(museum.eventStartMin).toBeNull();
    expect(clockLabel(museum.leaveMin)).toBe("10:00");
  });

  it("is not suggested before it meets because it is 'open' at ten: a nine o'clock group is over by then", () => {
    // Under the old rule a place arrived at 10:15 was "closed" and dropped; a group is now matched at its own time instead.
    const e = evaluateCandidate(group("Sa 09:00-10:00"), input(saturday, "saturday"))!;
    expect(e.leaveMin).toBeLessThan(10 * 60);
  });
});

describe("telling a group from a place with short opening hours", () => {
  it("takes a few short sessions for a group, and a long day for opening hours", () => {
    expect(isSessionRule("Th 14:00-16:00")).toBe(true);
    expect(isSessionRule("Mo[2,4] 10:00-12:00")).toBe(true);
    expect(isSessionRule("Sa 09:00-10:00")).toBe(true);
    // A café that opens at weekends is somewhere to go at any time it is open, not a meeting.
    expect(isSessionRule("Sa-Su 10:00-16:00")).toBe(false);
    expect(isSessionRule("Mo-Su 09:00-17:00")).toBe(false);
    expect(isSessionRule("Tu-Su 10:00-17:00")).toBe(false);
    expect(isSessionRule(null)).toBe(false);
    expect(isSessionRule("not hours")).toBe(false);
  });

  it("leaves a weekend-only café to be visited at ten, not 'started' at ten sharp", () => {
    const cafe = evaluateCandidate({ ...place(), recurrence_rule: "Sa-Su 10:00-16:00" }, input(windowFor("saturday"), "saturday"))!;
    expect(cafe.eventStartMin).toBeNull();
  });
});
