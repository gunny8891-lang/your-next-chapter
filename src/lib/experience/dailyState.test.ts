import { describe, expect, it } from "vitest";
import { coarseContext, dailyStateAdjustment, describeDailyState, parseDailyState, type DailyState } from "@/lib/experience/dailyState";

const state = (over: Partial<DailyState> = {}): DailyState => ({ energy: "normal", intention: null, indoors: false, lessWalking: false, ...over });

const longWalk = { category: "Move", tags: ["walking", "outdoors", "nature"] };
const gardenStroll = { category: "Explore", tags: ["gardens", "outdoors", "quiet"] };
const museum = { category: "Explore", tags: ["museum", "history", "indoor"] };
const cafe = { category: "Joy", tags: ["cafe", "coffee"] };
const swim = { category: "Move", tags: ["swimming", "fitness"] };

const how = (durationMinutes: number, travelMinutes = 10) => ({ durationMinutes, travelMinutes });

describe("parseDailyState", () => {
  it("accepts the fixed choices, from a form or from a database row", () => {
    expect(parseDailyState({ energy: "low", intention: "outdoors", indoors: true, less_walking: true })).toEqual({
      energy: "low",
      intention: "outdoors",
      indoors: true,
      lessWalking: true,
    });
    expect(parseDailyState({ energy: "high", lessWalking: true })?.lessWalking).toBe(true);
  });

  it("refuses anything that is not one of the fixed choices", () => {
    expect(parseDailyState(null)).toBeNull();
    expect(parseDailyState({ energy: "exhausted" })).toBeNull();
    expect(parseDailyState({ energy: "normal", intention: "<script>" })?.intention).toBeNull();
    expect(parseDailyState({ energy: "normal", indoors: "yes" })?.indoors).toBe(false);
  });
});

describe("dailyStateAdjustment", () => {
  it("changes nothing for someone who has not said how they are", () => {
    expect(dailyStateAdjustment(null, longWalk, how(180))).toEqual({ score: 0, reasons: [], exclude: false });
  });

  it("a normal day changes nothing either", () => {
    expect(dailyStateAdjustment(state(), longWalk, how(180)).score).toBe(0);
  });

  it("does not offer hours of exertion on a day they are taking it easy, and marks a shorter one down", () => {
    const low = state({ energy: "low" });
    expect(dailyStateAdjustment(low, longWalk, how(180)).exclude).toBe(true);
    expect(dailyStateAdjustment(low, longWalk, how(120)).exclude).toBe(false);
    expect(dailyStateAdjustment(low, longWalk, how(120)).score).toBeLessThanOrEqual(-5);
  });

  it("marks a gentle place up for a quiet day", () => {
    const low = state({ energy: "low" });
    const garden = dailyStateAdjustment(low, gardenStroll, how(60));
    expect(garden.score).toBeGreaterThan(0);
    expect(garden.reasons).toContain("it is gentle, for a day you are taking it easy");
  });

  it("is kinder to a short outing than a long one when taking it easy", () => {
    const low = state({ energy: "low" });
    expect(dailyStateAdjustment(low, swim, how(45)).score).toBeGreaterThan(dailyStateAdjustment(low, swim, how(120)).score);
  });

  it("minds a long journey on a low-energy day", () => {
    const low = state({ energy: "low" });
    expect(dailyStateAdjustment(low, cafe, how(45, 50)).score).toBeLessThan(dailyStateAdjustment(low, cafe, how(45, 10)).score);
  });

  it("gives a little to the active and outdoors on an energetic day", () => {
    const high = state({ energy: "high" });
    expect(dailyStateAdjustment(high, longWalk, how(90)).score).toBeGreaterThan(0);
    expect(dailyStateAdjustment(high, museum, how(90)).score).toBe(0);
  });

  it("prefers indoors when they said so, and marks the outdoors down", () => {
    const indoors = state({ indoors: true });
    expect(dailyStateAdjustment(indoors, longWalk, how(90)).score).toBeLessThanOrEqual(-8);
    const m = dailyStateAdjustment(indoors, museum, how(90));
    expect(m.score).toBeGreaterThan(0);
    expect(m.reasons).toContain("it is indoors, as you would like today");
  });

  it("marks down walking, and long journeys, when they would rather not walk much", () => {
    const lessWalking = state({ lessWalking: true });
    expect(dailyStateAdjustment(lessWalking, longWalk, how(60)).score).toBeLessThanOrEqual(-10);
    expect(dailyStateAdjustment(lessWalking, museum, how(60, 40)).score).toBeLessThan(0);
    expect(dailyStateAdjustment(lessWalking, museum, how(60, 10)).score).toBe(0);
  });

  it("is capped, so the penalties cannot run away", () => {
    const everything = state({ energy: "low", indoors: true, lessWalking: true });
    expect(dailyStateAdjustment(everything, longWalk, how(120, 60)).score).toBe(-12);
    expect(dailyStateAdjustment(state({ energy: "low" }), gardenStroll, how(30)).score).toBeLessThanOrEqual(3);
  });
});

describe("describing and storing it", () => {
  it("says it in a sentence for the model", () => {
    expect(describeDailyState(state({ energy: "low", intention: "outdoors", lessWalking: true }))).toBe(
      "taking it easy; would like: get outside; would rather not walk much"
    );
  });

  it("keeps only coarse values with an experience", () => {
    expect(coarseContext(state({ energy: "low", intention: "culture", indoors: true, lessWalking: true }))).toEqual({ energy: "low", intention: "culture" });
    expect(coarseContext(null)).toEqual({});
  });
});
