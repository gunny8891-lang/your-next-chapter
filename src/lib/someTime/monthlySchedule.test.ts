import { describe, expect, it } from "vitest";
import { intervalsOnDate, monthlyScheduleText, openStatus, parseOpeningHours, parseSchedule, weekOfMonth } from "@/lib/someTime/openingHours";
import { meetsText, slotsOverlapping } from "@/lib/someTime/meets";
import { alignToEvents } from "@/lib/opportunities/schedule";
import { buildFallbackItinerary } from "@/lib/itinerary/fallback";
import { buildItemDetails } from "@/lib/itinerary/details";
import type { AffinityScores } from "@/lib/memory/scoring";

// October 2026: Mondays are the 5th, 12th, 19th and 26th; Fridays the 2nd, 9th, 16th, 23rd and 30th.
const MON_1 = "2026-10-05";
const MON_2 = "2026-10-12";
const MON_3 = "2026-10-19";
const MON_4 = "2026-10-26";
const FRI_LAST = "2026-10-30";
const FRI_4 = "2026-10-23";

describe("which week of the month a date is in", () => {
  it("counts the occurrence of its weekday: days 1-7 are the 1st, 8-14 the 2nd, and so on", () => {
    expect(weekOfMonth(MON_1)).toEqual({ nth: 1, last: false });
    expect(weekOfMonth(MON_2)).toEqual({ nth: 2, last: false });
    // 26 October is the 4th Monday, and also the last (there is no 5th: the 2nd of November is the next).
    expect(weekOfMonth(MON_4)).toEqual({ nth: 4, last: true });
    expect(weekOfMonth(MON_3)).toEqual({ nth: 3, last: false });
  });

  it("knows the last occurrence, which is not always the 5th", () => {
    expect(weekOfMonth(FRI_LAST)).toEqual({ nth: 5, last: true });
    // The 23rd of October is the 4th Friday and not the last (the 30th is).
    expect(weekOfMonth(FRI_4)).toEqual({ nth: 4, last: false });
    // February 2027 has 28 days: the 22nd is a Monday, the 4th and the last.
    expect(weekOfMonth("2027-02-22")).toEqual({ nth: 4, last: true });
  });

  it("is null for anything that is not a date", () => {
    expect(weekOfMonth("tomorrow")).toBeNull();
  });
});

describe("reading 'the 2nd and 4th Monday'", () => {
  const rule = "Mo[2,4] 10:00-12:00";

  it("is understood, where it used to be 'not understood' and so offered on any day", () => {
    expect(parseSchedule(rule)).not.toBeNull();
  });

  it("is on the 2nd and 4th Monday, and not the 1st or 3rd", () => {
    expect(intervalsOnDate(rule, MON_2)).toEqual([[600, 720]]);
    expect(intervalsOnDate(rule, MON_4)).toEqual([[600, 720]]);
    expect(intervalsOnDate(rule, MON_1)).toEqual([]);
    expect(intervalsOnDate(rule, MON_3)).toEqual([]);
  });

  it("is not on any other day of the week", () => {
    expect(intervalsOnDate(rule, "2026-10-13")).toEqual([]); // the Tuesday after the 2nd Monday
  });

  it("reads the last of the month, a range of weeks, and several days", () => {
    expect(intervalsOnDate("Fr[-1] 14:00-16:00", FRI_LAST)).toEqual([[840, 960]]);
    expect(intervalsOnDate("Fr[-1] 14:00-16:00", FRI_4)).toEqual([]);
    expect(intervalsOnDate("Mo[1-3] 09:00-10:00", MON_3)).toEqual([[540, 600]]);
    expect(intervalsOnDate("Mo[1-3] 09:00-10:00", MON_4)).toEqual([]);
    expect(intervalsOnDate("Mo[1],We[2] 09:00-10:00", "2026-10-14")).toEqual([[540, 600]]);
  });

  it("combines with ordinary weekly times in one schedule", () => {
    const mixed = "Th 14:00-16:00; Mo[2,4] 10:00-12:00";
    expect(intervalsOnDate(mixed, "2026-10-08")).toEqual([[840, 960]]);
    expect(intervalsOnDate(mixed, MON_2)).toEqual([[600, 720]]);
    expect(intervalsOnDate(mixed, MON_1)).toEqual([]);
  });

  it("is still 'not understood' for what cannot be written this way, never guessed", () => {
    for (const odd of ["Mo[0] 10:00-12:00", "Mo[6] 10:00-12:00", "Mo[x] 10:00-12:00", "Mo[2,4] off", "Mo[2 10:00-12:00", "every other Monday"]) {
      expect(parseSchedule(odd), odd).toBeNull();
    }
  });

  it("is kept out of plain weekly callers, which cannot answer it", () => {
    expect(parseOpeningHours(rule)).toBeNull();
    expect(parseOpeningHours("Th 14:00-16:00")).not.toBeNull();
  });
});

