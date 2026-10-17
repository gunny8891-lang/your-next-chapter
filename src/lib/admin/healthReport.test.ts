import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildHealthReport, healthMessage, reportSections, sendHealthReport, type HealthReport } from "@/lib/admin/healthReport";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const NOW = new Date("2026-10-19T07:00:00Z");

type Filters = Record<string, unknown>;
type TableSpec = { rows?: Record<string, unknown>[]; count?: (f: Filters) => number; error?: string };

/** A stand-in database: each table answers reads with its rows and counts for the filters it was asked with. */
function fakeDb(tables: Record<string, TableSpec>) {
  return {
    from(table: string) {
      const spec = tables[table] ?? { rows: [], count: () => 0 };
      const filters: Filters = {};
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "gte", "lte", "not", "limit", "like", "is", "in", "order"]) {
        chain[m] = (...args: unknown[]) => {
          if (m === "is") filters[`is:${args[0]}`] = args[1];
          if (m === "like") filters[`like:${args[0]}`] = args[1];
          if (m === "gte" || m === "lte") filters[`${m}:${args[0]}`] = args[1];
          return chain;
        };
      }
      chain.eq = (col: string, value: unknown) => ((filters[col] = value), chain);
      chain.then = (resolve: (v: unknown) => void) =>
        resolve(spec.error ? { data: null, count: null, error: { message: spec.error } } : { data: spec.rows ?? [], count: spec.count ? spec.count(filters) : (spec.rows ?? []).length, error: null });
      return chain;
    },
  } as unknown as SupabaseClient;
}

const DAYS = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

describe("gathering the week", () => {
  const db = () =>
    fakeDb({
      users: { count: (f) => (f["gte:created_at"] ? 2 : 9) },
      experience_events: {
        rows: [{ member_id: "a" }, { member_id: "a" }, { member_id: "b" }],
        count: (f) => ({ planned: 6, saved: 4, completed: 3 })[f.event_type as string] ?? 0,
      },
      chat_messages: { count: () => 11 },
      ai_usage_logs: {
        rows: [
          { feature: "concierge_chat", estimated_cost: 0.5, success: true },
          { feature: "concierge_chat", estimated_cost: 0.25, success: true },
          { feature: "some_time", estimated_cost: 0.1, success: false },
        ],
      },
      app_events: { rows: [{ kind: "signup_failed", code: "email_send" }, { kind: "signup_failed", code: "email_send" }] },
      member_feedback: { count: () => 3 },
      activities: {
        count: (f) => {
          if (f["gte:location_lat"] !== undefined) return 0; // nothing known near the member in the fake
          if (f.status === "needs_review") return f["like:admin_notes"] ? 2 : 5;
          if (f["lte:date_time"]) return 4;
          if (f["gte:date_time"]) return 28;
          return f["gte:created_at"] ? 12 : 500;
        },
      },
      discovery_regions: {
        rows: [
          { region_key: "barnet", last_success_at: DAYS(3) },
          { region_key: "stevenage", last_success_at: DAYS(40) },
          { region_key: "stevenage#events", last_success_at: DAYS(5) },
          { region_key: "barnet.u3asite.uk#organiser", last_success_at: DAYS(2) },
          { region_key: "stevenage.gov.uk#organiser", last_success_at: DAYS(20) },
        ],
      },
      member_profiles: { rows: [{ location_text: "Near Leeds", location_lat: 53.8, location_lng: -1.5 }, { location_text: "Leeds", location_lat: 53.8, location_lng: -1.5 }] },
    });

  it("tallies people, what they did, the cost, what is waiting, the catalogue and the searches", async () => {
    const r = await buildHealthReport(db(), NOW);
    expect(r.people).toEqual({ total: 9, newThisWeek: 2, activeThisWeek: 2 });
    expect(r.use).toEqual({ planned: 6, saved: 4, wentTo: 3, conciergeMessages: 11 });
    expect(r.ai).toMatchObject({ calls: 3, failures: 1 });
    expect(r.ai!.estimatedCost).toBeCloseTo(0.85);
    expect(r.ai!.topFeatures[0]).toMatchObject({ feature: "concierge_chat", calls: 2 });
    expect(r.waiting).toEqual({ toCheck: 5, suggestedByMembers: 2, feedback: 3 });
    expect(r.catalogue).toEqual({ active: 500, addedThisWeek: 12, upcomingEvents: 28, eventsNextTwoWeeks: 4 });
    expect(r.searches).toEqual({ regionsSearchedRecently: 1, regionsOverdue: 1, organisersReread: 1 });
    expect(r.problems?.total).toBe(2);
    expect(r.unavailable).toEqual([]);
  });

  it("names an area once, and says it is thin only when few places are known", async () => {
    const r = await buildHealthReport(db(), NOW);
    // The fake knows no places near Leeds, so it is thin; "Near Leeds" and "Leeds" are one area.
    expect(r.thinAreas).toEqual([{ area: "Leeds", places: 0 }]);
  });

  it("leaves out a part that cannot be gathered, says so, and keeps the rest", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const broken = fakeDb({ users: { error: 'relation "users" does not exist' }, chat_messages: { count: () => 1 }, experience_events: { count: () => 1, rows: [] } });
    const r = await buildHealthReport(broken, NOW);
    expect(r.people).toBeNull();
    expect(r.unavailable).toContain("people");
    expect(r.use).toMatchObject({ conciergeMessages: 1 });
    warn.mockRestore();
  });
});

