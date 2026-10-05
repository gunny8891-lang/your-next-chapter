import { createHmac, randomUUID } from "node:crypto";
import { render } from "@react-email/render";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { NudgeEmail } from "@/lib/email/NudgeEmail";
import { WeeklyDigestEmail } from "@/lib/email/WeeklyDigestEmail";
import { footerFor, senderLine, unsubscribeUrlFor } from "@/lib/email/footer";
import { senderSettings, unsubscribeHeaders } from "@/lib/email/send";
import { COLUMN_FOR_KIND, signUnsubscribeToken, unsubscribeSecret, verifyUnsubscribeToken } from "@/lib/email/unsubscribe";

const SECRET = "test-secret-value";
const ME = randomUUID();
const SITE = "https://app.example.test";

/** A token signed correctly by us, but for whatever payload we choose: for testing what is accepted after the signature checks out. */
const signedPayload = (text: string) => {
  const payload = Buffer.from(text).toString("base64url");
  return `${payload}.${createHmac("sha256", SECRET).update(payload).digest("base64url")}`;
};

describe("the unsubscribe link", () => {
  it("names the member and the kind of email, and nothing else", () => {
    const token = signUnsubscribeToken(ME, "reminders", SECRET);
    expect(verifyUnsubscribeToken(token, SECRET)).toEqual({ memberId: ME, kind: "reminders" });
  });

  it("works for each kind", () => {
    expect(verifyUnsubscribeToken(signUnsubscribeToken(ME, "weekly_plan", SECRET), SECRET)?.kind).toBe("weekly_plan");
  });

  it("cannot be made by anyone without the secret", () => {
    const forged = signUnsubscribeToken(ME, "reminders", "someone-elses-guess");
    expect(verifyUnsubscribeToken(forged, SECRET)).toBeNull();
  });

  it("cannot be edited to unsubscribe someone else or another kind", () => {
    const [payload, signature] = signUnsubscribeToken(ME, "reminders", SECRET).split(".");
    const other = Buffer.from(`${randomUUID()}.reminders`).toString("base64url");
    const otherKind = Buffer.from(`${ME}.weekly_plan`).toString("base64url");
    expect(verifyUnsubscribeToken(`${other}.${signature}`, SECRET)).toBeNull();
    expect(verifyUnsubscribeToken(`${otherKind}.${signature}`, SECRET)).toBeNull();
    expect(verifyUnsubscribeToken(`${payload}.${signature}x`, SECRET)).toBeNull();
    expect(verifyUnsubscribeToken(`${payload}.`, SECRET)).toBeNull();
  });

  it("is refused when it is missing, empty or nonsense", () => {
    for (const bad of [undefined, null, "", "abc", "a.b.c", ".", "..", "a.b.c.d"]) expect(verifyUnsubscribeToken(bad as never, SECRET)).toBeNull();
  });

  it("is refused even when correctly signed, if it is not a real member and a kind we know", () => {
    expect(verifyUnsubscribeToken(signedPayload(`${ME}.reminders`), SECRET)).toEqual({ memberId: ME, kind: "reminders" });
    expect(verifyUnsubscribeToken(signedPayload(`${ME}.everything`), SECRET)).toBeNull();
    expect(verifyUnsubscribeToken(signedPayload("not-an-id.reminders"), SECRET)).toBeNull();
    expect(verifyUnsubscribeToken(signedPayload(`${ME}.reminders.extra`), SECRET)).toBeNull();
  });

  it("has a column to switch off for each kind", () => {
    expect(COLUMN_FOR_KIND).toEqual({ weekly_plan: "email_weekly_plan", reminders: "email_reminders" });
  });

  it("uses its own secret when set, otherwise one derived from the backend key, otherwise none", () => {
    expect(unsubscribeSecret({ UNSUBSCRIBE_SECRET: "mine" })).toBe("mine");
    const derived = unsubscribeSecret({ SUPABASE_SERVICE_ROLE_KEY: "service-key" });
    expect(derived).toBeTruthy();
    expect(derived).not.toContain("service-key");
    expect(unsubscribeSecret({ SUPABASE_SERVICE_ROLE_KEY: "service-key" })).toBe(derived);
    expect(unsubscribeSecret({})).toBeNull();
  });
});

