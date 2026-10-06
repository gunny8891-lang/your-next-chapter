import { describe, expect, it } from "vitest";
import { computeMemberStats, dayBefore, londonDay, type StatsInput } from "@/lib/admin/memberStats";

// A Tuesday afternoon in October (London is on summer time, UTC+1).
const NOW = new Date("2026-10-06T15:00:00Z");

function input(overrides: Partial<StatsInput> = {}): StatsInput {
  return {
    now: NOW,
    accounts: [],
    adminIds: new Set(),
    profiles: [],
    calendarMemberIds: [],
    activity: [],
    ...overrides,
  };
}

const account = (id: string, createdAt = "2026-09-01T10:00:00Z", emailConfirmed = true) => ({ id, createdAt, emailConfirmed });

describe("london days", () => {
  it("puts a late summer evening on the London day, not the UTC one", () => {
    // 23:30 UTC on the 5th is 00:30 on the 6th in London during summer time.
    expect(londonDay(new Date("2026-10-05T23:30:00Z"))).toBe("2026-10-06");
    expect(londonDay(new Date("2026-12-05T23:30:00Z"))).toBe("2026-12-05");
  });

  it("counts back by whole calendar days across a month end", () => {
    expect(dayBefore("2026-10-01", 1)).toBe("2026-09-30");
    expect(dayBefore("2026-10-06", 0)).toBe("2026-10-06");
  });
});

describe("member stats", () => {
  it("is all zeros, not an error, when nobody has signed up", () => {
    const s = computeMemberStats(input());
    expect(s).toMatchObject({ registered: 0, onboarded: 0, activeToday: 0, active7Days: 0, returning: 0, quiet: 0 });
    expect(s.daily).toHaveLength(14);
    expect(s.daily.every((d) => d.members === 0)).toBe(true);
  });

  it("counts sign-ups, confirmed emails, onboarding and new sign-ups this week", () => {
    const s = computeMemberStats(
      input({
        accounts: [account("a", "2026-10-05T09:00:00Z"), account("b", "2026-08-01T09:00:00Z", false), account("c", "2026-10-01T09:00:00Z")],
        profiles: [
          { userId: "a", weeklyPlan: true, reminders: false },
          { userId: "c", weeklyPlan: false, reminders: true },
        ],
        calendarMemberIds: ["a", "a"],
      })
    );
    expect(s.registered).toBe(3);
    expect(s.emailConfirmed).toBe(2);
    expect(s.onboarded).toBe(2);
    expect(s.newLast7Days).toBe(2);
    expect(s.calendarConnected).toBe(1);
    expect(s.weeklyPlanOn).toBe(1);
    expect(s.remindersOn).toBe(1);
  });

  it("leaves admin accounts out of every count", () => {
    const s = computeMemberStats(
      input({
        accounts: [account("me"), account("tester")],
        adminIds: new Set(["me"]),
        profiles: [
          { userId: "me", weeklyPlan: true, reminders: true },
          { userId: "tester", weeklyPlan: true, reminders: true },
        ],
        calendarMemberIds: ["me"],
        activity: [{ memberId: "me", at: "2026-10-06T12:00:00Z" }],
      })
    );
    expect(s).toMatchObject({ registered: 1, onboarded: 1, calendarConnected: 0, activeToday: 0, active7Days: 0, quiet: 1 });
  });

  it("tells today, the last week and the last month apart", () => {
    const s = computeMemberStats(
      input({
        accounts: [account("today"), account("lastWeek"), account("lastMonth"), account("old")],
        activity: [
          { memberId: "today", at: "2026-10-06T09:00:00Z" },
          { memberId: "lastWeek", at: "2026-10-02T09:00:00Z" },
          { memberId: "lastMonth", at: "2026-09-15T09:00:00Z" },
          { memberId: "old", at: "2026-08-01T09:00:00Z" },
        ],
      })
    );
    expect(s.activeToday).toBe(1);
    expect(s.active7Days).toBe(2);
    expect(s.active30Days).toBe(3);
    expect(s.quiet).toBe(1);
  });

  it("calls someone returning only if they did something on three separate days this week", () => {
    const s = computeMemberStats(
      input({
        accounts: [account("habit"), account("burst")],
        activity: [
          { memberId: "habit", at: "2026-10-06T09:00:00Z" },
          { memberId: "habit", at: "2026-10-05T09:00:00Z" },
          { memberId: "habit", at: "2026-10-03T09:00:00Z" },
          // Twenty things in one day is still one day.
          ...Array.from({ length: 20 }, () => ({ memberId: "burst", at: "2026-10-06T10:00:00Z" })),
        ],
      })
    );
    expect(s.returning).toBe(1);
    expect(s.activeToday).toBe(2);
  });

  it("draws the daily line from the last fourteen London days, oldest first", () => {
    const s = computeMemberStats(
      input({
        accounts: [account("a"), account("b")],
        activity: [
          { memberId: "a", at: "2026-10-06T08:00:00Z" },
          { memberId: "b", at: "2026-10-06T09:00:00Z" },
          { memberId: "a", at: "2026-09-23T09:00:00Z" },
          // Just before London midnight at the start of the 6th: still the 5th in UTC terms but the 6th in London.
          { memberId: "b", at: "2026-10-05T23:30:00Z" },
        ],
      })
    );
    expect(s.daily[0].date).toBe("2026-09-23");
    expect(s.daily[13].date).toBe("2026-10-06");
    expect(s.daily[0].members).toBe(1);
    expect(s.daily[13].members).toBe(2);
  });

  it("ignores activity from the future, from unknown people and with unreadable dates", () => {
    const s = computeMemberStats(
      input({
        accounts: [account("a")],
        activity: [
          { memberId: "a", at: "2026-10-07T09:00:00Z" },
          { memberId: "ghost", at: "2026-10-06T09:00:00Z" },
          { memberId: "a", at: "not a date" },
        ],
      })
    );
    expect(s.active7Days).toBe(0);
    expect(s.quiet).toBe(1);
  });
});
