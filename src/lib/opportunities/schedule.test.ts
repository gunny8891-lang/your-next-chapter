import { describe, expect, it } from "vitest";
import {
  addDays,
  alignToEvents,
  describeWhen,
  eventDate,
  fitsDates,
  getCurrentWeekStart,
  londonToday,
  slotForHour,
  weekdayOf,
  weekDates,
} from "@/lib/opportunities/schedule";
import type { GeneratedItem } from "@/lib/itinerary/schema";

// Week of Mon 2026-10-26 .. Sun 2026-11-01 (5 Nov is the Thursday after).
const WEEK = "2026-10-26";

const item = (activity_id: string, day: GeneratedItem["day"], slot: GeneratedItem["slot"]): GeneratedItem => ({
  activity_id,
  day,
  slot,
  rationale: "Because.",
});

describe("calendar helpers", () => {
  it("finds the Monday of the current week", () => {
    expect(getCurrentWeekStart(new Date("2026-10-02T09:00:00Z"))).toBe("2026-09-28"); // Friday
    expect(getCurrentWeekStart(new Date("2026-09-28T00:00:00Z"))).toBe("2026-09-28"); // Monday
    expect(getCurrentWeekStart(new Date("2026-10-04T23:00:00Z"))).toBe("2026-09-28"); // Sunday
  });

  it("does arithmetic across month ends", () => {
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
    expect(weekdayOf("2026-11-05")).toBe("Thu");
    expect(weekDates(WEEK)).toMatchObject({ Mon: "2026-10-26", Thu: "2026-10-29", Sun: "2026-11-01" });
  });

  it("reads 'today' as London's date, not the server's", () => {
    // After the clocks go back (25 Oct) London matches UTC.
    expect(londonToday(new Date("2026-10-30T23:30:00Z"))).toBe("2026-10-30");
    // During BST, 23:30 UTC is already the next day in London.
    expect(londonToday(new Date("2026-07-01T23:30:00Z"))).toBe("2026-07-02");
  });

  it("maps hours to parts of the day", () => {
    expect([slotForHour(9), slotForHour(12), slotForHour(16), slotForHour(17), slotForHour(20)]).toEqual([
      "morning",
      "afternoon",
      "afternoon",
      "evening",
      "evening",
    ]);
  });
});

describe("eventDate and describeWhen", () => {
  it("reads a one-off's stored time as the wall-clock time shown", () => {
    expect(eventDate({ date_time: "2026-11-05T10:30:00Z", expires_at: null })).toEqual({ date: "2026-11-05", hour: 10 });
    expect(describeWhen({ date_time: "2026-11-05T10:30:00Z", expires_at: null })).toBe("Thu 5 Nov, 10:30");
  });

  it("treats a run as not a one-off", () => {
    const run = { date_time: null, expires_at: "2026-11-01T23:59:59Z" };
    expect(eventDate(run)).toBeNull();
    expect(describeWhen(run)).toBe("available until 1 Nov");
  });

  it("says nothing about standing items", () => {
    expect(describeWhen({ date_time: null, expires_at: null })).toBeNull();
  });
});

describe("fitsDates", () => {
  const thisWeek = ["2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"];

  it("only lets a one-off through if its date is a plannable day", () => {
    expect(fitsDates({ date_time: "2026-10-29T10:30:00Z", expires_at: null }, thisWeek)).toBe(true);
    expect(fitsDates({ date_time: "2026-11-05T10:30:00Z", expires_at: null }, thisWeek)).toBe(false);
    expect(fitsDates({ date_time: "2026-10-27T10:30:00Z", expires_at: null }, thisWeek)).toBe(false);
  });

  it("lets a run through unless it ends before the week starts", () => {
    expect(fitsDates({ date_time: null, expires_at: "2026-11-26T23:59:59Z" }, thisWeek)).toBe(true);
    expect(fitsDates({ date_time: null, expires_at: "2026-10-27T23:59:59Z" }, thisWeek)).toBe(false);
  });

  it("always lets standing items through", () => {
    expect(fitsDates({ date_time: null, expires_at: null }, thisWeek)).toBe(true);
    expect(fitsDates({ date_time: null, expires_at: null }, [])).toBe(true);
  });
});

describe("alignToEvents", () => {
  const talk = { id: "talk", date_time: "2026-10-29T10:30:00Z", expires_at: null }; // Thu morning
  const evening = { id: "evening", date_time: "2026-10-30T19:00:00Z", expires_at: null }; // Fri evening
  const walks = { id: "walks", date_time: null, expires_at: "2026-10-28T23:59:59Z" }; // run ends Wed
  const park = { id: "park", date_time: null, expires_at: null };
  const library = { id: "library", date_time: null, expires_at: null };
  const all = [talk, evening, walks, park, library];

  it("moves a one-off to its real day and part of the day (the bug seen in a real plan)", () => {
    // The model put a Thursday-morning talk on Friday afternoon.
    const result = alignToEvents([item("talk", "Fri", "afternoon")], all, WEEK);
    expect(result).toEqual([expect.objectContaining({ activity_id: "talk", day: "Thu", slot: "morning" })]);
  });

  it("uses the event's evening slot", () => {
    const result = alignToEvents([item("evening", "Mon", "morning")], all, WEEK);
    expect(result[0]).toMatchObject({ day: "Fri", slot: "evening" });
  });

  it("never places a run after it ends", () => {
    const result = alignToEvents([item("walks", "Sat", "morning")], all, WEEK);
    expect(result).toHaveLength(1);
    expect(["Mon", "Tue", "Wed"]).toContain(result[0].day);
  });

  it("leaves an unconstrained item where the model put it", () => {
    expect(alignToEvents([item("park", "Sat", "afternoon")], all, WEEK)).toEqual([item("park", "Sat", "afternoon")]);
  });

  it("moves an item out of a slot a pinned event needs, rather than hiding one of them", () => {
    // The model put the library in the very slot the talk is fixed to.
    const result = alignToEvents([item("library", "Thu", "morning"), item("talk", "Fri", "afternoon")], all, WEEK);
    const talkItem = result.find((i) => i.activity_id === "talk")!;
    const libraryItem = result.find((i) => i.activity_id === "library")!;
    expect(talkItem).toMatchObject({ day: "Thu", slot: "morning" });
    expect(`${libraryItem.day}|${libraryItem.slot}`).not.toBe("Thu|morning");
    expect(libraryItem.day).toBe("Thu"); // nearest free slot, same day
  });

  it("never leaves two items in one slot", () => {
    const result = alignToEvents([item("park", "Mon", "morning"), item("library", "Mon", "morning")], all, WEEK);
    const keys = result.map((i) => `${i.day}|${i.slot}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("leaves out an event that is not in the plan's week", () => {
    const outside = { id: "outside", date_time: "2026-11-05T10:30:00Z", expires_at: null };
    expect(alignToEvents([item("outside", "Mon", "morning")], [...all, outside], WEEK)).toEqual([]);
  });

  it("returns the plan in week order", () => {
    const result = alignToEvents([item("park", "Sat", "morning"), item("library", "Mon", "morning"), item("talk", "Sun", "evening")], all, WEEK);
    expect(result.map((i) => i.day)).toEqual(["Mon", "Thu", "Sat"]);
  });
});
