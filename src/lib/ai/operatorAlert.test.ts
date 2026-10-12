import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ALERT_COOLDOWN_MS, ALERT_FEATURE, alertMessage, maybeAlertOperator } from "@/lib/ai/operatorAlert";

type Row = { id: string; feature: string; error_message: string | null; created_at: string; success?: boolean };

/** A stand-in for the usage log: it answers the few questions the alert asks and records what it writes. */
function fakeAdmin(rows: Row[] = []) {
  const updates: { id: string; values: Record<string, unknown> }[] = [];
  let next = 1;
  const query = () => {
    let feature: string | null = null;
    let like: string | null = null;
    let since: string | null = null;
    let ascending = false;
    const builder: Record<string, unknown> = {
      eq: (_c: string, v: string) => ((feature = v), builder),
      like: (_c: string, v: string) => ((like = v.replace(/%$/, "")), builder),
      gte: (_c: string, v: string) => ((since = v), builder),
      order: (_c: string, o: { ascending: boolean }) => ((ascending = o.ascending), builder),
      limit: async () => {
        const found = rows
          .filter((r) => (feature ? r.feature === feature : true) && (like !== null ? (r.error_message ?? "").startsWith(like) : true) && (since ? r.created_at >= since : true))
          .sort((a, b) => (ascending ? a.created_at.localeCompare(b.created_at) : b.created_at.localeCompare(a.created_at)));
        return { data: found.map((r) => ({ id: r.id })), error: null };
      },
    };
    return builder;
  };
  const admin = {
    from: () => ({
      select: () => query(),
      insert: (values: Record<string, unknown>) => ({
        select: () => ({
          single: async () => {
            const row: Row = { id: `marker-${next++}`, feature: String(values.feature), error_message: (values.error_message as string) ?? null, created_at: new Date().toISOString() };
            rows.push(row);
            return { data: { id: row.id }, error: null };
          },
        }),
      }),
      update: (values: Record<string, unknown>) => ({
        eq: async (_c: string, id: string) => {
          updates.push({ id, values });
          const row = rows.find((r) => r.id === id);
          if (row && typeof values.error_message === "string") row.error_message = values.error_message;
          return { error: null };
        },
      }),
    }),
  } as unknown as SupabaseClient;
  return { admin, rows, updates };
}

const NOW = new Date("2026-10-12T09:00:00Z");
const recipients = async () => ["owner@example.com"];

