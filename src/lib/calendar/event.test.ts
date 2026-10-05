import { describe, expect, it } from "vitest";
import { addLocalMinutes, buildCalendarEvent, dateOfDay, type ItemForCalendar } from "@/lib/calendar/event";

const base: ItemForCalendar = {
  weekStart: "2026-10-05", // a Monday
  day: "Sat",
  slot: "afternoon",
  title: "Kew Gardens",
  address: "Richmond, TW9 3AB",
  dateTime: null,
  expiresAt: null,
  durationMinutes: null,
  bookingUrl: null,
  why: "You enjoy gardens.",
};

describe("which day an item falls on", () => {
  it("counts from the Monday the week starts on", () => {
    expect(dateOfDay("2026-10-05", "Mon")).toBe("2026-10-05");
    expect(dateOfDay("2026-10-05", "Sat")).toBe("2026-10-10");
    expect(dateOfDay("2026-10-05", "Sun")).toBe("2026-10-11");
  });

  it("crosses a month and a year", () => {
    expect(dateOfDay("2026-12-28", "Fri")).toBe("2027-01-01");
    expect(dateOfDay("2026-03-30", "Sat")).toBe("2026-04-04");
  });

  it("has no answer for a day that is not one", () => {
    expect(dateOfDay("2026-10-05", "Someday")).toBeNull();
  });
});

describe("adding minutes to a local time", () => {
  it("stays on the same day", () => expect(addLocalMinutes("2026-10-10", "14:00", 90)).toEqual({ date: "2026-10-10", clock: "15:30" }));
  it("rolls past midnight into the next day", () => expect(addLocalMinutes("2026-10-10", "23:30", 90)).toEqual({ date: "2026-10-11", clock: "01:00" }));
  it("rolls over the end of a month", () => expect(addLocalMinutes("2026-10-31", "23:00", 120)).toEqual({ date: "2026-11-01", clock: "01:00" }));
});

describe("an item with no time of its own (a place, or an ongoing thing)", () => {
  it("is placed at a sensible hour for that part of the day, for an hour and a half", () => {
    const e = buildCalendarEvent(base)!;
    expect(e.start).toEqual({ dateTime: "2026-10-10T14:00:00", timeZone: "Europe/London" });
    expect(e.end).toEqual({ dateTime: "2026-10-10T15:30:00", timeZone: "Europe/London" });
  });

  it.each([
    ["morning", "10:00"],
    ["afternoon", "14:00"],
    ["evening", "18:30"],
  ])("puts %s at %s", (slot, clock) => {
    expect(buildCalendarEvent({ ...base, slot })!.start.dateTime).toBe(`2026-10-10T${clock}:00`);
  });

  it("says in the description that the time is a suggestion", () => {
    expect(buildCalendarEvent(base)!.description).toMatch(/Saturday|Sat afternoon/);
    expect(buildCalendarEvent(base)!.description).toMatch(/suggestion/);
  });

  it("uses the activity's own length when it has one", () => {
    expect(buildCalendarEvent({ ...base, durationMinutes: 180 })!.end.dateTime).toBe("2026-10-10T17:00:00");
  });

  it("keeps a silly length within reason", () => {
    expect(buildCalendarEvent({ ...base, durationMinutes: 5 })!.end.dateTime).toBe("2026-10-10T14:30:00");
    expect(buildCalendarEvent({ ...base, durationMinutes: 5000, slot: "morning" })!.end.dateTime).toBe("2026-10-10T18:00:00");
  });

  it("ignores a stored date for a run or series, which has no single start", () => {
    const e = buildCalendarEvent({ ...base, dateTime: "2026-09-01T09:00:00Z", expiresAt: "2026-12-01T00:00:00Z" })!;
    expect(e.start.dateTime).toBe("2026-10-10T14:00:00");
  });

  it("cannot be placed on an unknown day or part of the day", () => {
    expect(buildCalendarEvent({ ...base, day: "Funday" })).toBeNull();
    expect(buildCalendarEvent({ ...base, slot: "teatime" })).toBeNull();
  });
});

describe("a one-off event with its own start", () => {
  it("keeps its own date and hour (stored hour is the hour shown), whatever day it was planned under", () => {
    const e = buildCalendarEvent({ ...base, day: "Mon", dateTime: "2026-10-08T19:30:00Z", durationMinutes: 120 })!;
    expect(e.start.dateTime).toBe("2026-10-08T19:30:00");
    expect(e.end.dateTime).toBe("2026-10-08T21:30:00");
  });

  it("does not claim the time is only a suggestion", () => {
    const e = buildCalendarEvent({ ...base, dateTime: "2026-10-08T19:30:00Z" })!;
    expect(e.description).not.toMatch(/suggestion/);
  });
});

describe("the clocks changing", () => {
  it("names the zone rather than a fixed offset, so the hour is right on both sides of a change", () => {
    // Sunday 25 October 2026 is the day the clocks go back; a plan for it is still 14:00 on the wall.
    const e = buildCalendarEvent({ ...base, weekStart: "2026-10-19", day: "Sun" })!;
    expect(e.start.dateTime).toBe("2026-10-25T14:00:00");
    expect(e.start.dateTime).not.toMatch(/Z$|[+-]\d\d:\d\d$/);
    expect(e.start.timeZone).toBe("Europe/London");
  });
});

describe("the rest of the event", () => {
  it("carries the place, the reason and the booking link", () => {
    const e = buildCalendarEvent({ ...base, bookingUrl: "https://example.test/book" })!;
    expect(e.summary).toBe("Kew Gardens");
    expect(e.location).toBe("Richmond, TW9 3AB");
    expect(e.description).toContain("You enjoy gardens.");
    expect(e.description).toContain("https://example.test/book");
    expect(e.description).toContain("Your Next Chapter");
  });

  it("leaves the place out when it is not known", () => {
    expect("location" in buildCalendarEvent({ ...base, address: "Location TBC" })!).toBe(false);
    expect("location" in buildCalendarEvent({ ...base, address: null })!).toBe(false);
  });

  it("sets its own gentle reminder rather than the calendar's default", () => {
    expect(buildCalendarEvent(base)!.reminders).toEqual({ useDefault: false, overrides: [{ method: "popup", minutes: 60 }] });
  });
});