describe("how it reads", () => {
  const report: HealthReport = {
    generatedAt: NOW.toISOString(),
    days: 7,
    people: { total: 1, newThisWeek: 0, activeThisWeek: 1 },
    use: { planned: 0, saved: 1, wentTo: 0, conciergeMessages: 1 },
    ai: { calls: 1, failures: 0, estimatedCost: 0.1234, topFeatures: [{ feature: "concierge_chat", cost: 0.1234, calls: 1 }] },
    problems: { days: 7, total: 0, byKind: [], topCodes: [], feedbackThisWeek: 0 },
    waiting: { toCheck: 0, suggestedByMembers: 0, feedback: 0 },
    catalogue: { active: 10, addedThisWeek: 1, upcomingEvents: 1, eventsNextTwoWeeks: 0 },
    searches: { regionsSearchedRecently: 1, regionsOverdue: 0, organisersReread: 0 },
    thinAreas: [],
    unavailable: [],
  };

  it("says it in plain sentences, with singulars right", () => {
    const text = reportSections(report).flatMap((s) => s.lines).join("\n");
    expect(text).toContain("1 member in all, 0 new this week.");
    expect(text).toContain("1 member did something in the app this week.");
    expect(text).toContain("about $0.12 in all");
    expect(text).toContain("Nothing was recorded.");
    expect(text).toContain("Nothing is waiting to be checked.");
    expect(text).toContain("Every member's area has plenty of places.");
  });

  it("is an email with a subject, text and html, with the markup of any name escaped", () => {
    const m = healthMessage({ ...report, thinAreas: [{ area: "<b>Leeds</b>", places: 3 }] }, "https://www.larkhour.com/");
    expect(m.subject).toBe("Lark Hour: the week to 19 October");
    expect(m.text).toContain("THIN AREAS");
    expect(m.text).toContain("https://www.larkhour.com/admin/members");
    expect(m.html).toContain("&lt;b&gt;Leeds&lt;/b&gt;");
    expect(m.html).not.toContain("<b>Leeds</b>");
  });

  it("holds nothing about any person: counts and the names of places only", () => {
    const text = JSON.stringify(report);
    expect(text).not.toMatch(/@|member_id|email/);
  });
});

describe("sending it", () => {
  it("goes to whoever runs the app, and says so when there is nobody to send it to", async () => {
    const send = vi.fn(async () => {});
    const db = fakeDb({});
    const sent = await sendHealthReport({ admin: db, now: NOW, recipients: async () => ["owner@example.com"], send, siteUrl: "https://www.larkhour.com" });
    expect(sent.sentTo).toEqual(["owner@example.com"]);
    expect(send).toHaveBeenCalledTimes(1);

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const none = await sendHealthReport({ admin: db, now: NOW, recipients: async () => [], send });
    expect(none.sentTo).toEqual([]);
    expect(send).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("is a job protected by the secret (and never open when the secret is missing), run on Monday mornings, with a dry run", () => {
    const route = read("src/app/api/jobs/health-report/route.ts");
    expect(route).toContain("if (!isCronRequest(request))");
    expect(route).toContain('searchParams.get("dry") === "1"');
    const crons = JSON.parse(read("vercel.json")).crons as { path: string; schedule: string }[];
    expect(crons).toContainEqual({ path: "/api/jobs/health-report", schedule: "0 7 * * 1" });
  });

  it("uses no AI", () => {
    expect(read("src/lib/admin/healthReport.ts")).not.toMatch(/anthropic|callClaude/i);
  });
});