describe("telling the person who runs the app", () => {
  it("emails once when the account is out of credit, and records that it did", async () => {
    const { admin, rows } = fakeAdmin();
    const send = vi.fn<(to: string[], message: unknown) => Promise<void>>(async () => {});
    expect(await maybeAlertOperator("out_of_credit", { admin, now: NOW, recipients, send })).toBe("sent");
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]).toEqual([["owner@example.com"], expect.objectContaining({ subject: "Lark Hour: the AI is out of credit" })]);
    expect(rows.filter((r) => r.feature === ALERT_FEATURE)).toHaveLength(1);
  });

  it("does not email again for the same problem within a day, however many calls fail", async () => {
    const { admin } = fakeAdmin();
    const send = vi.fn<(to: string[], message: unknown) => Promise<void>>(async () => {});
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await maybeAlertOperator("out_of_credit", { admin, now: NOW, recipients, send }));
    expect(results).toEqual(["sent", "recent", "recent", "recent", "recent"]);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("emails again a day later if it is still not fixed", async () => {
    const { admin } = fakeAdmin();
    const send = vi.fn<(to: string[], message: unknown) => Promise<void>>(async () => {});
    await maybeAlertOperator("out_of_credit", { admin, now: NOW, recipients, send });
    const tomorrow = new Date(NOW.getTime() + ALERT_COOLDOWN_MS + 60_000);
    // The marker is dated in real time by the fake, so move it back as a day would.
    const { admin: later } = fakeAdmin([{ id: "old", feature: ALERT_FEATURE, error_message: "out_of_credit", created_at: new Date(NOW.getTime() - 1000).toISOString() }]);
    expect(await maybeAlertOperator("out_of_credit", { admin: later, now: tomorrow, recipients, send })).toBe("sent");
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("tells them about a different problem even if it has just told them about another", async () => {
    const { admin } = fakeAdmin();
    const send = vi.fn<(to: string[], message: unknown) => Promise<void>>(async () => {});
    await maybeAlertOperator("out_of_credit", { admin, now: NOW, recipients, send });
    expect(await maybeAlertOperator("auth", { admin, now: NOW, recipients, send })).toBe("sent");
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][1]).toMatchObject({ subject: "Lark Hour: the AI key was rejected" });
  });

  it("does not bother them about what is not theirs to fix", async () => {
    const send = vi.fn<(to: string[], message: unknown) => Promise<void>>(async () => {});
    for (const kind of ["daily_limit", "rate_limited", "overloaded", "network", "other"] as const) {
      expect(await maybeAlertOperator(kind, { admin: fakeAdmin().admin, now: NOW, recipients, send })).toBe("not_needed");
    }
    expect(send).not.toHaveBeenCalled();
  });

  it("says so in the log, and sends nothing, when there is nobody to tell", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { admin, rows } = fakeAdmin();
    const send = vi.fn<(to: string[], message: unknown) => Promise<void>>(async () => {});
    expect(await maybeAlertOperator("out_of_credit", { admin, now: NOW, recipients: async () => [], send })).toBe("no_recipient");
    expect(send).not.toHaveBeenCalled();
    expect(rows).toHaveLength(0);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("never throws when the email cannot be sent, notes it, and still holds off for the day", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { admin, rows, updates } = fakeAdmin();
    const failing = vi.fn(async () => {
      throw new Error("Resend is down");
    });
    expect(await maybeAlertOperator("out_of_credit", { admin, now: NOW, recipients, send: failing })).toBe("failed");
    expect(updates).toHaveLength(1);
    expect(String(updates[0].values.error_message)).toContain("not sent: Resend is down");
    // The marker still starts with the kind, so a second failure does not try again and again.
    const send = vi.fn<(to: string[], message: unknown) => Promise<void>>(async () => {});
    expect(await maybeAlertOperator("out_of_credit", { admin, now: NOW, recipients, send })).toBe("recent");
    expect(send).not.toHaveBeenCalled();
    expect(rows[0].error_message?.startsWith("out_of_credit")).toBe(true);
    error.mockRestore();
  });

  it("never throws at all, whatever goes wrong inside", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = { from: () => { throw new Error("no database"); } } as unknown as SupabaseClient;
    await expect(maybeAlertOperator("out_of_credit", { admin: broken, now: NOW, recipients })).resolves.toBe("failed");
    error.mockRestore();
  });
});

describe("what the email says", () => {
  const out = alertMessage("out_of_credit", NOW, "https://www.larkhour.com");

  it("leads with what is wrong and what to do about it, and where to add credit", () => {
    expect(out.text).toMatch(/out of credit/);
    expect(out.text).toContain("https://platform.claude.com/settings/billing");
    expect(out.html).toContain('href="https://platform.claude.com/settings/billing"');
  });

  it("says what stops working, so it is clear it is urgent, and links the costs page", () => {
    expect(out.text).toMatch(/chat[\s\S]*ideas[\s\S]*plans/);
    expect(out.text).toContain("https://www.larkhour.com/admin/ai-costs");
  });

  it("promises nothing it does not do: it will not email again for a day", () => {
    expect(out.text).toContain("24 hours");
  });

  it("says when it was first seen, in London time", () => {
    expect(out.text).toMatch(/12 October 2026/);
    expect(out.text).toMatch(/10:00/); // 09:00 UTC is 10:00 in London on this date
  });

  it("has its own wording when it is the key", () => {
    const key = alertMessage("auth", NOW, "https://www.larkhour.com/");
    expect(key.subject).toMatch(/key was rejected/);
    expect(key.text).toMatch(/ANTHROPIC_API_KEY/);
    expect(key.text).toContain("https://www.larkhour.com/admin/ai-costs");
  });
});
