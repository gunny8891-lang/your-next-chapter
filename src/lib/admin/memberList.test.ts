import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildMemberList, MAX_LISTED, type ListedAccount } from "@/lib/admin/memberList";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const acct = (id: string, email: string | null, createdAt: string, confirmedAt: string | null = createdAt): ListedAccount => ({ id, email, createdAt, confirmedAt });

describe("who has registered", () => {
  const accounts = [
    acct("a", "old@example.test", "2026-07-26T11:21:00Z"),
    acct("b", "new@example.test", "2026-10-11T18:05:00Z", null),
    acct("c", "admin@example.test", "2026-07-26T14:24:00Z"),
    acct("d", "mid@example.test", "2026-10-09T21:12:00Z"),
  ];

  it("lists members newest first, leaving out admins, with whether they confirmed and finished setting up", () => {
    const { rows, total } = buildMemberList(accounts, new Set(["c"]), [{ userId: "d", weeklyPlan: true }, { userId: "a", weeklyPlan: false }]);
    expect(total).toBe(3);
    expect(rows.map((r) => r.email)).toEqual(["new@example.test", "mid@example.test", "old@example.test"]);
    expect(rows[0]).toEqual({ email: "new@example.test", joined: "2026-10-11", emailConfirmed: false, finishedOnboarding: false, weeklyPlanEmail: null });
    expect(rows[1]).toMatchObject({ emailConfirmed: true, finishedOnboarding: true, weeklyPlanEmail: true });
    expect(rows[2]).toMatchObject({ finishedOnboarding: true, weeklyPlanEmail: false });
  });

  it("skips an account with no address, and shows at most the newest few with the true total", () => {
    expect(buildMemberList([acct("x", null, "2026-01-01T00:00:00Z")], new Set(), []).total).toBe(0);
    const many = Array.from({ length: MAX_LISTED + 5 }, (_, i) => acct(`m${i}`, `m${i}@example.test`, new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString()));
    const { rows, total } = buildMemberList(many, new Set(), []);
    expect(total).toBe(MAX_LISTED + 5);
    expect(rows).toHaveLength(MAX_LISTED);
    expect(rows[0].email).toBe(`m${MAX_LISTED + 4}@example.test`);
  });
});

describe("keeping it for admins", () => {
  it("is read only after the page has checked the viewer is an admin, and the count loader still never reads an address", () => {
    const page = read("src/app/admin/members/page.tsx");
    expect(page.indexOf('profile?.role !== "admin"')).toBeGreaterThan(-1);
    expect(page.indexOf('profile?.role !== "admin"')).toBeLessThan(page.indexOf("loadMemberList(admin)"));
    expect(read("src/lib/admin/memberStatsLoader.ts")).not.toMatch(/u\.email\b/);
  });
});
