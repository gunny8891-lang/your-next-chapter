import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ACCEPTED_DOCUMENTS, isNewAccount, recordAcceptance } from "@/lib/legal/acceptance";
import { LEGAL_LAST_UPDATED, LEGAL_VERSION } from "@/lib/legal/details";
import { authErrorMessage } from "@/lib/auth/messages";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

/** A stand-in for the database client that remembers what it was asked to write. */
function fakeAdmin(result: { error: { message: string } | null } = { error: null }) {
  const calls: { table: string; rows: unknown; options: unknown }[] = [];
  const client = {
    from: (table: string) => ({
      upsert: async (rows: unknown, options: unknown) => {
        calls.push({ table, rows, options });
        return result;
      },
    }),
  };
  return { client: client as never, calls };
}

describe("the version a member agrees to", () => {
  it("is the same day as the 'last updated' date printed on the pages", () => {
    const printed = new Date(`${LEGAL_LAST_UPDATED} 12:00:00 UTC`);
    expect(Number.isNaN(printed.getTime())).toBe(false);
    expect(printed.toISOString().slice(0, 10)).toBe(LEGAL_VERSION);
  });

  it("fits what the table accepts (a date, year first)", () => {
    expect(LEGAL_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(read("supabase/migrations/20260101000024_legal_acceptances.sql")).toContain("version ~ '^\\d{4}-\\d{2}-\\d{2}$'");
  });
});

describe("recording the agreement", () => {
  it("writes the terms and the privacy notice, with the version shown, for that member", async () => {
    const { client, calls } = fakeAdmin();
    const result = await recordAcceptance(client, "member-1");
    expect(result.error).toBeNull();
    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe("legal_acceptances");
    expect(calls[0].rows).toEqual(ACCEPTED_DOCUMENTS.map((document) => ({ member_id: "member-1", document, version: LEGAL_VERSION, source: "signup" })));
  });

  it("agreeing to the same version twice changes nothing", async () => {
    const { client, calls } = fakeAdmin();
    await recordAcceptance(client, "member-1");
    expect(calls[0].options).toEqual({ onConflict: "member_id,document,version", ignoreDuplicates: true });
  });

  it("reports a failure instead of throwing, so a sign-up that worked is not undone", async () => {
    const { client } = fakeAdmin({ error: { message: "relation does not exist" } });
    await expect(recordAcceptance(client, "member-1")).resolves.toEqual({ error: "relation does not exist" });
  });

  it("covers both documents the sign-up form names", () => {
    expect([...ACCEPTED_DOCUMENTS].sort()).toEqual(["privacy", "terms"]);
    expect(read("src/app/signup/page.tsx")).toContain('href="/terms"');
    expect(read("src/app/signup/page.tsx")).toContain('href="/privacy"');
  });
});

describe("telling a new account from an already-registered address", () => {
  it("accepts a user the provider really created", () => {
    expect(isNewAccount({ id: "u1", identities: [{ provider: "email" }] })).toBe(true);
  });

  it("refuses the look-alike returned for an address that already has an account", () => {
    expect(isNewAccount({ id: "u1", identities: [] })).toBe(false);
    expect(isNewAccount({ id: "u1" })).toBe(false);
    expect(isNewAccount(null)).toBe(false);
    expect(isNewAccount(undefined)).toBe(false);
  });
});

describe("the sign-up", () => {
  const action = read("src/app/auth/actions.ts");
  const form = read("src/app/signup/page.tsx");

  it("needs the box ticked, in the form and again on the server", () => {
    expect(form).toMatch(/name="accept"[\s\S]*?required/);
    expect(action).toContain('formData.get("accept") !== "on"');
    expect(action.indexOf('formData.get("accept")')).toBeLessThan(action.indexOf("auth.signUp("));
  });

  it("explains a missing tick in kind words", () => {
    expect(authErrorMessage("terms_not_accepted")).toMatch(/tick the box/);
  });

  it("writes the agreement only after the account exists, and only for a genuinely new one", () => {
    expect(action.indexOf("isNewAccount(data.user)")).toBeGreaterThan(action.indexOf("auth.signUp("));
    expect(action).toContain("recordAcceptance(createAdminClient(), data.user.id)");
  });
});
