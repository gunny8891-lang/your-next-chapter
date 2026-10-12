import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanMessage, cleanPage, feedbackEmail, FEEDBACK_MAX_CHARS, FEEDBACK_PER_DAY, submitFeedback } from "@/lib/feedbackSubmit";
import { cleanCode, purgeOldAppEvents, recordAppEvent } from "@/lib/appEvents";
import { loadProblems } from "@/lib/admin/problemsLoader";
import { coverageNote, STRONGEST_AREAS } from "@/lib/coverage/strongest";
import { afterResponse } from "@/lib/afterResponse";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("what is written", () => {
  it("is tidied: no control characters, runs of blank lines shortened, trimmed, and kept to a sensible length", () => {
    expect(cleanMessage("  Hello\u0000 there\r\n\r\n\r\n\r\nthanks  ")).toBe("Hello there\n\nthanks");
    expect(cleanMessage("x".repeat(FEEDBACK_MAX_CHARS + 500))).toHaveLength(FEEDBACK_MAX_CHARS);
  });

  it("is nothing when there is nothing in it", () => {
    for (const empty of ["", "   ", "\n\n", null, undefined, 42]) expect(cleanMessage(empty as never)).toBeNull();
  });

  it("says where it came from only from a fixed list", () => {
    expect(cleanPage("My Week")).toBe("My Week");
    expect(cleanPage("<script>")).toBe("Somewhere else");
    expect(cleanPage(undefined)).toBe("Somewhere else");
  });

  it("cannot carry markup into the email", () => {
    const m = feedbackEmail("Today", "<b>hi</b> & bye", "grace@yahoo.com");
    expect(m.html).not.toContain("<b>");
    expect(m.html).toContain("&lt;b&gt;hi&lt;/b&gt; &amp; bye");
  });

  it("can be answered by replying, when there is an address", () => {
    expect(feedbackEmail("Today", "hello", "grace@yahoo.com").replyTo).toBe("grace@yahoo.com");
    expect(feedbackEmail("Today", "hello", null).replyTo).toBeUndefined();
    expect(feedbackEmail("My Week", "hello", "g@y.com").subject).toBe("Lark Hour feedback: My Week");
  });
});

/** A usage of the feedback table that answers the daily count and records what is inserted. */
function fakeAdmin(opts: { today?: number; tableMissing?: boolean } = {}) {
  const inserted: Record<string, unknown>[] = [];
  const admin = {
    from: () => ({
      select: () => ({
        eq: () => ({
          gte: async () => (opts.tableMissing ? { count: null, error: { message: "relation does not exist" } } : { count: opts.today ?? 0, error: null }),
        }),
      }),
      insert: async (row: Record<string, unknown>) => {
        if (opts.tableMissing) return { error: { message: "relation does not exist" } };
        inserted.push(row);
        return { error: null };
      },
    }),
  } as unknown as SupabaseClient;
  return { admin, inserted };
}
const recipients = async () => ["owner@example.com"];
const input = { memberId: "m1", memberEmail: "grace@yahoo.com", page: "Today", message: "The button was hard to find." };

describe("sending it", () => {
  it("is kept and emailed, with the reply-to as the member", async () => {
    const { admin, inserted } = fakeAdmin();
    const send = vi.fn(async () => {});
    expect(await submitFeedback(input, { admin, recipients, send })).toBe("sent");
    expect(inserted).toEqual([{ member_id: "m1", page: "Today", message: "The button was hard to find." }]);
    expect(send).toHaveBeenCalledTimes(1);
    expect((send.mock.calls[0] as unknown[])[1]).toMatchObject({ replyTo: "grace@yahoo.com" });
  });

  it("is still emailed when the table is not there yet, so nothing waits on the migration", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { admin } = fakeAdmin({ tableMissing: true });
    const send = vi.fn(async () => {});
    expect(await submitFeedback(input, { admin, recipients, send })).toBe("sent");
    expect(send).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("is still kept when the email cannot be sent", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { admin, inserted } = fakeAdmin();
    const send = vi.fn(async () => {
      throw new Error("Resend is down");
    });
    expect(await submitFeedback(input, { admin, recipients, send })).toBe("sent");
    expect(inserted).toHaveLength(1);
    error.mockRestore();
  });

  it("is only a failure when neither worked", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { admin } = fakeAdmin({ tableMissing: true });
    const send = vi.fn(async () => {
      throw new Error("Resend is down");
    });
    expect(await submitFeedback(input, { admin, recipients, send })).toBe("failed");
    error.mockRestore();
    warn.mockRestore();
  });

  it("is refused when empty, and when they have already sent a few today", async () => {
    const send = vi.fn(async () => {});
    expect(await submitFeedback({ ...input, message: "   " }, { admin: fakeAdmin().admin, recipients, send })).toBe("empty");
    expect(await submitFeedback(input, { admin: fakeAdmin({ today: FEEDBACK_PER_DAY }).admin, recipients, send })).toBe("too_many");
    expect(send).not.toHaveBeenCalled();
  });
});