describe("the footer", () => {
  it("states only company details that have really been supplied", () => {
    expect(senderLine({ companyName: null, address: null })).toBeNull();
    expect(senderLine({ companyName: "Example Ltd", address: null })).toBe("Example Ltd");
    expect(senderLine({ companyName: "Example Ltd", address: "1 Example Street, London" })).toBe("Example Ltd, 1 Example Street, London");
  });

  it("links to the unsubscribe page with a token that verifies", () => {
    const url = new URL(unsubscribeUrlFor(ME, "reminders", SITE, SECRET)!);
    expect(url.origin + url.pathname).toBe(`${SITE}/unsubscribe`);
    expect(verifyUnsubscribeToken(url.searchParams.get("token"), SECRET)).toEqual({ memberId: ME, kind: "reminders" });
  });

  it("has no unsubscribe link rather than a broken one when there is nothing to sign with", () => {
    expect(unsubscribeUrlFor(ME, "reminders", SITE, null)).toBeNull();
  });

  it("says why the email came, in terms of what the member has switched on", () => {
    process.env.UNSUBSCRIBE_SECRET = SECRET;
    expect(footerFor(ME, "weekly_plan", SITE).reason).toMatch(/weekly plan/);
    expect(footerFor(ME, "reminders", SITE).reason).toMatch(/reminder/);
    delete process.env.UNSUBSCRIBE_SECRET;
  });
});

describe("the sender", () => {
  it("is the test sender until the company's own address is set, then switches by setting alone", () => {
    expect(senderSettings({}).from).toMatch(/onboarding@resend\.dev/);
    expect(senderSettings({ EMAIL_FROM: "Your Next Chapter <hello@example.test>" }).from).toBe("Your Next Chapter <hello@example.test>");
  });

  it("sends replies to the address given", () => {
    expect(senderSettings({ EMAIL_REPLY_TO: "help@example.test" }).replyTo).toBe("help@example.test");
  });
});

describe("the headers mail programs use for their own Unsubscribe button", () => {
  it("point at the one-step address, with the one-click marker", () => {
    process.env.UNSUBSCRIBE_SECRET = SECRET;
    const headers = unsubscribeHeaders(ME, "weekly_plan", SITE);
    expect(headers["List-Unsubscribe"]).toMatch(new RegExp(`^<${SITE}/api/email/unsubscribe\\?token=`));
    expect(headers["List-Unsubscribe"]).toMatch(/>$/);
    expect(headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    delete process.env.UNSUBSCRIBE_SECRET;
  });

  it("are left off rather than broken when there is nothing to sign with", () => {
    const saved = { s: process.env.UNSUBSCRIBE_SECRET, k: process.env.SUPABASE_SERVICE_ROLE_KEY };
    delete process.env.UNSUBSCRIBE_SECRET;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(unsubscribeHeaders(ME, "weekly_plan", SITE)).toEqual({});
    if (saved.s) process.env.UNSUBSCRIBE_SECRET = saved.s;
    if (saved.k) process.env.SUPABASE_SERVICE_ROLE_KEY = saved.k;
  });
});

describe("the emails as sent", () => {
  const activity = { title: "Kew Gardens", category: "Nature", address: "Richmond", dateTime: null, bookingUrl: null };

  it("a reminder carries why it came, how to stop it, and the privacy notice", async () => {
    const footer = footerFor(ME, "reminders", SITE);
    footer.unsubscribeUrl = unsubscribeUrlFor(ME, "reminders", SITE, SECRET);
    footer.senderLine = "Example Ltd, 1 Example Street";
    const html = await render(createElement(NudgeEmail, { message: "A lovely day for a walk.", activity, siteUrl: SITE, footer }));
    expect(html).toContain("You are receiving this because");
    expect(html).toContain("/unsubscribe?token=");
    expect(html).toContain("Stop these emails");
    expect(html).toContain(`${SITE}/account#emails`);
    expect(html).toContain(`${SITE}/privacy`);
    expect(html).toContain("Example Ltd, 1 Example Street");
  });

  it("the weekly plan carries the same", async () => {
    const footer = footerFor(ME, "weekly_plan", SITE);
    const html = await render(createElement(WeeklyDigestEmail, { locationLabel: "Barnet", items: [], surprise: null, siteUrl: SITE, footer }));
    expect(html).toContain("You are receiving this because");
    expect(html).toContain(`${SITE}/privacy`);
    expect(html).toContain("Email settings");
  });

  it("never prints a placeholder where the company's details are not yet known", async () => {
    const footer = { ...footerFor(ME, "reminders", SITE), senderLine: null };
    const html = await render(createElement(NudgeEmail, { message: "Hello.", activity, siteUrl: SITE, footer }));
    expect(html).not.toMatch(/to be added|undefined|\bnull\b/);
  });

  it("no longer makes a frequency promise that is not tied to the code", async () => {
    const footer = footerFor(ME, "reminders", SITE);
    const html = await render(createElement(NudgeEmail, { message: "Hello.", activity, siteUrl: SITE, footer }));
    expect(html).not.toContain("at most one of these a week");
  });
});