describe("is it open on a day", () => {
  const rule = "Mo[2,4] 10:00-12:00";

  it("is open at ten on the 2nd Monday, and closed on the 1st", () => {
    expect(openStatus(rule, "Mon", 10 * 60, 60, MON_2)).toEqual({ status: "open", closesAt: 720 });
    expect(openStatus(rule, "Mon", 10 * 60, 60, MON_1)).toEqual({ status: "closed" });
  });

  it("is closed on a Tuesday, and at the wrong time on the right Monday", () => {
    expect(openStatus(rule, "Tue", 10 * 60, 60, "2026-10-13")).toEqual({ status: "closed" });
    expect(openStatus(rule, "Mon", 14 * 60, 60, MON_2)).toEqual({ status: "closed" });
  });

  it("is unknown, never closed, when it is asked without a date: it might be on", () => {
    expect(openStatus(rule, "Mon", 10 * 60, 60)).toEqual({ status: "unknown" });
  });

  it("is unchanged for an ordinary weekly schedule, with or without a date", () => {
    expect(openStatus("Mo-Fr 09:00-17:00", "Tue", 10 * 60, 60)).toEqual({ status: "open", closesAt: 1020 });
    expect(openStatus("Mo-Fr 09:00-17:00", "Tue", 10 * 60, 60, "2026-10-13")).toEqual({ status: "open", closesAt: 1020 });
    expect(openStatus("Mo-Fr 09:00-17:00", "Sat", 10 * 60, 60, "2026-10-17")).toEqual({ status: "closed" });
  });
});

describe("saying it in words", () => {
  it("says which weeks and when", () => {
    expect(monthlyScheduleText("Mo[2,4] 10:00-12:00")).toBe("On the 2nd and 4th Monday, 10:00–12:00");
    expect(monthlyScheduleText("Fr[-1] 14:00-16:00")).toBe("On the last Friday, 14:00–16:00");
    expect(monthlyScheduleText("Mo[1-3] 09:00-10:00")).toBe("On the 1st, 2nd and 3rd Monday, 09:00–10:00");
  });

  it("is nothing for a plain weekly schedule, which has its own wording", () => {
    expect(monthlyScheduleText("Th 14:00-16:00")).toBeNull();
    expect(monthlyScheduleText(null)).toBeNull();
  });

  it("tells the planner when a group meets, and says nothing of a venue with ordinary long hours", () => {
    expect(meetsText("Th 14:00-16:00")).toBe("Thursday 14:00–16:00");
    expect(meetsText("Mo[2,4] 10:00-12:00")).toBe("On the 2nd and 4th Monday, 10:00–12:00");
    expect(meetsText("Mo-Su 09:00-17:00")).toBeNull();
    expect(meetsText("Mo-Fr 09:00-17:00")).toBeNull();
    expect(meetsText("not hours")).toBeNull();
  });

  it("is shown on the item's details, where the plain hours cannot be", () => {
    const details = buildItemDetails({ recurrenceRule: "Mo[2,4] 10:00-12:00", day: "Mon", description: null, durationMinutes: null, lat: null, lng: null, home: { lat: null, lng: null }, travel: { drives: null, uses_public_transport: null, mobility_notes: null }, bookingUrl: null, accessibilityNotes: null } as never);
    expect(details.hours).toBe("On the 2nd and 4th Monday, 10:00–12:00");
  });
});

describe("which part of the day a time is in", () => {
  it("names the parts it overlaps by at least half an hour", () => {
    expect(slotsOverlapping([[840, 960]])).toEqual(["afternoon"]);
    expect(slotsOverlapping([[540, 1020]])).toEqual(["morning", "afternoon"]);
    expect(slotsOverlapping([[1110, 1200]])).toEqual(["evening"]);
    expect(slotsOverlapping([[690, 735]])).toEqual(["morning"]); // 30 minutes of morning, 15 of afternoon
    expect(slotsOverlapping([[705, 735]])).toEqual([]); // 15 minutes of each: neither
  });
});