describe("the feedback screen", () => {
  it("is where the links on Today, My Week and Account lead, with the email address kept as another way", () => {
    expect(read("src/components/FeedbackLink.tsx")).toContain("/feedback?from=");
    const account = read("src/components/AccountSettingsForm.tsx");
    expect(account).toContain('href="/feedback?from=Account"');
    expect(account).toContain('href={feedbackHref("Account")}');
  });

  it("is for signed-in members and shows the tab bar", () => {
    expect(read("src/app/feedback/page.tsx")).toContain('redirect("/login")');
    expect(read("src/components/shell.ts")).toContain('"/feedback"');
  });

  it("asks nothing the person did not give: their words and where they were", () => {
    const page = read("src/app/feedback/page.tsx");
    expect(page).toMatch(/We'll see your email address so we can reply, and nothing else about you/);
  });
});

describe("the record of what went wrong", () => {
  it("holds only a short code, never a sentence that could carry a person's details", () => {
    expect(cleanCode("email_send")).toBe("email_send");
    expect(cleanCode("grace@yahoo.com is not valid")).toBe("graceyahoo.comisnotvalid".replace(".", ""));
    expect(cleanCode("")).toBe("unknown");
    expect(cleanCode(null)).toBe("unknown");
    expect(cleanCode("a".repeat(200))).toHaveLength(60);
  });

  it("is written with the kind and the code and nothing more, and never throws", async () => {
    const inserts: Record<string, unknown>[] = [];
    const admin = { from: () => ({ insert: async (row: Record<string, unknown>) => (inserts.push(row), { error: null }) }) } as unknown as SupabaseClient;
    expect(await recordAppEvent("signup_failed", "email_send", { admin })).toBe(true);
    expect(inserts).toEqual([{ kind: "signup_failed", code: "email_send" }]);
    const broken = { from: () => { throw new Error("no database"); } } as unknown as SupabaseClient;
    expect(await recordAppEvent("signup_failed", "x", { admin: broken })).toBe(false);
  });

  it("is recorded where sign-up, log-in, resend and password change fail, but not for a wrong password", () => {
    const actions = read("src/app/auth/actions.ts");
    expect(actions).toContain('recordAppEvent("signup_failed", code)');
    expect(actions).toContain('recordAppEvent("resend_failed", code)');
    expect(actions).toContain('recordAppEvent("reset_failed", code)');
    expect(actions).toContain('if (code !== "bad_credentials") afterResponse(() => recordAppEvent("login_failed", code))');
  });

  it("is also left by a screen that breaks, only for someone signed in", () => {
    expect(read("src/app/error.tsx")).toContain("reportPageError(error.digest)");
    expect(read("src/app/error-actions.ts")).toContain("if (!user) return;");
  });

  it("is purged after ninety days, with the nightly job", async () => {
    const now = new Date("2026-10-12T12:00:00Z");
    let cutoff = "";
    const admin = { from: () => ({ delete: () => ({ lt: (_c: string, v: string) => ((cutoff = v), { select: async () => ({ data: [{ id: 1 }, { id: 2 }], error: null }) }) }) }) } as unknown as SupabaseClient;
    expect(await purgeOldAppEvents(admin, now)).toBe(2);
    expect(cutoff).toBe("2026-07-14T12:00:00.000Z");
    expect(read("src/app/api/discovery/run/route.ts")).toContain("purgeOldAppEvents(admin)");
  });

  it("is summarised for the admin as counts and codes, or left out when the table is not there", async () => {
    const rows = [
      { kind: "signup_failed", code: "email_send" },
      { kind: "signup_failed", code: "email_send" },
      { kind: "login_failed", code: "unconfirmed" },
    ];
    const admin = {
      from: (table: string) => ({
        select: (_c: string, opts?: { head?: boolean }) =>
          opts?.head
            ? { gte: async () => ({ count: 3, error: null }) }
            : { gte: () => ({ limit: async () => (table === "app_events" ? { data: rows, error: null } : { data: [], error: null }) }) },
      }),
    } as unknown as SupabaseClient;
    const summary = (await loadProblems(admin, new Date("2026-10-12T12:00:00Z")))!;
    expect(summary.total).toBe(3);
    expect(summary.byKind[0]).toEqual({ kind: "signup_failed", count: 2 });
    expect(summary.topCodes[0].label).toBe("Sign-ups that failed: email_send");
    expect(summary.feedbackThisWeek).toBe(3);

    const missing = { from: () => ({ select: () => ({ gte: () => ({ limit: async () => ({ data: null, error: { message: "no table" } }) }) }) }) } as unknown as SupabaseClient;
    expect(await loadProblems(missing)).toBeNull();
  });

  it("is a table of its own with no member in it, so it holds nothing personal", () => {
    const sql = read("supabase/migrations/20260101000027_feedback_and_app_events.sql");
    const start = sql.indexOf("create table public.app_events");
    const columns = sql.slice(start, sql.indexOf("\n);", start)).replace(/--.*$/gm, "");
    expect(columns).not.toMatch(/member_id|user_id|email|name/);
    expect(columns).toMatch(/kind text/);
    expect(columns).toMatch(/code text/);
    expect(sql).toMatch(/create table public\.member_feedback[\s\S]*references public\.users \(id\) on delete cascade/);
  });
});

describe("telling people where it is strongest", () => {
  it("says the places and that elsewhere grows", () => {
    const note = coverageNote();
    expect(note).toContain("Barnet and Stevenage");
    expect(note).toMatch(/Elsewhere/);
    expect([...STRONGEST_AREAS]).toEqual(["Barnet", "Stevenage"]);
  });

  it("reads right for one place, and for three", () => {
    expect(coverageNote(["Barnet"])).toContain("strongest around Barnet for now");
    expect(coverageNote(["Barnet", "Stevenage", "Hitchin"])).toContain("Barnet, Stevenage and Hitchin");
  });

  it("is on the sign-up page, before the form", () => {
    const page = read("src/app/signup/page.tsx");
    expect(page).toContain("{coverageNote()}");
    expect(page.indexOf("coverageNote()")).toBeLessThan(page.indexOf('name="email"'));
  });
});

describe("running something after the response", () => {
  it("still runs it, and swallows its failure, where there is no response to follow", async () => {
    const ran = vi.fn(async () => {});
    afterResponse(ran);
    await Promise.resolve();
    expect(ran).toHaveBeenCalledTimes(1);
    expect(() => afterResponse(async () => { throw new Error("boom"); })).not.toThrow();
  });
});
