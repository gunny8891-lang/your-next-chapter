import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { availableStarts, durationOptionsFor, exploreDays, exploreDurationFor, startLabel, summaryLine, TOMORROW_DURATION_OPTIONS } from "@/lib/someTime/choices";
import { humanReason } from "@/lib/someTime/copy";
import { isLaterDay, parseTimeRequest } from "@/lib/someTime/request";
import { clockLabel, dayWordFor, laterStartsFrom, onDay, resolveWindow } from "@/lib/someTime/window";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

// Times are London (BST until 25 October 2026, so noon UTC is 13:00).
const MONDAY = "2026-10-05";
const WEDNESDAY = "2026-10-07";
const FRIDAY = "2026-10-09";
const SATURDAY = "2026-10-10";
const SUNDAY = "2026-10-11";
const at = (date: string) => new Date(`${date}T12:00:00Z`);

describe("which days are offered beyond tomorrow", () => {
  it("offers both weekend days in midweek", () => {
    expect(laterStartsFrom(MONDAY).map((d) => d.value)).toEqual(["saturday", "sunday"]);
    expect(laterStartsFrom(WEDNESDAY).map((d) => d.value)).toEqual(["saturday", "sunday"]);
  });

  it("offers only Sunday on a Friday, because Saturday is tomorrow", () => {
    expect(laterStartsFrom(FRIDAY).map((d) => d.value)).toEqual(["sunday"]);
  });

  it("offers nothing on the weekend itself, where it is today or tomorrow", () => {
    expect(laterStartsFrom(SATURDAY)).toEqual([]);
    expect(laterStartsFrom(SUNDAY)).toEqual([]);
  });

  it("is carried into the choices on Today and in Explore", () => {
    expect(availableStarts(10, WEDNESDAY).map((s) => s.value)).toEqual(["now", "afternoon", "evening", "tomorrow", "saturday", "sunday"]);
    expect(availableStarts(10).map((s) => s.value)).toEqual(["now", "afternoon", "evening", "tomorrow"]);
    expect(exploreDays(10, WEDNESDAY).map((d) => d.label)).toEqual(["Today", "Tomorrow", "Saturday", "Sunday"]);
  });

  it("leaves out Today in Explore once it is too late for anything", () => {
    expect(exploreDays(21, WEDNESDAY).map((d) => d.label)).toEqual(["Tomorrow", "Saturday", "Sunday"]);
  });
});

describe("a weekend day as the time to look at", () => {
  it("is the coming Saturday from ten in the morning, whatever time it is now", () => {
    const r = resolveWindow({ start: "saturday", duration: "half_day" }, at(WEDNESDAY));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.window.date).toBe(SATURDAY);
    expect(clockLabel(r.window.startMin)).toBe("10:00");
    expect(clockLabel(r.window.endMin)).toBe("14:00");
  });

  it("is the coming Sunday, over a month end", () => {
    const r = resolveWindow({ start: "sunday", duration: "all_day" }, new Date("2026-10-28T12:00:00Z"));
    expect(r.ok && r.window.date).toBe("2026-11-01");
  });

  it("is the same day when that day is today: simply today, from now", () => {
    const r = resolveWindow({ start: "saturday", duration: "1-2h" }, at(SATURDAY));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.window.date).toBe(SATURDAY);
    expect(clockLabel(r.window.startMin)).toBe("13:00");
  });

  it("is available late at night, when today has nothing left", () => {
    const lateNight = new Date("2026-10-07T21:50:00Z");
    expect(resolveWindow({ start: "now", duration: "1-2h" }, lateNight).ok).toBe(false);
    expect(resolveWindow({ start: "saturday", duration: "1-2h" }, lateNight).ok).toBe(true);
  });

  it("has no 'until my next thing': that is about the day they are in", () => {
    const r = resolveWindow({ start: "saturday", duration: "until_next", untilMin: 12 * 60 }, at(WEDNESDAY));
    expect(r.ok && r.window.availableMinutes).not.toBe(2 * 60);
  });

  it("is a request the server accepts, and an unknown day is not", () => {
    expect(parseTimeRequest({ start: "saturday", duration: "half_day", who: "just_me" })?.start).toBe("saturday");
    expect(parseTimeRequest({ start: "sunday", duration: "half_day", who: "just_me" })?.start).toBe("sunday");
    expect(parseTimeRequest({ start: "monday", duration: "half_day", who: "just_me" })).toBeNull();
  });

  it("offers the lengths of time that suit a day that has not started, and is browsed as half a day", () => {
    expect(isLaterDay("saturday")).toBe(true);
    expect(isLaterDay("now")).toBe(false);
    expect(durationOptionsFor("sunday")).toBe(TOMORROW_DURATION_OPTIONS);
    expect(exploreDurationFor("saturday", 18)).toBe("half_day");
    expect(exploreDurationFor("now", 18)).toBe("rest_of_day");
    expect(exploreDurationFor("now", 10)).toBe("half_day");
  });

  it("is labelled in plain words", () => {
    expect(startLabel("saturday")).toBe("Saturday");
    expect(summaryLine({ duration: "half_day", start: "sunday" })).toBe("Half a day · Sunday");
  });
});

describe("what the day is called", () => {
  it("says today, tomorrow, or the name of the day", () => {
    expect(dayWordFor(WEDNESDAY, WEDNESDAY)).toBe("today");
    expect(dayWordFor("2026-10-08", WEDNESDAY)).toBe("tomorrow");
    expect(dayWordFor(SATURDAY, WEDNESDAY)).toBe("Saturday");
    expect(dayWordFor(SUNDAY, WEDNESDAY)).toBe("Sunday");
  });

  it("reads right in a sentence", () => {
    expect(onDay("today")).toBe("today");
    expect(onDay("tomorrow")).toBe("tomorrow");
    expect(onDay("Saturday")).toBe("on Saturday");
  });

  it("makes the reasons shown for a weekend idea true of that day", () => {
    expect(humanReason(["it is actually happening on Saturday"])).toBe("It is on Saturday.");
    expect(humanReason(["the weather suits being outdoors on Saturday"])).toBe("It should be good weather for it on Saturday.");
    expect(humanReason(["the weather suits being outdoors tomorrow"])).toBe("It should be good weather for it tomorrow.");
    expect(humanReason(["the weather suits being outdoors"])).toBe("It is perfect weather for it today.");
  });
});

describe("where it shows", () => {
  it("has a When row in Explore, and plans a found idea for the day it was found for", () => {
    const explore = read("src/components/ExploreView.tsx");
    expect(explore).toContain('aria-labelledby="when"');
    expect(explore).toContain("plan(option.id, option.foodStop?.id, when)");
    expect(explore).toContain("exploreDurationFor(day, londonHour())");
  });

  it("looks at the forecast for the days ahead, not just two", () => {
    expect(read("src/lib/someTime/recommend.ts")).toContain("getDailyForecast(profile!.location_lat, profile!.location_lng, 7)");
  });
});

describe("the wait for ideas", () => {
  it("is kept short by not letting the model deliberate over choosing three of eight", () => {
    expect(read("src/lib/someTime/recommend.ts")).toContain('thinking: { type: "disabled" }');
  });
});

describe("the Explore heading", () => {
  it("keeps a day's name capitalised in the sentence, and not 'Today' or 'Tomorrow'", () => {
    const explore = read("src/components/ExploreView.tsx");
    expect(explore).toContain("dayInSentence(");
    expect(explore).toMatch(/label === "Today" \|\| label === "Tomorrow" \? label\.toLowerCase\(\)/);
  });
});