describe("a week planned around when things meet", () => {
  const WEEK = "2026-10-12"; // contains the 2nd Monday (12th) and the Thursday 15th
  const activity = (id: string, rule: string | null) => ({ id, date_time: null, expires_at: null, recurrence_rule: rule });
  const item = (id: string, day: "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun", slot: "morning" | "afternoon" | "evening") => ({ day, slot, activity_id: id, rationale: "x" });

  it("moves a Thursday group the model put on a Monday to Thursday afternoon", () => {
    const placed = alignToEvents([item("group", "Mon", "morning")], [activity("group", "Th 14:00-16:00")], WEEK);
    expect(placed).toEqual([item("group", "Thu", "afternoon")]);
  });

  it("keeps a group where the model put it, when it meets then", () => {
    const placed = alignToEvents([item("group", "Thu", "afternoon")], [activity("group", "Th 14:00-16:00")], WEEK);
    expect(placed).toEqual([item("group", "Thu", "afternoon")]);
  });

  it("puts a '2nd Monday' group on the Monday of a week that has it", () => {
    const placed = alignToEvents([item("g", "Wed", "morning")], [activity("g", "Mo[2,4] 10:00-12:00")], WEEK);
    expect(placed).toEqual([item("g", "Mon", "morning")]);
  });

  it("leaves a '2nd Monday' group out of a week that does not have it, rather than putting it on the wrong day", () => {
    // The week of 5 October has the 1st Monday of the month, not the 2nd or 4th: the group does not meet that week.
    const placed = alignToEvents([item("g", "Mon", "morning")], [activity("g", "Mo[2,4] 10:00-12:00")], "2026-10-05");
    expect(placed).toEqual([]);
  });

  it("does not put a museum that is shut on Mondays on a Monday", () => {
    const placed = alignToEvents([item("museum", "Mon", "morning")], [activity("museum", "Tu-Su 10:00-17:00")], WEEK);
    expect(placed[0].day).toBe("Tue");
  });

  it("leaves alone anything with a schedule the app does not understand", () => {
    const placed = alignToEvents([item("x", "Mon", "morning")], [activity("x", "sunrise-sunset")], WEEK);
    expect(placed).toEqual([item("x", "Mon", "morning")]);
  });

  it("does not put two things in one place while moving them", () => {
    const placed = alignToEvents(
      [item("a", "Mon", "morning"), item("b", "Mon", "morning")],
      [activity("a", "Th 14:00-16:00"), activity("b", "Th 14:00-16:00")],
      WEEK
    );
    const spots = placed.map((p) => `${p.day}|${p.slot}`);
    expect(new Set(spots).size).toBe(spots.length);
    expect(placed.every((p) => p.day === "Thu")).toBe(true);
  });
});

describe("the week without the AI", () => {
  const affinity = { categoryScores: {}, tagScores: {}, activityScores: {}, recentCategoryCounts: {} } as unknown as AffinityScores;
  const place = (id: string, category: string, rule: string | null = null) => ({ id, title: id, category, tags: [], rating: null, recurrence_rule: rule });

  it("puts a '2nd Monday' group on the Monday of a week that has it", () => {
    const week = buildFallbackItinerary([place("g", "Connect", "Mo[2,4] 10:00-12:00"), place("a", "Move"), place("b", "Joy"), place("c", "Learn"), place("d", "Explore")], affinity, "2026-10-12");
    const g = week.items.find((i) => i.activity_id === "g");
    expect(g).toMatchObject({ day: "Mon", slot: "morning" });
  });

  it("leaves a '2nd Monday' group out of the week of the 5th, where there is no such Monday to put it on", () => {
    const week = buildFallbackItinerary([place("g", "Connect", "Mo[2,4] 10:00-12:00"), place("a", "Move"), place("b", "Joy"), place("c", "Learn"), place("d", "Explore")], affinity, "2026-10-05");
    expect(week.items.find((i) => i.activity_id === "g")).toBeUndefined();
    expect(week.items.length).toBeGreaterThanOrEqual(4);
  });
});
