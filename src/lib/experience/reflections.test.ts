import { describe, expect, it } from "vitest";
import { pendingReflections, toPlanItems, type PlanItem } from "@/lib/experience/reflections";

const TODAY = "2026-10-07"; // a Wednesday
const item = (activityId: string, date: string, accepted = true, slot: PlanItem["slot"] = "morning", canRepeat = true): PlanItem => ({ activityId, title: `Thing ${activityId}`, date, accepted, slot, canRepeat });

describe("pendingReflections", () => {
  it("asks about accepted things from the last few days, newest first", () => {
    const out = pendingReflections([item("a", "2026-10-05"), item("b", "2026-10-06")], TODAY, new Set());
    expect(out.map((r) => r.activityId)).toEqual(["b", "a"]);
  });

  it("never asks about today (it may not have happened yet) or the future", () => {
    expect(pendingReflections([item("a", TODAY), item("b", "2026-10-09")], TODAY, new Set())).toEqual([]);
  });

  it("does not nag about things from long ago", () => {
    expect(pendingReflections([item("old", "2026-10-02")], TODAY, new Set())).toEqual([]);
    expect(pendingReflections([item("edge", "2026-10-04")], TODAY, new Set()).map((r) => r.activityId)).toEqual(["edge"]);
  });

  it("only asks about things they said yes to", () => {
    expect(pendingReflections([item("skipped", "2026-10-06", false)], TODAY, new Set())).toEqual([]);
  });

  it("asks once: an answered thing is not asked again", () => {
    expect(pendingReflections([item("a", "2026-10-06"), item("b", "2026-10-05")], TODAY, new Set(["a"])).map((r) => r.activityId)).toEqual(["b"]);
  });

  it("asks about at most two things, and the same activity once", () => {
    const items = [item("a", "2026-10-06"), item("b", "2026-10-06"), item("c", "2026-10-05"), item("a", "2026-10-05")];
    expect(pendingReflections(items, TODAY, new Set()).map((r) => r.activityId)).toEqual(["a", "b"]);
  });
});

describe("toPlanItems", () => {
  it("dates each item from its week's Monday and day of the week", () => {
    const rows = [
      {
        week_start_date: "2026-10-05",
        itinerary_items: [
          { day_of_week: "Mon", slot: "afternoon", member_action: "accepted", activities: { id: "a", title: "Walk" } },
          { day_of_week: "Wed", slot: "morning", member_action: "pending", activities: [{ id: "b", title: "Class" }] },
          { day_of_week: "Zzz", member_action: "accepted", activities: { id: "c", title: "Nonsense" } },
          { day_of_week: "Tue", member_action: "accepted", activities: null },
        ],
      },
    ];
    expect(toPlanItems(rows)).toEqual([
      { activityId: "a", title: "Walk", date: "2026-10-05", accepted: true, slot: "afternoon", canRepeat: true },
      { activityId: "b", title: "Class", date: "2026-10-07", accepted: false, slot: "morning", canRepeat: true },
    ]);
  });

  it("says a one-off event cannot be planned again, nor something that will have ended by next week", () => {
    const rows = [
      {
        week_start_date: "2026-10-05",
        itinerary_items: [
          { day_of_week: "Mon", slot: "morning", member_action: "accepted", activities: { id: "concert", title: "Concert", date_time: "2026-10-05T10:00:00Z", expires_at: null } },
          { day_of_week: "Mon", slot: "afternoon", member_action: "accepted", activities: { id: "show", title: "Exhibition", date_time: null, expires_at: "2026-10-09T00:00:00Z" } },
          { day_of_week: "Tue", slot: "morning", member_action: "accepted", activities: { id: "run", title: "Exhibition", date_time: null, expires_at: "2026-11-09T00:00:00Z" } },
        ],
      },
    ];
    expect(toPlanItems(rows).map((i) => [i.activityId, i.canRepeat])).toEqual([["concert", false], ["show", false], ["run", true]]);
  });
});

describe("what has already finished today", () => {
  const MORNING_OVER = 12 * 60;
  it("asks about this morning once it is over, and never before", () => {
    const items = [item("a", TODAY, true, "morning")];
    expect(pendingReflections(items, TODAY, new Set(), MORNING_OVER - 1)).toEqual([]);
    expect(pendingReflections(items, TODAY, new Set(), MORNING_OVER).map((r) => r.activityId)).toEqual(["a"]);
  });

  it("never asks about today when the time is not known, as before", () => {
    expect(pendingReflections([item("a", TODAY, true, "morning")], TODAY, new Set())).toEqual([]);
  });

  it("waits for the afternoon to end and the evening to end", () => {
    expect(pendingReflections([item("a", TODAY, true, "afternoon")], TODAY, new Set(), 16 * 60 + 59)).toEqual([]);
    expect(pendingReflections([item("a", TODAY, true, "afternoon")], TODAY, new Set(), 17 * 60)).toHaveLength(1);
    expect(pendingReflections([item("a", TODAY, true, "evening")], TODAY, new Set(), 21 * 60 + 59)).toEqual([]);
    expect(pendingReflections([item("a", TODAY, true, "evening")], TODAY, new Set(), 22 * 60)).toHaveLength(1);
  });

  it("never asks about tomorrow, something skipped, or something already answered", () => {
    expect(pendingReflections([item("a", "2026-10-08", true, "morning")], TODAY, new Set(), 23 * 60)).toEqual([]);
    expect(pendingReflections([item("a", TODAY, false, "morning")], TODAY, new Set(), 13 * 60)).toEqual([]);
    expect(pendingReflections([item("a", TODAY, true, "morning")], TODAY, new Set(["a"]), 13 * 60)).toEqual([]);
  });

  it("puts today's first, and still asks about at most two things", () => {
    const out = pendingReflections([item("old", "2026-10-05"), item("older", "2026-10-04"), item("now", TODAY, true, "morning")], TODAY, new Set(), 13 * 60);
    expect(out.map((r) => r.activityId)).toEqual(["now", "old"]);
  });

  it("carries what is needed to plan it again", () => {
    const [r] = pendingReflections([item("a", "2026-10-06", true, "afternoon", false)], TODAY, new Set());
    expect(r).toEqual({ activityId: "a", title: "Thing a", date: "2026-10-06", slot: "afternoon", canRepeat: false });
  });
});
