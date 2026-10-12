import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyNewSignup, signupMessage } from "@/lib/email/signupNotice";

const NOW = new Date("2026-10-12T17:30:00Z");
const admin = {} as SupabaseClient;
const recipients = async () => ["owner@example.com"];
const sender = () => vi.fn<(to: string[], message: { subject: string; text: string; html: string }) => Promise<void>>(async () => {});

afterEach(() => {
  delete process.env.NOTIFY_ON_SIGNUP;
});

describe("the note about a new sign-up", () => {
  it("says who registered, when (in London time), and how many accounts there now are", () => {
    const m = signupMessage("grace@yahoo.com", 6, NOW, "https://www.larkhour.com");
    expect(m.subject).toBe("Lark Hour: new sign-up (grace@yahoo.com)");
    expect(m.text).toContain("grace@yahoo.com");
    expect(m.text).toMatch(/12 October 2026/);
    expect(m.text).toMatch(/18:30/); // 17:30 UTC is 18:30 in London on this date
    expect(m.text).toContain("6 accounts in all");
  });

  it("says what to watch for: that they have not confirmed, and that the email may not have reached them", () => {
    const m = signupMessage("grace@yahoo.com", 1, NOW, "https://www.larkhour.com");
    expect(m.text).toMatch(/not confirmed/);
    expect(m.text).toMatch(/may not have reached them/);
    expect(m.text).toContain("1 account in all");
  });

  it("links the members page, and does not claim a count it does not have", () => {
    const m = signupMessage("a@b.com", null, NOW, "https://www.larkhour.com/");
    expect(m.text).toContain("https://www.larkhour.com/admin/members");
    expect(m.text).not.toMatch(/in all/);
  });

  it("cannot be made to carry markup by an address", () => {
    const m = signupMessage('"><script>alert(1)</script>@x.com', 2, NOW, "https://www.larkhour.com");
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("&lt;script&gt;");
  });
});

describe("sending it", () => {
  it("goes to the person who runs the app, once", async () => {
    const send = sender();
    expect(await notifyNewSignup("grace@yahoo.com", { admin, now: NOW, recipients, send, memberCount: 4 })).toBe("sent");
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toEqual(["owner@example.com"]);
    expect(send.mock.calls[0][1].text).toContain("grace@yahoo.com");
  });

  it("is never sent to the person who registered", async () => {
    const send = sender();
    await notifyNewSignup("grace@yahoo.com", { admin, now: NOW, recipients, send, memberCount: 4 });
    expect(send.mock.calls[0][0]).not.toContain("grace@yahoo.com");
  });

  it("can be turned off", async () => {
    process.env.NOTIFY_ON_SIGNUP = "false";
    const send = sender();
    expect(await notifyNewSignup("grace@yahoo.com", { admin, now: NOW, recipients, send, memberCount: 4 })).toBe("off");
    expect(send).not.toHaveBeenCalled();
  });

  it("says so in the log, and sends nothing, when there is nobody to tell", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const send = sender();
    expect(await notifyNewSignup("grace@yahoo.com", { admin, now: NOW, recipients: async () => [], send })).toBe("no_recipient");
    expect(send).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("never throws, whatever fails, so signing up is never affected", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = vi.fn(async () => {
      throw new Error("Resend is down");
    });
    expect(await notifyNewSignup("grace@yahoo.com", { admin, now: NOW, recipients, send: failing, memberCount: 2 })).toBe("failed");
    expect(await notifyNewSignup("grace@yahoo.com", { admin, now: NOW, recipients: async () => { throw new Error("no database"); } })).toBe("failed");
    error.mockRestore();
  });
});

describe("where it happens", () => {
  const actions = readFileSync(join(process.cwd(), "src/app/auth/actions.ts"), "utf8");

  it("happens for a genuinely new account only, after the response, and not for a repeat sign-up of an existing address", () => {
    const block = actions.slice(actions.indexOf("if (isNewAccount(data.user))"));
    expect(block).toContain("afterResponse(() => notifyNewSignup(registered));");
    // It is inside the new-account branch, before the redirect to "check your email".
    expect(block.indexOf("notifyNewSignup")).toBeLessThan(block.indexOf('redirect("/signup?checkEmail=1")'));
  });

  it("is not awaited, so it cannot slow or break signing up", () => {
    expect(actions).not.toMatch(/await notifyNewSignup/);
  });
});
