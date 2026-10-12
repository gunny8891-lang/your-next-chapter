import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { maskEmail, PENDING_EMAIL_COOKIE, PENDING_EMAIL_OPTIONS, readPendingEmail } from "@/lib/auth/pendingEmail";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("the address kept for 'send it again'", () => {
  it("is shown masked, enough to recognise and not enough to read out", () => {
    expect(maskEmail("grace@yahoo.com")).toBe("gr***@yahoo.com");
    expect(maskEmail("jo@example.co.uk")).toBe("j***@example.co.uk");
    expect(maskEmail("a@b.com")).toBe("a***@b.com");
    expect(maskEmail("not an address")).toBe("***");
  });

  it("is only used when it really is an address", () => {
    expect(readPendingEmail("grace@yahoo.com")).toBe("grace@yahoo.com");
    expect(readPendingEmail("  grace@yahoo.com ")).toBe("grace@yahoo.com");
    for (const bad of [undefined, null, "", "grace", "grace@", "a b@c.com", "x@y", `${"a".repeat(260)}@y.com`]) {
      expect(readPendingEmail(bad as string | null | undefined), String(bad)).toBeNull();
    }
  });

  it("is a cookie that scripts cannot read, that lasts an hour, and not part of any web address", () => {
    expect(PENDING_EMAIL_OPTIONS.httpOnly).toBe(true);
    expect(PENDING_EMAIL_OPTIONS.sameSite).toBe("lax");
    expect(PENDING_EMAIL_OPTIONS.maxAge).toBe(3600);
    const actions = read("src/app/auth/actions.ts");
    expect(actions).not.toMatch(/redirect\(`[^`]*\$\{email\}/);
    expect(actions).not.toMatch(/\?email=/);
  });
});

describe("the pages", () => {
  it("remind the person to look in their spam folder, and offer to send it again", () => {
    const component = read("src/components/ResendConfirmation.tsx");
    expect(component).toMatch(/spam or junk folder/);
    expect(component).toContain("Send it again");
    expect(component).toContain("action={resendConfirmation}");
  });

  it("show it after signing up, and after trying to log in before confirming", () => {
    expect(read("src/app/signup/page.tsx")).toContain("<ResendConfirmation email={pending} />");
    expect(read("src/app/login/page.tsx")).toContain('error === "unconfirmed" && <ResendConfirmation');
  });
});

// The action, with the framework and the sign-in provider stood in for.
const store = new Map<string, string>();
const resend = vi.fn();
const redirects: string[] = [];

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (store.has(name) ? { name, value: store.get(name) } : undefined),
    set: (name: string, value: string) => void store.set(name, value),
  }),
  headers: async () => new Headers({ "x-forwarded-proto": "https", "x-forwarded-host": "www.larkhour.com" }),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    redirects.push(to);
    throw new Error(`redirect:${to}`);
  },
}));
vi.mock("@/utils/supabase/server", () => ({ createClient: async () => ({ auth: { resend, signUp: vi.fn(), signInWithPassword: vi.fn() } }) }));
vi.mock("@/utils/supabase/admin", () => ({ createAdminClient: () => ({}) }));

describe("asking for the email again", () => {
  beforeEach(() => {
    store.clear();
    redirects.length = 0;
    resend.mockReset();
  });

  const run = async () => {
    const { resendConfirmation } = await import("@/app/auth/actions");
    await resendConfirmation().catch((e: Error) => e);
    return redirects.at(-1);
  };

  it("sends the signup confirmation to the remembered address, back to the same link, and says it did", async () => {
    store.set(PENDING_EMAIL_COOKIE, "grace@yahoo.com");
    resend.mockResolvedValue({ error: null });
    expect(await run()).toBe("/signup?checkEmail=1&resent=1");
    expect(resend).toHaveBeenCalledWith({ type: "signup", email: "grace@yahoo.com", options: { emailRedirectTo: "https://www.larkhour.com/auth/confirm" } });
  });

  it("says kindly when it was asked for too soon, rather than showing the provider's words", async () => {
    store.set(PENDING_EMAIL_COOKIE, "grace@yahoo.com");
    resend.mockResolvedValue({ error: { message: "For security purposes, you can only request this after 45 seconds.", status: 429 } });
    expect(await run()).toBe("/signup?checkEmail=1&error=rate_limit");
  });

  it("says what to do when there is no address to send to, and sends nothing", async () => {
    expect(await run()).toBe("/signup?checkEmail=1&error=nothing_to_resend");
    expect(resend).not.toHaveBeenCalled();
  });

  it("ignores a cookie that is not an address", async () => {
    store.set(PENDING_EMAIL_COOKIE, "<script>");
    expect(await run()).toBe("/signup?checkEmail=1&error=nothing_to_resend");
    expect(resend).not.toHaveBeenCalled();
  });
});

describe("a person on another device, with no remembered address", () => {
  it("is told to sign up again with the same address, which sends a new link, rather than shown a button that cannot work", () => {
    const component = read("src/components/ResendConfirmation.tsx");
    expect(component).toContain("sign up again with the same email address");
    expect(component).toContain("Sign up again");
    expect(component).toContain('href="/signup"');
    // The button is only drawn when there is an address.
    expect(component).toMatch(/email \? \(\s*<form action=\{resendConfirmation\}>/);
  });
});
