import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { visibleSlots } from "@/lib/experience/daySlots";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const day = (items: Partial<Record<string, string>> = {}) => ["morning", "afternoon", "evening"].map((slot) => ({ slot, item: items[slot] ?? null }));
const at = (hour: number, minute = 0) => hour * 60 + minute;
const names = (slots: { slot: string }[]) => slots.map((s) => s.slot);

describe("which parts of the day Today still offers", () => {
  it("offers all three in the early morning", () => {
    expect(names(visibleSlots(day(), at(7)))).toEqual(["morning", "afternoon", "evening"]);
  });

  it("drops a free morning once it is noon, then a free afternoon at five", () => {
    expect(names(visibleSlots(day(), at(11, 59)))).toEqual(["morning", "afternoon", "evening"]);
    expect(names(visibleSlots(day(), at(12)))).toEqual(["afternoon", "evening"]);
    expect(names(visibleSlots(day(), at(16, 59)))).toEqual(["afternoon", "evening"]);
    expect(names(visibleSlots(day(), at(17, 25)))).toEqual(["evening"]);
  });

  it("leaves nothing to offer late at night", () => {
    expect(visibleSlots(day(), at(22))).toEqual([]);
    expect(visibleSlots(day(), at(23, 30))).toEqual([]);
  });

  it("always keeps a part of the day that has something planned in it, however late", () => {
    expect(names(visibleSlots(day({ morning: "Park Run" }), at(17, 25)))).toEqual(["morning", "evening"]);
    expect(names(visibleSlots(day({ morning: "Park Run", afternoon: "Library" }), at(23)))).toEqual(["morning", "afternoon"]);
  });

  it("keeps the order, and ignores a part of the day it does not know about", () => {
    expect(names(visibleSlots([{ slot: "brunch", item: null }, ...day()], at(14)))).toEqual(["brunch", "afternoon", "evening"]);
  });
});

describe("how Today uses it", () => {
  it("builds the day from London's clock, so the evening of a summer day is not mistaken for the morning", () => {
    const page = read("src/app/today/page.tsx");
    expect(page).toContain("visibleSlots(");
    expect(page).toContain("londonClock(new Date()).minutes");
  });

  it("says kindly when nothing is left, instead of showing an empty list", () => {
    const view = read("src/components/TodayView.tsx");
    expect(view).toContain("slots.length === 0 &&");
    expect(view).toContain("That is the day done. Fresh ideas will be here tomorrow.");
  });
});

describe("My Week on a day that has already gone", () => {
  it("says nothing was planned, not 'free so far'", () => {
    const view = read("src/components/ThisWeekView.tsx");
    expect(view).toContain("dayHasPassed ? `Nothing was planned for ${dayName}.` : `${dayName} is free so far.`");
    // Looking at next week (today is empty), no day counts as passed.
    expect(view).toContain('indexOf(today) > 0 &&');
  });
});
