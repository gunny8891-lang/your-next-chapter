import { describe, expect, it } from "vitest";
import { pendingReflections, toPlanItems, type PlanItem } from "@/lib/experience/reflections";

const TODAY = "2026-10-07"; // a Wednesday
const item = (activityId: string, date: string, accepted = true): PlanItem => ({ activityId, title: `Thing ${activityId}`, date, accepted });

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
          { day_of_week: "Mon", member_action: "accepted", activities: { id: "a", title: "Walk" } },
          { day_of_week: "Wed", member_action: "pending", activities: [{ id: "b", title: "Class" }] },
          { day_of_week: "Zzz", member_action: "accepted", activities: { id: "c", title: "Nonsense" } },
          { day_of_week: "Tue", member_action: "accepted", activities: null },
        ],
      },
    ];
    expect(toPlanItems(rows)).toEqual([
      { activityId: "a", title: "Walk", date: "2026-10-05", accepted: true },
      { activityId: "b", title: "Class", date: "2026-10-07", accepted: false },
    ]);
  });
});
