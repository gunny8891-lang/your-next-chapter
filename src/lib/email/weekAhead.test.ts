import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const calls = { generate: [] as { memberId: string; weekStart?: string }[], sent: [] as unknown[][] };

vi.mock("@/lib/itinerary/generateAndSave", () => ({
  getCurrentWeekStart: () => "2026-10-12",
  generateAndSaveItinerary: async (_a: unknown, memberId: string, options?: { weekStart?: string }) => {
    calls.generate.push({ memberId, weekStart: options?.weekStart });
    return { error: null, itineraryId: "it-1" };
  },
}));
vi.mock("@/lib/email/send", () => ({
  sendWeeklyDigestEmail: async (...args: unknown[]) => {
    calls.sent.push(args);
    return { id: "e" };
  },
}));

import { catchUpWeekAhead, planAndEmailWeekAhead, weekAheadFor, weeklyRunHasPassed } from "@/lib/email/weekAhead";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

function db(opts: { existingPlan?: boolean; profile?: Record<string, unknown> | null }) {
  return {
    from(table: string) {
      const b: Record<string, unknown> = {};
      for (const m of ["select", "eq"]) b[m] = () => b;
      b.maybeSingle = async () => {
        if (table === "itineraries") return { data: opts.existingPlan ? { id: "x" } : null };
        if (table === "member_profiles") return { data: opts.profile === undefined ? { user_id: "m1", location_text: "Near Stevenage", email_weekly_plan: true, users: { email: "new@example.test" } } : opts.profile };
        return { data: null };
      };
      b.then = (resolve: (v: unknown) => void) => resolve({ data: [] });
      return b;
    },
  } as unknown as SupabaseClient;
}

beforeEach(() => {
  calls.generate.length = 0;
  calls.sent.length = 0;
});

describe("whether the Sunday-evening job has already run", () => {
  it("has, from the hour it runs on a Sunday until the day ends, and has not on any other day or earlier on the Sunday", () => {
    expect(weeklyRunHasPassed(new Date("2026-10-18T17:59:00Z"))).toBe(false);
    expect(weeklyRunHasPassed(new Date("2026-10-18T18:00:00Z"))).toBe(true);
    expect(weeklyRunHasPassed(new Date("2026-10-18T23:59:00Z"))).toBe(true);
    expect(weeklyRunHasPassed(new Date("2026-10-19T00:30:00Z"))).toBe(false);
    expect(weeklyRunHasPassed(new Date("2026-10-14T19:00:00Z"))).toBe(false);
  });

  it("matches the hour the job is scheduled for", () => {
    const crons = JSON.parse(read("vercel.json")).crons as { path: string; schedule: string }[];
    expect(crons).toContainEqual({ path: "/api/jobs/weekly-digest", schedule: "0 18 * * 0" });
  });

  it("is about the Monday after that Sunday", () => {
    expect(weekAheadFor(new Date("2026-10-18T19:21:00Z"))).toBe("2026-10-19");
  });
});

describe("a member who finishes setting up", () => {
  const AFTER = new Date("2026-10-18T19:21:00Z");

  it("after the Sunday job has run is planned and emailed the week ahead straight away", async () => {
    expect(await catchUpWeekAhead(db({}), "m1", AFTER)).toBeNull();
    expect(calls.generate).toEqual([{ memberId: "m1", weekStart: "2026-10-19" }]);
    expect(calls.sent).toHaveLength(1);
    expect(calls.sent[0][0]).toBe("new@example.test");
    expect(calls.sent[0][1]).toBe("m1");
    expect(calls.sent[0][5]).toBe("2026-10-19");
  });

  it("before the job has run is left for it to include", async () => {
    await catchUpWeekAhead(db({}), "m1", new Date("2026-10-18T12:00:00Z"));
    await catchUpWeekAhead(db({}), "m1", new Date("2026-10-15T20:00:00Z"));
    expect(calls.generate).toEqual([]);
    expect(calls.sent).toEqual([]);
  });

  it("who was already in the job's run is not sent it twice", async () => {
    await catchUpWeekAhead(db({ existingPlan: true }), "m1", AFTER);
    expect(calls.sent).toEqual([]);
  });

  it("who has switched the email off has the week planned in the app and no email", async () => {
    await catchUpWeekAhead(db({ profile: { user_id: "m1", location_text: "Barnet", email_weekly_plan: false, users: { email: "x@example.test" } } }), "m1", AFTER);
    expect(calls.generate).toHaveLength(1);
    expect(calls.sent).toEqual([]);
  });

  it("never throws, and says what went wrong", async () => {
    const broken = { from: () => { throw new Error("db"); } } as unknown as SupabaseClient;
    expect(await catchUpWeekAhead(broken, "m1", AFTER)).toBe("db");
    expect(await planAndEmailWeekAhead(db({}), { user_id: "m1", location_text: null, email_weekly_plan: true, email: null }, "2026-10-19")).toBe("No email on record");
  });
});

describe("the wiring", () => {
  it("onboarding catches a late finisher up without holding up the redirect, and the job has its full time limit", () => {
    expect(read("src/app/onboarding/actions.ts")).toContain("after(() => catchUpWeekAhead(admin, user.id));");
    expect(read("src/app/api/jobs/weekly-digest/route.ts")).toContain("export const maxDuration = 300;");
  });
});
