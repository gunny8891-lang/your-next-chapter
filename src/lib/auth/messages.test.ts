import { describe, expect, it } from "vitest";
import { authErrorMessage, classifyAuthError } from "@/lib/auth/messages";

describe("turning the provider's failure into something a member should see", () => {
  it.each([
    // What actually happened when sign-up "did nothing": the mail sender refused.
    [{ message: "Error sending confirmation email", code: "unexpected_failure", status: 500 }, "email_send"],
    [{ message: "Error sending confirmation email" }, "email_send"],
    [{ message: "Email address not authorized" }, "email_send"],
    [{ message: "email rate limit exceeded", code: "over_email_send_rate_limit", status: 429 }, "rate_limit"],
    [{ message: "For security purposes, you can only request this after 55 seconds." }, "rate_limit"],
    [{ message: "anything", status: 429 }, "rate_limit"],
    [{ message: "Password should be at least 6 characters.", code: "weak_password" }, "weak_password"],
    [{ message: "Signup requires a valid password" }, "weak_password"],
    [{ message: "Unable to validate email address: invalid format" }, "invalid_email"],
    [{ message: "x", code: "email_address_invalid" }, "invalid_email"],
    [{ message: "Signups not allowed for this instance" }, "signups_closed"],
    [{ message: "Invalid login credentials", code: "invalid_credentials" }, "bad_credentials"],
    [{ message: "Email not confirmed" }, "unconfirmed"],
    [{ message: "something nobody has seen before" }, "generic"],
    [null, "generic"],
    [undefined, "generic"],
  ])("%j is %s", (error, expected) => {
    expect(classifyAuthError(error as never)).toBe(expected);
  });

  it("recognises a rate limit before anything else its message might also match", () => {
    expect(classifyAuthError({ message: "email rate limit exceeded while sending email" })).toBe("rate_limit");
  });
});

describe("what the page says", () => {
  it("is a kind sentence for every code", () => {
    for (const code of ["email_send", "rate_limit", "weak_password", "invalid_email", "signups_closed", "bad_credentials", "unconfirmed", "link_expired", "confirm_failed", "generic"]) {
      const message = authErrorMessage(code)!;
      expect(message.length).toBeGreaterThan(20);
      expect(message).toMatch(/[.]$/);
    }
  });

  it("never shows the provider's own wording", () => {
    const everything = ["email_send", "rate_limit", "weak_password", "invalid_email", "signups_closed", "bad_credentials", "unconfirmed", "link_expired", "confirm_failed", "generic"].map((c) => authErrorMessage(c)!).join(" ");
    expect(everything).not.toMatch(/smtp|rate limit exceeded|unexpected_failure|error sending|authorized|AuthApiError|supabase/i);
  });

  it("shows nothing when there is no error", () => {
    expect(authErrorMessage(undefined)).toBeNull();
    expect(authErrorMessage(null)).toBeNull();
    expect(authErrorMessage("")).toBeNull();
  });

  it("will not repeat words put in the address by someone else: anything unrecognised is the generic sentence", () => {
    const generic = authErrorMessage("generic");
    expect(authErrorMessage("Your account is suspended, call 0900 000000")).toBe(generic);
    expect(authErrorMessage("<script>alert(1)</script>")).toBe(generic);
    expect(authErrorMessage("constructor")).toBe(generic);
    expect(authErrorMessage("__proto__")).toBe(generic);
  });
});
