import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { agreeUrl, agreementCookieValue, hasAgreedToCurrent, pathNeedsAgreement, safeNext } from "@/lib/legal/gate";
import { LEGAL_VERSION } from "@/lib/legal/details";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("which pages a member who has not agreed is held back from", () => {
  it("holds them back from every member screen", () => {
    for (const path of ["/today", "/week", "/explore", "/chapter", "/chat", "/people", "/onboarding", "/admin/members", "/week/anything"]) {
      expect(pathNeedsAgreement(path), path).toBe(true);
    }
  });

  it("lets them reach the agree screen, the documents, sign-in and out, and their account (to leave)", () => {
    for (const path of ["/agree", "/privacy", "/terms", "/unsubscribe", "/auth/confirm", "/login", "/signup", "/forgot-password", "/reset-password", "/account"]) {
      expect(pathNeedsAgreement(path), path).toBe(false);
    }
  });

  it("leaves the public front page and every API route alone", () => {
    expect(pathNeedsAgreement("/")).toBe(false);
    expect(pathNeedsAgreement("/api/jobs/daily-nudges")).toBe(false);
    expect(pathNeedsAgreement("/api/calendar/callback")).toBe(false);
  });

  it("does not mistake a longer name for an exempt one", () => {
    expect(pathNeedsAgreement("/accounting")).toBe(true);
    expect(pathNeedsAgreement("/agreement")).toBe(true);
  });
});

describe("whether a member has agreed", () => {
  it("needs both the terms and the privacy notice", () => {
    expect(hasAgreedToCurrent([{ document: "terms" }, { document: "privacy" }])).toBe(true);
    expect(hasAgreedToCurrent([{ document: "terms" }])).toBe(false);
    expect(hasAgreedToCurrent([{ document: "privacy" }])).toBe(false);
    expect(hasAgreedToCurrent([])).toBe(false);
  });

  it("remembers, per person and per version, so a changed wording or a different member asks again", () => {
    expect(agreementCookieValue("u1")).toBe(`u1:${LEGAL_VERSION}`);
    expect(agreementCookieValue("u1")).not.toBe(agreementCookieValue("u2"));
    expect(agreementCookieValue("u1", "2026-10-07")).not.toBe(agreementCookieValue("u1", "2026-11-01"));
  });
});

describe("where to go after agreeing", () => {
  it("returns to a page on this site, with its query", () => {
    expect(safeNext("/week")).toBe("/week");
    expect(safeNext("/explore?category=Move")).toBe("/explore?category=Move");
  });

  it("refuses anything that could send a member to another site", () => {
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "evil", "/ok\r\nSet-Cookie: x=y"]) {
      expect(safeNext(bad), bad).toBe("/today");
    }
  });

  it("never loops back to the agree screen, and falls back to today when there is nothing", () => {
    expect(safeNext("/agree")).toBe("/today");
    expect(safeNext("/agree?next=/week")).toBe("/today");
    expect(safeNext(null)).toBe("/today");
    expect(safeNext("")).toBe("/today");
  });

  it("builds the agree address with the page they were heading to", () => {
    expect(agreeUrl("/week", "?day=Wed")).toBe("/agree?next=%2Fweek%3Fday%3DWed");
    expect(safeNext(decodeURIComponent(agreeUrl("/week", "?day=Wed").split("next=")[1]))).toBe("/week?day=Wed");
  });
});

describe("how the check is wired in", () => {
  const middleware = read("src/utils/supabase/middleware.ts");
  const action = read("src/app/agree/actions.ts");
  const page = read("src/app/agree/page.tsx");

  it("runs only for a signed-in member, after the sign-in check, and reads the current version", () => {
    expect(middleware.indexOf("pathNeedsAgreement(")).toBeGreaterThan(middleware.indexOf("!user && !isPublicRoute"));
    expect(middleware).toContain("if (user && pathNeedsAgreement(");
    expect(middleware).toContain('.eq("version", LEGAL_VERSION)');
  });

  it("lets a member in if the record cannot be read, rather than locking everyone out", () => {
    expect(middleware).toMatch(/if \(error\) \{[\s\S]*?letting the member through/);
  });

  it("keeps refreshed sign-in cookies when it redirects", () => {
    expect(middleware).toContain("supabaseResponse.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie))");
  });

  it("the agree action needs the tick, records it as a re-agreement, and only goes to a safe page", () => {
    expect(action).toContain('formData.get("accept") !== "on"');
    expect(action).toContain('recordAcceptance(createAdminClient(), user.id, "reaccept")');
    expect(action).toContain("safeNext(");
    expect(action.indexOf("recordAcceptance(")).toBeLessThan(action.indexOf("cookies()).set("));
  });

  it("the agree page offers the documents, the tick, and a way out (log out, or delete the account)", () => {
    expect(page).toContain('href="/terms"');
    expect(page).toContain('href="/privacy"');
    expect(page).toContain('name="accept"');
    expect(page).toContain("/account#delete");
    expect(page).toContain("action={logout}");
  });
});
