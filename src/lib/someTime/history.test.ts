import { describe, expect, it } from "vitest";
import { buildRepetitionHistory } from "@/lib/someTime/history";

// Friday 2 October 2026. The week starting Mon 28 Sep has Mon-Thu behind us.
const TODAY = "2026-10-02";
const item = (day: string, member_action: string, id: string, category: string) => ({
  day_of_week: day,
  member_action,
  activities: { id, category },
});

describe("buildRepetitionHistory", () => {
  it("counts accepted things as done, and remembers them for a month", () => {
    const h = buildRepetitionHistory(
      [
        { week_start_date: "2026-09-28", itinerary_items: [item("Mon", "accepted", "a", "Move")] },
        { week_start_date: "2026-09-07", itinerary_items: [item("Tue", "accepted", "old", "Learn")] }, // 25 days ago
        { week_start_date: "2026-08-03", itinerary_items: [item("Mon", "accepted", "ancient", "Learn")] },
      ],
      [],
      TODAY
    );
    expect(h.recentActivityIds.has("a")).toBe(true);
    expect(h.recentActivityIds.has("old")).toBe(true);
    expect(h.recentActivityIds.has("ancient")).toBe(false);
  });

  it("counts the last week's categories, whether accepted or just planned", () => {
    const h = buildRepetitionHistory(
      [
        {
          week_start_date: "2026-09-28",
          itinerary_items: [item("Mon", "accepted", "a", "Move"), item("Wed", "pending", "b", "Move"), item("Thu", "accepted", "c", "Learn")],
        },
      ],
      [],
      TODAY
    );
    expect(h.categoryCounts).toEqual({ Move: 2, Learn: 1 });
  });

  it("only treats an accepted item as done, not one that was merely planned", () => {
    const h = buildRepetitionHistory([{ week_start_date: "2026-09-28", itinerary_items: [item("Mon", "pending", "p", "Move")] }], [], TODAY);
    expect(h.recentActivityIds.has("p")).toBe(false);
  });

  it("ignores what they skipped or swapped away", () => {
    const h = buildRepetitionHistory(
      [{ week_start_date: "2026-09-28", itinerary_items: [item("Mon", "skipped", "s", "Move"), item("Tue", "swapped", "w", "Move")] }],
      [],
      TODAY
    );
    expect(h.recentActivityIds.size).toBe(0);
    expect(h.categoryCounts).toEqual({});
  });

  it("ignores days that have not happened yet", () => {
    const h = buildRepetitionHistory(
      [{ week_start_date: "2026-09-28", itinerary_items: [item("Sat", "accepted", "future", "Move"), item("Fri", "accepted", "today", "Move")] }],
      [],
      TODAY
    );
    expect(h.recentActivityIds.has("future")).toBe(false);
    expect(h.recentActivityIds.has("today")).toBe(true);
  });

  it("adds things they liked, even outside a plan (a Surprise Me pick, say)", () => {
    expect(buildRepetitionHistory([], ["liked-1", "liked-2"], TODAY).recentActivityIds).toEqual(new Set(["liked-1", "liked-2"]));
  });

  it("copes with an empty history and with joins that come back as arrays or nulls", () => {
    expect(buildRepetitionHistory([], [], TODAY)).toEqual({ recentActivityIds: new Set(), categoryCounts: {} });
    const odd = {
      week_start_date: "2026-09-28",
      itinerary_items: [
        { day_of_week: "Mon", member_action: "accepted", activities: [{ id: "arr", category: "Joy" }] },
        { day_of_week: "Tue", member_action: "accepted", activities: null },
        { day_of_week: "Nonsense", member_action: "accepted", activities: { id: "bad", category: "Joy" } },
      ],
    };
    const h = buildRepetitionHistory([odd as never], [], TODAY);
    expect([...h.recentActivityIds]).toEqual(["arr"]);
  });
});
