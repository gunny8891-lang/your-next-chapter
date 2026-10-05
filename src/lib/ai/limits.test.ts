import { describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { callClaude } from "@/lib/ai/client";
import {
  assertWithinMemberLimits,
  decideMemberCall,
  decideSearch,
  londonDayStartIso,
  MEMBER_DAILY_CALLS,
  MEMBER_DAILY_COST_USD,
  searchAllowed,
  SEARCH_DAILY_BUDGET_USD,
  SEARCH_FEATURE,
  UsageLimitError,
  type UsageRow,
} from "@/lib/ai/limits";

const rows = (feature: string, n: number, cost = 0.02): UsageRow[] => Array.from({ length: n }, () => ({ feature, estimated_cost: cost }));

describe("londonDayStartIso: when the member's day began", () => {
  it("is midnight UTC in winter", () => {
    expect(londonDayStartIso(new Date("2026-01-15T10:00:00Z"))).toBe("2026-01-15T00:00:00.000Z");
    expect(londonDayStartIso(new Date("2026-01-15T23:59:00Z"))).toBe("2026-01-15T00:00:00.000Z");
  });

  it("is 23:00 UTC the evening before in summer", () => {
    expect(londonDayStartIso(new Date("2026-07-15T10:00:00Z"))).toBe("2026-07-14T23:00:00.000Z");
  });

  it("belongs to the London day, not the UTC one (half past midnight in summer is already tomorrow)", () => {
    expect(londonDayStartIso(new Date("2026-07-14T23:30:00Z"))).toBe("2026-07-14T23:00:00.000Z");
    expect(londonDayStartIso(new Date("2026-07-14T22:30:00Z"))).toBe("2026-07-13T23:00:00.000Z");
  });

  it("is right on the day the clocks go forward (midnight was still winter time, noon is summer time)", () => {
    expect(londonDayStartIso(new Date("2026-03-29T12:00:00Z"))).toBe("2026-03-29T00:00:00.000Z");
  });

  it("is right on the day the clocks go back (midnight was still summer time)", () => {
    expect(londonDayStartIso(new Date("2026-10-25T12:00:00Z"))).toBe("2026-10-24T23:00:00.000Z");
  });
});

describe("decideMemberCall", () => {
  it("allows ordinary use", () => {
    expect(decideMemberCall(rows("some_time", 10), "some_time")).toEqual({ allowed: true });
    expect(decideMemberCall([], "concierge_chat")).toEqual({ allowed: true });
  });

  it("stops a feature at its own daily call cap, and not before", () => {
    const cap = MEMBER_DAILY_CALLS.itinerary_agent;
    expect(decideMemberCall(rows("itinerary_agent", cap - 1, 0.01), "itinerary_agent").allowed).toBe(true);
    expect(decideMemberCall(rows("itinerary_agent", cap, 0.01), "itinerary_agent")).toEqual({ allowed: false, reason: "calls", feature: "itinerary_agent" });
  });

  it("counts each feature on its own: using up the concierge does not stop suggestions", () => {
    const decision = decideMemberCall(rows("concierge_chat", MEMBER_DAILY_CALLS.concierge_chat, 0.001), "some_time");
    expect(decision.allowed).toBe(true);
  });

  it("stops everything once the day's spend reaches the ceiling, whichever feature spent it", () => {
    const spent = [...rows("itinerary_agent", 5, 0.1), ...rows("some_time", 10, 0.06)]; // 0.5 + 0.6
    expect(spent.reduce((s, r) => s + Number(r.estimated_cost), 0)).toBeGreaterThanOrEqual(MEMBER_DAILY_COST_USD);
    expect(decideMemberCall(spent, "concierge_chat")).toEqual({ allowed: false, reason: "cost", feature: "concierge_chat" });
  });

  it("does not cap features it does not know (nudges, discovery)", () => {
    expect(decideMemberCall(rows("nudge_message", 500), "nudge_message").allowed).toBe(true);
  });

  it("reads costs stored as text, as the database may return them", () => {
    const text = rows("some_time", 3).map((r) => ({ ...r, estimated_cost: "0.4" }));
    expect(decideMemberCall(text, "concierge_chat").allowed).toBe(false);
  });

  it("a real person never meets the limits: a heavy day of real usage is well inside them", () => {
    // Measured real costs: some_time ~1.8c, itinerary ~2.9c, chat ~1.4c.
    const heavyDay = [...rows("some_time", 15, 0.018), ...rows("itinerary_agent", 3, 0.029), ...rows("concierge_chat", 12, 0.014)];
    expect(decideMemberCall(heavyDay, "some_time").allowed).toBe(true);
    expect(decideMemberCall(heavyDay, "concierge_chat").allowed).toBe(true);
  });

  it("the worst case at the caps is bounded by the cost ceiling, not by the call caps", () => {
    const worst = Object.entries(MEMBER_DAILY_CALLS).reduce((sum, [feature, n]) => sum + n * { concierge_chat: 0.02, some_time: 0.03, itinerary_agent: 0.045 }[feature]!, 0);
    expect(worst).toBeGreaterThan(MEMBER_DAILY_COST_USD); // so the ceiling is what actually protects the bill
  });
});

describe("decideSearch: the paid regional web search", () => {
  const search = (n: number, cost = 1.3): UsageRow[] => rows(SEARCH_FEATURE, n, cost);

  it("is allowed when little has been spent and the member has not searched today", () => {
    expect(decideSearch(search(1), [])).toEqual({ allowed: true });
  });

  it("stops for everyone once the day's budget is spent", () => {
    const enough = Math.ceil(SEARCH_DAILY_BUDGET_USD / 1.3);
    expect(decideSearch(search(enough), [])).toEqual({ allowed: false, reason: "search_budget" });
  });

  it("allows one member-triggered search per member per day", () => {
    expect(decideSearch(search(1), search(1))).toEqual({ allowed: false, reason: "search_member" });
  });

  it("holds the nightly job (no member) only to the system budget", () => {
    expect(decideSearch(search(1), null)).toEqual({ allowed: true });
  });

  it("ignores spend on other features", () => {
    expect(decideSearch(rows("some_time", 500, 5), [])).toEqual({ allowed: true });
  });
});

type Rows = { data: unknown; error: { message: string } | null };

/** A stand-in for the admin client: ai_usage_logs and users each return what the test says. */
function fakeAdmin(usage: Rows, user: Rows = { data: { role: "member" }, error: null }) {
  const calls: { table: string; filters: unknown[][] }[] = [];
  const from = (table: string) => {
    const record = { table, filters: [] as unknown[][] };
    calls.push(record);
    const result = table === "users" ? user : usage;
    const chain: Record<string, unknown> = {};
    for (const op of ["select", "gte", "eq", "limit"]) chain[op] = (...args: unknown[]) => (record.filters.push([op, ...args]), chain);
    chain.maybeSingle = () => Promise.resolve(result);
    chain.then = (resolve: (v: unknown) => unknown) => resolve(result);
    return chain;
  };
  return { admin: { from } as unknown as SupabaseClient, calls };
}

describe("assertWithinMemberLimits", () => {
  it("lets an ordinary member through", async () => {
    const { admin } = fakeAdmin({ data: rows("some_time", 3), error: null });
    await expect(assertWithinMemberLimits(admin, "u1", "some_time")).resolves.toBeUndefined();
  });

  it("refuses with a UsageLimitError once the cap is reached", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { admin } = fakeAdmin({ data: rows("some_time", MEMBER_DAILY_CALLS.some_time), error: null });
    await expect(assertWithinMemberLimits(admin, "u1", "some_time")).rejects.toBeInstanceOf(UsageLimitError);
    warn.mockRestore();
  });

  it("never refuses an admin", async () => {
    const { admin } = fakeAdmin({ data: rows("some_time", 500), error: null }, { data: { role: "admin" }, error: null });
    await expect(assertWithinMemberLimits(admin, "boss", "some_time")).resolves.toBeUndefined();
  });

  it("fails OPEN: if the usage log cannot be read, the member is not refused", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { admin } = fakeAdmin({ data: null, error: { message: "boom" } });
    await expect(assertWithinMemberLimits(admin, "u1", "some_time")).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("does not even look for features it does not cap", async () => {
    const { admin, calls } = fakeAdmin({ data: [], error: null });
    await assertWithinMemberLimits(admin, "u1", "nudge_message");
    expect(calls).toHaveLength(0);
  });

  it("reads only this member's usage, since the start of their day", async () => {
    const { admin, calls } = fakeAdmin({ data: [], error: null });
    await assertWithinMemberLimits(admin, "u1", "some_time", new Date("2026-07-15T10:00:00Z"));
    const filters = calls[0].filters;
    expect(filters).toContainEqual(["eq", "user_id", "u1"]);
    expect(filters).toContainEqual(["gte", "created_at", "2026-07-14T23:00:00.000Z"]);
  });
});

describe("searchAllowed", () => {
  it("reads only search usage, and the member's own for the member limit", async () => {
    const { admin, calls } = fakeAdmin({ data: [], error: null });
    await searchAllowed(admin, "u1", new Date("2026-01-15T10:00:00Z"));
    expect(calls).toHaveLength(2);
    expect(calls[0].filters).toContainEqual(["eq", "feature", SEARCH_FEATURE]);
    expect(calls[1].filters).toContainEqual(["eq", "user_id", "u1"]);
  });

  it("fails open when the log cannot be read", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { admin } = fakeAdmin({ data: null, error: { message: "boom" } });
    expect(await searchAllowed(admin, "u1")).toEqual({ allowed: true });
    warn.mockRestore();
  });

  it("says no once the member has already searched today", async () => {
    const { admin } = fakeAdmin({ data: rows(SEARCH_FEATURE, 1, 1.3), error: null });
    expect(await searchAllowed(admin, "u1")).toEqual({ allowed: false, reason: "search_member" });
  });
});

