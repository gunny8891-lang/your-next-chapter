import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A member who has switched an email off must not get it, and must not cost us the work of
 * making it. These run the two real scheduled jobs against stand-ins for everything they
 * touch, and check what they do for someone opted in and someone opted out.
 */

const sent = { digest: [] as unknown[][], nudge: [] as unknown[][] };
const calls = { detect: [] as string[], generate: [] as string[] };

vi.mock("@/lib/email/send", () => ({
  sendWeeklyDigestEmail: async (...args: unknown[]) => void sent.digest.push(args),
  sendNudgeEmail: async (...args: unknown[]) => void sent.nudge.push(args),
}));
vi.mock("@/lib/nudges/detect", () => ({
  detectNudgeCandidate: async (_admin: unknown, memberId: string) => {
    calls.detect.push(memberId);
    return { reason: "activity_gap", activity: { id: "a1", title: "Kew", category: "Nature", address: null, date_time: null, booking_url: null } };
  },
}));
vi.mock("@/lib/nudges/message", () => ({ writeNudgeMessage: async () => "A thought." }));
vi.mock("@/lib/experience/dailyStateStore", () => ({ purgeOldDailyStates: async () => 0 }));
vi.mock("@/lib/itinerary/generateAndSave", () => ({
  getCurrentWeekStart: () => "2026-10-05",
  generateAndSaveItinerary: async (_admin: unknown, memberId: string) => {
    calls.generate.push(memberId);
    return { error: null, itineraryId: "it-1" };
  },
}));

const members = [
  { user_id: "opted-in", location_text: "Barnet", interests: [], email_weekly_plan: true, email_reminders: true, users: { email: "in@example.test", status: "active" } },
  { user_id: "opted-out", location_text: "Barnet", interests: [], email_weekly_plan: false, email_reminders: false, users: { email: "out@example.test", status: "active" } },
];

vi.mock("@/utils/supabase/admin", () => ({
  createAdminClient: () => ({
    from(table: string) {
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: () => builder,
        insert: async () => ({ error: null }),
        maybeSingle: async () => ({ data: null }),
        then: (resolve: (v: unknown) => void) => resolve({ data: table === "member_profiles" ? members : [] }),
      };
      return builder;
    },
  }),
}));

const authed = () => new Request("https://app.test/api/jobs/x", { headers: { authorization: "Bearer secret" } });

beforeEach(() => {
  process.env.CRON_SECRET = "secret";
  sent.digest.length = 0;
  sent.nudge.length = 0;
  calls.detect.length = 0;
  calls.generate.length = 0;
});

describe("daily reminders", () => {
  it("go to a member who has them on, carrying who they are for (so the unsubscribe link is theirs)", async () => {
    const { GET } = await import("@/app/api/jobs/daily-nudges/route");
    await GET(authed());
    expect(sent.nudge).toHaveLength(1);
    expect(sent.nudge[0][0]).toBe("in@example.test");
    expect(sent.nudge[0][1]).toBe("opted-in");
  });

  it("are not found, written or sent for a member who has switched them off", async () => {
    const { GET } = await import("@/app/api/jobs/daily-nudges/route");
    const res = await GET(authed());
    const body = (await res.json()) as { results: { memberId: string; sent: boolean; error?: string }[] };
    expect(calls.detect).toEqual(["opted-in"]);
    expect(sent.nudge.map((a) => a[0])).not.toContain("out@example.test");
    expect(body.results.find((r) => r.memberId === "opted-out")).toMatchObject({ sent: false, error: "Opted out of reminders" });
  });
});

describe("the weekly plan email", () => {
  it("goes to a member who has it on, carrying who it is for", async () => {
    const { GET } = await import("@/app/api/jobs/weekly-digest/route");
    await GET(authed());
    const toIn = sent.digest.find((a) => a[0] === "in@example.test");
    expect(toIn?.[1]).toBe("opted-in");
  });

  it("is not sent to a member who has switched it off, though their week is still planned in the app", async () => {
    const { GET } = await import("@/app/api/jobs/weekly-digest/route");
    await GET(authed());
    expect(sent.digest.map((a) => a[0])).not.toContain("out@example.test");
    expect(calls.generate).toEqual(expect.arrayContaining(["opted-in", "opted-out"]));
  });
});

describe("both jobs still refuse anyone without the secret", () => {
  it("returns 401", async () => {
    const nudges = await import("@/app/api/jobs/daily-nudges/route");
    const digest = await import("@/app/api/jobs/weekly-digest/route");
    for (const GET of [nudges.GET, digest.GET]) expect((await GET(new Request("https://app.test/x"))).status).toBe(401);
  });
});
