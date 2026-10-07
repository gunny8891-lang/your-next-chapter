import { describe, expect, it } from "vitest";
import { chatMessage, classifyAiFailure, memberMessage, needsOperator, operatorAlert, type AiFailureKind } from "@/lib/ai/unavailable";

/** Shaped like the errors the provider's library throws: a name, a message and an HTTP status. */
const apiError = (name: string, status: number, message: string) => Object.assign(new Error(message), { name, status });

describe("what kind of failure it was", () => {
  it("recognises our own daily limit", () => {
    const err = Object.assign(new Error("Usage limit reached (calls) for concierge_chat"), { name: "UsageLimitError" });
    expect(classifyAiFailure(err)).toBe("daily_limit");
  });

  it("recognises an account that has run out of credit", () => {
    const message = "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.";
    expect(classifyAiFailure(apiError("BadRequestError", 400, message))).toBe("out_of_credit");
    expect(classifyAiFailure(new Error(message))).toBe("out_of_credit");
  });

  it("recognises a rejected key", () => {
    expect(classifyAiFailure(apiError("AuthenticationError", 401, "invalid x-api-key"))).toBe("auth");
    expect(classifyAiFailure(apiError("PermissionDeniedError", 403, "forbidden"))).toBe("auth");
  });

  it("recognises too many requests, a busy provider, and no connection", () => {
    expect(classifyAiFailure(apiError("RateLimitError", 429, "rate limited"))).toBe("rate_limited");
    expect(classifyAiFailure(apiError("InternalServerError", 529, "Overloaded"))).toBe("overloaded");
    expect(classifyAiFailure(apiError("InternalServerError", 500, "boom"))).toBe("overloaded");
    expect(classifyAiFailure(new Error("fetch failed"))).toBe("network");
    expect(classifyAiFailure(Object.assign(new Error("Connection error."), { name: "APIConnectionError" }))).toBe("network");
  });

  it("calls anything else 'other', without throwing on odd input", () => {
    expect(classifyAiFailure(new Error("the reply had no usable options"))).toBe("other");
    expect(classifyAiFailure("a plain string")).toBe("other");
    expect(classifyAiFailure(null)).toBe("other");
    expect(classifyAiFailure(undefined)).toBe("other");
    expect(classifyAiFailure(42)).toBe("other");
  });
});

describe("what the member is told", () => {
  const kinds: AiFailureKind[] = ["daily_limit", "out_of_credit", "auth", "rate_limited", "overloaded", "network", "other"];

  it("never mentions credit, billing, keys, the provider or an error, whatever went wrong", () => {
    for (const kind of kinds) {
      for (const text of [memberMessage(kind), chatMessage(kind)]) {
        expect(text, `${kind}: ${text}`).not.toMatch(/credit|billing|api|key|anthropic|claude|error|exception|status|token/i);
      }
    }
  });

  it("tells them to try again, and (for a break or a limit) that the rest of the app is still there", () => {
    for (const kind of kinds) {
      expect(memberMessage(kind)).toMatch(/try again/i);
      expect(chatMessage(kind)).toMatch(/again/i);
    }
    for (const kind of kinds.filter((k) => k !== "other")) expect(memberMessage(kind)).toContain("Today and Explore");
  });

  it("says 'tomorrow' for our own daily limit and 'a little while' for a passing problem", () => {
    expect(memberMessage("daily_limit")).toMatch(/tomorrow/);
    expect(chatMessage("daily_limit")).toMatch(/tomorrow/);
    for (const kind of ["out_of_credit", "auth", "rate_limited", "overloaded", "network"] as const) {
      expect(memberMessage(kind)).toMatch(/little while/);
      expect(chatMessage(kind)).toMatch(/little while/);
    }
  });

  it("keeps the concierge in the first person", () => {
    expect(chatMessage("overloaded")).toMatch(/^I'm/);
    expect(chatMessage("daily_limit")).toMatch(/I'd like/);
  });
});

describe("what the person running the app is told", () => {
  it("is alerted only to the failures they must fix, with where to fix them", () => {
    expect(needsOperator("out_of_credit")).toBe(true);
    expect(needsOperator("auth")).toBe(true);
    for (const kind of ["daily_limit", "rate_limited", "overloaded", "network", "other"] as const) {
      expect(needsOperator(kind), kind).toBe(false);
      expect(operatorAlert(kind)).toBe("");
    }
    expect(operatorAlert("out_of_credit")).toContain("platform.claude.com/settings/billing");
    expect(operatorAlert("auth")).toContain("ANTHROPIC_API_KEY");
  });
});