describe("callClaude refuses before spending", () => {
  const params = { model: "claude-sonnet-5", max_tokens: 10, messages: [{ role: "user", content: "hi" }] } as Anthropic.MessageCreateParamsNonStreaming;
  const fakeClient = () => {
    const create = vi.fn(async () => ({ usage: { input_tokens: 1, output_tokens: 1 }, content: [] }));
    return { client: { messages: { create } } as unknown as Anthropic, create };
  };
  const logger = () => {
    const insert = vi.fn(async () => ({ error: null }));
    return { supabase: { from: vi.fn(() => ({ insert })) } as unknown as SupabaseClient, insert };
  };

  it("does not make the call, or log one, when the member is over a limit", async () => {
    const { client, create } = fakeClient();
    const { supabase, insert } = logger();
    const over = async () => {
      throw new UsageLimitError("calls", "some_time");
    };
    await expect(callClaude(client, supabase, { userId: "u1", feature: "some_time" }, params, over)).rejects.toBeInstanceOf(UsageLimitError);
    expect(create).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it("makes the call when within limits", async () => {
    const { client, create } = fakeClient();
    const { supabase, insert } = logger();
    await callClaude(client, supabase, { userId: "u1", feature: "some_time" }, params, async () => {});
    expect(create).toHaveBeenCalledOnce();
    expect(insert).toHaveBeenCalledOnce();
  });

  it("makes the call if the limit check itself breaks: a fault of ours must never refuse a member", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { client, create } = fakeClient();
    const { supabase } = logger();
    await callClaude(client, supabase, { userId: "u1", feature: "some_time" }, params, async () => {
      throw new Error("no service key configured");
    });
    expect(create).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("does not check limits for system calls (no member)", async () => {
    const { client, create } = fakeClient();
    const { supabase } = logger();
    const check = vi.fn(async () => {});
    await callClaude(client, supabase, { userId: null, feature: "discovery_claude_web" }, params, check);
    expect(check).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledOnce();
  });
});
