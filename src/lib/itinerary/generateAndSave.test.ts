import { beforeEach, describe, expect, it, vi } from "vitest";

const generateItinerary = vi.fn();
const dropFromCalendarIfAny = vi.fn(async (memberId: string, itemId: string): Promise<void> => {
  void memberId;
  void itemId;
});

vi.mock("@/lib/itinerary/agent", () => ({ generateItinerary: (admin: unknown, memberId: string, options?: unknown) => generateItinerary(admin, memberId, options) }));
vi.mock("@/lib/calendar/sync", () => ({ dropFromCalendarIfAny: (memberId: string, itemId: string) => dropFromCalendarIfAny(memberId, itemId) }));

import { generateAndSaveItinerary } from "@/lib/itinerary/generateAndSave";

type Row = Record<string, unknown>;

/** A stand-in for the database holding one week's items and the calendar links, recording what was deleted and inserted. */
function fakeDb(items: Row[], calendarLinks: string[], existingWeeks: string[] = []) {
  const log = { deleted: [] as string[], inserted: [] as Row[], weekSaved: null as string | null };
  const admin = {
    from(table: string) {
      if (table === "itineraries") {
        return {
          select: () => ({ eq: () => ({ in: async (_c: string, weeks: string[]) => ({ data: existingWeeks.filter((w) => weeks.includes(w)).map((w) => ({ week_start_date: w })), error: null }) }) }),
          upsert: (row: Row) => {
            log.weekSaved = row.week_start_date as string;
            return { select: () => ({ single: async () => ({ data: { id: "week-1" }, error: null }) }) };
          },
        };
      }
      if (table === "calendar_events") {
        return { select: () => ({ eq: () => ({ in: async (_c: string, ids: string[]) => ({ data: calendarLinks.filter((l) => ids.includes(l)).map((l) => ({ itinerary_item_id: l })), error: null }) }) }) };
      }
      return {
        select: () => ({ eq: async () => ({ data: items, error: null }) }),
        delete: () => ({
          in: async (_c: string, ids: string[]) => {
            log.deleted.push(...ids);
            return { error: null };
          },
        }),
        insert: async (rows: Row[]) => {
          log.inserted.push(...rows);
          return { error: null };
        },
      };
    },
  };
  return { admin: admin as never, log };
}

const item = (id: string, activity: string, day: string, slot: string, action: string): Row => ({ id, activity_id: activity, day_of_week: day, slot, member_action: action });
const made = (activity: string, day: string, slot: string) => ({ activity_id: activity, day, slot, rationale: "why" });

beforeEach(() => {
  generateItinerary.mockReset();
  dropFromCalendarIfAny.mockClear();
});

