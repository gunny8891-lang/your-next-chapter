import type { SupabaseClient } from "@supabase/supabase-js";

export type UsageRow = {
  user_id: string | null;
  feature: string;
  model: string;
  estimated_cost: number | string;
  success: boolean;
  error_message: string | null;
  created_at: string;
};

export type ModelTier = "haiku" | "sonnet" | "other";

export type BreakdownRow = {
  key: string;
  calls: number;
  cost: number;
  /** Average over successful calls only — failed calls log zero cost and would dilute it. */
  avgCost: number;
};

export type TierShare = { calls: number; cost: number };

export type UsageSummary = {
  truncated: boolean;
  costToday: number;
  costThisMonth: number;
  callsThisMonth: number;
  failedCallsThisMonth: number;
  /** Distinct members with at least one logged call this month. */
  activeUsers: number;
  memberCostThisMonth: number;
  /** Calls not tied to a member (e.g. the Discovery Agent). */
  systemCostThisMonth: number;
  costPerActiveUser: number | null;
  payingUsers: number;
  costPerPayingUser: number | null;
  byFeature: BreakdownRow[];
  byModel: (BreakdownRow & { tier: ModelTier })[];
  tierShare: Record<ModelTier, TierShare>;
  recentFailures: { created_at: string; feature: string; model: string; error_message: string | null }[];
};

// Large enough for a long pilot, small enough to never hang a page render —
// if it's ever hit, the dashboard says so rather than silently under-counting.
const PAGE_SIZE = 1000;
const MAX_ROWS = 20000;
const RECENT_FAILURES_SHOWN = 5;

export function tierOf(model: string): ModelTier {
  const m = model.toLowerCase();
  if (m.includes("haiku")) return "haiku";
  if (m.includes("sonnet")) return "sonnet";
  return "other";
}

function toBreakdown(map: Map<string, { calls: number; cost: number }>): BreakdownRow[] {
  return [...map.entries()]
    .map(([key, v]) => ({ key, calls: v.calls, cost: v.cost, avgCost: v.calls ? v.cost / v.calls : 0 }))
    .sort((a, b) => b.cost - a.cost);
}

/**
 * Pure aggregation over usage rows — no I/O, so it can be checked against
 * hand-computed numbers. `now` is injectable for the same reason. "Today" and
 * "this month" are UTC boundaries.
 */
export function summarizeUsage(
  rows: UsageRow[],
  payingUserIds: Set<string>,
  now: Date,
  truncated = false
): UsageSummary {
  const dayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const monthEnd = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);

  let costToday = 0;
  let costThisMonth = 0;
  let callsThisMonth = 0;
  let failedCallsThisMonth = 0;
  let memberCost = 0;
  let systemCost = 0;
  const activeUsers = new Set<string>();
  const payingCost = new Map<string, number>();
  const byFeature = new Map<string, { calls: number; cost: number }>();
  const byModel = new Map<string, { calls: number; cost: number }>();
  const tierShare: Record<ModelTier, TierShare> = {
    haiku: { calls: 0, cost: 0 },
    sonnet: { calls: 0, cost: 0 },
    other: { calls: 0, cost: 0 },
  };
  const failures: UsageRow[] = [];

  for (const row of rows) {
    const at = new Date(row.created_at).getTime();
    if (at < monthStart || at >= monthEnd) continue;

    const cost = Number(row.estimated_cost) || 0;
    costThisMonth += cost;
    callsThisMonth += 1;
    if (at >= dayStart) costToday += cost;

    if (row.user_id) {
      memberCost += cost;
      activeUsers.add(row.user_id);
      if (payingUserIds.has(row.user_id)) payingCost.set(row.user_id, (payingCost.get(row.user_id) ?? 0) + cost);
    } else {
      systemCost += cost;
    }

    if (!row.success) {
      failedCallsThisMonth += 1;
      failures.push(row);
      continue;
    }

    const f = byFeature.get(row.feature) ?? { calls: 0, cost: 0 };
    f.calls += 1;
    f.cost += cost;
    byFeature.set(row.feature, f);

    const m = byModel.get(row.model) ?? { calls: 0, cost: 0 };
    m.calls += 1;
    m.cost += cost;
    byModel.set(row.model, m);

    const t = tierShare[tierOf(row.model)];
    t.calls += 1;
    t.cost += cost;
  }

  const payingCostTotal = [...payingCost.values()].reduce((a, b) => a + b, 0);

  return {
    truncated,
    costToday,
    costThisMonth,
    callsThisMonth,
    failedCallsThisMonth,
    activeUsers: activeUsers.size,
    memberCostThisMonth: memberCost,
    systemCostThisMonth: systemCost,
    costPerActiveUser: activeUsers.size ? memberCost / activeUsers.size : null,
    payingUsers: payingUserIds.size,
    costPerPayingUser: payingUserIds.size ? payingCostTotal / payingUserIds.size : null,
    byFeature: toBreakdown(byFeature),
    byModel: toBreakdown(byModel).map((r) => ({ ...r, tier: tierOf(r.key) })),
    tierShare,
    recentFailures: failures
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, RECENT_FAILURES_SHOWN)
      .map((r) => ({ created_at: r.created_at, feature: r.feature, model: r.model, error_message: r.error_message })),
  };
}

/**
 * Loads this month's usage rows (paged — PostgREST caps a single response at
 * 1000 rows) plus the set of paying members, and summarizes them. Pass the
 * signed-in admin's client: the table's RLS only lets admins read it.
 */
export async function loadAiUsageSummary(supabase: SupabaseClient, now = new Date()): Promise<UsageSummary> {
  const monthStartIso = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const monthEndIso = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();

  const rows: UsageRow[] = [];
  let truncated = false;
  for (let from = 0; ; from += PAGE_SIZE) {
    if (from >= MAX_ROWS) {
      truncated = true;
      break;
    }
    const { data, error } = await supabase
      .from("ai_usage_logs")
      .select("user_id, feature, model, estimated_cost, success, error_message, created_at")
      .gte("created_at", monthStartIso)
      .lt("created_at", monthEndIso)
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Couldn't load AI usage: ${error.message}`);
    rows.push(...((data ?? []) as UsageRow[]));
    if (!data || data.length < PAGE_SIZE) break;
  }

  const { data: subs } = await supabase.from("subscriptions").select("user_id").in("status", ["active", "trialing"]);
  const payingUserIds = new Set((subs ?? []).map((s) => s.user_id as string));

  return summarizeUsage(rows, payingUserIds, now, truncated);
}
