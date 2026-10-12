import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * What went wrong for people in the last week, and how much they have written to us, as counts: the kinds of problem and
 * their codes, never anyone's details. Null when the tables are not there yet (the migration not applied), in which case
 * the page simply leaves the section out.
 */

export type ProblemsSummary = {
  days: number;
  total: number;
  byKind: { kind: string; count: number }[];
  /** The most common codes, as "kind: code" with how many times. */
  topCodes: { label: string; count: number }[];
  feedbackThisWeek: number | null;
};

const KIND_LABEL: Record<string, string> = {
  signup_failed: "Sign-ups that failed",
  login_failed: "Log-ins refused (not counting a wrong password)",
  resend_failed: "Confirmation emails that could not be sent again",
  reset_failed: "Password changes that failed",
  page_error: "Screens that broke",
};

export function kindLabel(kind: string): string {
  return KIND_LABEL[kind] ?? kind;
}

export async function loadProblems(admin: SupabaseClient, now: Date = new Date(), days = 7): Promise<ProblemsSummary | null> {
  try {
    const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await admin.from("app_events").select("kind, code").gte("created_at", since).limit(5000);
    if (error) return null;

    const byKind = new Map<string, number>();
    const byCode = new Map<string, number>();
    for (const row of (data ?? []) as { kind: string; code: string }[]) {
      byKind.set(row.kind, (byKind.get(row.kind) ?? 0) + 1);
      const label = `${kindLabel(row.kind)}: ${row.code}`;
      byCode.set(label, (byCode.get(label) ?? 0) + 1);
    }

    let feedbackThisWeek: number | null = null;
    const feedback = await admin.from("member_feedback").select("id", { count: "exact", head: true }).gte("created_at", since);
    if (!feedback.error) feedbackThisWeek = feedback.count ?? 0;

    return {
      days,
      total: (data ?? []).length,
      byKind: [...byKind].map(([kind, count]) => ({ kind, count })).sort((a, b) => b.count - a.count),
      topCodes: [...byCode].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count).slice(0, 8),
      feedbackThisWeek,
    };
  } catch {
    return null;
  }
}