describe("rebuilding a week", () => {
  it("keeps what the member said yes to, replaces the rest, and fills only the free places", async () => {
    generateItinerary.mockResolvedValue({
      usedFallback: false,
      itinerary: { items: [made("new-wed-am", "Wed", "morning"), made("ham-house", "Fri", "morning"), made("new-thu", "Thu", "morning"), made("new-mon", "Mon", "morning")] },
    });
    const { admin, log } = fakeDb(
      [item("keep-1", "ham-house", "Wed", "morning", "accepted"), item("old-1", "u3a", "Wed", "afternoon", "skipped"), item("old-2", "walk", "Mon", "morning", "pending")],
      []
    );

    const result = await generateAndSaveItinerary(admin, "member-1", { weekStart: "2026-10-05" });

    expect(result.error).toBeNull();
    // Only the ones not agreed to were removed; the accepted outing was never touched.
    expect(log.deleted.sort()).toEqual(["old-1", "old-2"]);
    expect(log.deleted).not.toContain("keep-1");
    // New items go only into free places, and never repeat the kept activity.
    expect(log.inserted.map((r) => r.activity_id).sort()).toEqual(["new-mon", "new-thu"]);
    expect(result.itemCount).toBe(3); // two new plus the one kept
  });

  it("takes any replaced outing off the member's calendar before it is deleted", async () => {
    generateItinerary.mockResolvedValue({ usedFallback: false, itinerary: { items: [made("n", "Tue", "morning")] } });
    const { admin } = fakeDb([item("on-cal", "x", "Mon", "morning", "pending"), item("not-on-cal", "y", "Tue", "afternoon", "pending")], ["on-cal"]);

    await generateAndSaveItinerary(admin, "member-1", { weekStart: "2026-10-05" });

    expect(dropFromCalendarIfAny).toHaveBeenCalledTimes(1);
    expect(dropFromCalendarIfAny).toHaveBeenCalledWith("member-1", "on-cal");
  });

  it("does not touch the calendar for outings that are kept", async () => {
    generateItinerary.mockResolvedValue({ usedFallback: false, itinerary: { items: [] } });
    const { admin, log } = fakeDb([item("keep-1", "ham-house", "Wed", "morning", "accepted")], ["keep-1"]);

    await generateAndSaveItinerary(admin, "member-1", { weekStart: "2026-10-05" });

    expect(dropFromCalendarIfAny).not.toHaveBeenCalled();
    expect(log.deleted).toEqual([]);
  });

  it("builds a whole new week when nothing has been agreed to yet", async () => {
    generateItinerary.mockResolvedValue({ usedFallback: false, itinerary: { items: [made("a", "Mon", "morning"), made("b", "Tue", "morning")] } });
    const { admin, log } = fakeDb([item("old", "z", "Mon", "morning", "pending")], []);

    const result = await generateAndSaveItinerary(admin, "member-1", { weekStart: "2026-10-05" });

    expect(log.deleted).toEqual(["old"]);
    expect(log.inserted).toHaveLength(2);
    expect(result.itemCount).toBe(2);
  });

  it("works for a first-ever week, with nothing there to keep or replace", async () => {
    generateItinerary.mockResolvedValue({ usedFallback: false, itinerary: { items: [made("a", "Mon", "morning")] } });
    const { admin, log } = fakeDb([], []);

    const result = await generateAndSaveItinerary(admin, "member-1", { weekStart: "2026-10-05" });

    expect(result.error).toBeNull();
    expect(log.deleted).toEqual([]);
    expect(log.inserted).toHaveLength(1);
  });
});

describe("which week gets planned", () => {
  const sunday = new Date("2026-10-11T19:00:00Z");

  it("plans the week it is told to (the Sunday job names the coming week), for the planner and for the saved plan", async () => {
    generateItinerary.mockResolvedValue({ usedFallback: false, itinerary: { items: [made("a", "Mon", "morning")] } });
    const { admin, log } = fakeDb([], []);

    await generateAndSaveItinerary(admin, "member-1", { weekStart: "2026-10-12" });

    expect(log.weekSaved).toBe("2026-10-12");
    expect(generateItinerary).toHaveBeenCalledWith(admin, "member-1", { weekStart: "2026-10-12" });
  });

  it("otherwise plans the week the member is looking at: this week, until next week's plan exists on a Sunday", async () => {
    vi.useFakeTimers();
    try {
      generateItinerary.mockResolvedValue({ usedFallback: false, itinerary: { items: [] } });

      vi.setSystemTime(new Date("2026-10-07T10:00:00Z")); // a Wednesday, next week's plan already there
      const midweek = fakeDb([], [], ["2026-10-05", "2026-10-12"]);
      await generateAndSaveItinerary(midweek.admin, "member-1");
      expect(midweek.log.weekSaved).toBe("2026-10-05");

      vi.setSystemTime(sunday); // Sunday evening, next week's plan not made yet
      const early = fakeDb([], [], ["2026-10-05"]);
      await generateAndSaveItinerary(early.admin, "member-1");
      expect(early.log.weekSaved).toBe("2026-10-05");

      vi.setSystemTime(sunday); // Sunday evening, after the job has made next week's
      const after = fakeDb([], [], ["2026-10-05", "2026-10-12"]);
      await generateAndSaveItinerary(after.admin, "member-1");
      expect(after.log.weekSaved).toBe("2026-10-12");
    } finally {
      vi.useRealTimers();
    }
  });
});
