import type { SupabaseClient } from "@supabase/supabase-js";
import { computeMemberStats, type AccountRow, type ActivityStamp, type MemberStats, type ProfileRow } from "@/lib/admin/memberStats";

/**
 * Reads what memberStats.ts needs. Run with the admin client, after the page has checked
 * the viewer is an admin: it reads every member's rows, so it must never be reachable
 * otherwise. Only ids, dates and yes/no flags leave this file; never an email address.
 */

const PAGE = 1000; // the most rows the database returns in one go
const MAX_PAGES = 20; // a ceiling per table, so a runaway table cannot hang the page
const WINDOW_DAYS = 30; // how far back "recent" reaches

export type MemberStatsResult = MemberStats & { truncated: boolean };

async function readAll<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<{ rows: T[]; truncated: boolean }> {
  const rows: T[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await fetchPage(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

export async function loadMemberStats(admin: SupabaseClient, now: Date = new Date()): Promise<MemberStatsResult> {
  const since = new Date(now.getTime() - WINDOW_DAYS * 86_400_000).toISOString();
  let truncated = false;

  // Accounts, from the sign-in service: whether the email was confirmed lives there.
  const accounts: AccountRow[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PAGE });
    if (error) throw new Error(error.message);
    for (const u of data.users) accounts.push({ id: u.id, createdAt: u.created_at, emailConfirmed: Boolean(u.email_confirmed_at) });
    if (data.users.length < PAGE) break;
    if (page === MAX_PAGES) truncated = true;
  }

  const roles = await readAll<{ id: string; role: string }>((from, to) => admin.from("users").select("id, role").range(from, to));
  const adminIds = new Set(roles.rows.filter((r) => r.role === "admin").map((r) => r.id));

  const profiles = await readAll<{ user_id: string; email_weekly_plan: boolean; email_reminders: boolean }>((from, to) =>
    admin.from("member_profiles").select("user_id, email_weekly_plan, email_reminders").range(from, to)
  );
  const calendars = await readAll<{ member_id: string }>((from, to) => admin.from("calendar_connections").select("member_id").range(from, to));

  // Things a member did themselves. Nothing the system does for them (nudges, emails) is counted.
  const sources = await Promise.all([
    readAll<{ member_id: string; at: string }>((from, to) => admin.from("experience_events").select("member_id, at:created_at").gte("created_at", since).range(from, to)),
    readAll<{ member_id: string; at: string }>((from, to) => admin.from("preference_signals").select("member_id, at:created_at").gte("created_at", since).range(from, to)),
    readAll<{ member_id: string; at: string }>((from, to) => admin.from("chat_messages").select("member_id, at:created_at").gte("created_at", since).range(from, to)),
    readAll<{ member_id: string; at: string }>((from, to) => admin.from("daily_states").select("member_id, at:updated_at").gte("updated_at", since).range(from, to)),
  ]);
  const activity: ActivityStamp[] = sources.flatMap((s) => s.rows.map((r) => ({ memberId: r.member_id, at: r.at })));

  truncated = truncated || [roles, profiles, calendars, ...sources].some((s) => s.truncated);

  const stats = computeMemberStats({
    now,
    accounts,
    adminIds,
    profiles: profiles.rows.map((p): ProfileRow => ({ userId: p.user_id, weeklyPlan: p.email_weekly_plan, reminders: p.email_reminders })),
    calendarMemberIds: calendars.rows.map((c) => c.member_id),
    activity,
  });
  return { ...stats, truncated };
}
