import type { SupabaseClient } from "@supabase/supabase-js";
import { buildMemberList, type ListedAccount, type MemberListRow } from "@/lib/admin/memberList";

/**
 * Reads who has registered. Run with the admin client, after the page has checked the viewer is an admin: it reads every
 * member's email address, so it must never be reachable otherwise (and its result must never be sent anywhere but that page).
 */

const PAGE = 1000; // the most rows the database returns in one go
const MAX_PAGES = 20;

export type MemberListResult = { rows: MemberListRow[]; total: number };

/** Every row of a table, a page at a time. */
async function readAll<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await fetchPage(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE) break;
  }
  return rows;
}

export async function loadMemberList(admin: SupabaseClient): Promise<MemberListResult> {
  const accounts: ListedAccount[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PAGE });
    if (error) throw new Error(error.message);
    for (const u of data.users) accounts.push({ id: u.id, email: u.email ?? null, createdAt: u.created_at, confirmedAt: u.email_confirmed_at ?? null });
    if (data.users.length < PAGE) break;
  }

  const roles = await readAll<{ id: string; role: string }>((from, to) => admin.from("users").select("id, role").range(from, to));
  const adminIds = new Set(roles.filter((r) => r.role === "admin").map((r) => r.id));
  const profiles = await readAll<{ user_id: string; email_weekly_plan: boolean }>((from, to) => admin.from("member_profiles").select("user_id, email_weekly_plan").range(from, to));

  return buildMemberList(
    accounts,
    adminIds,
    profiles.map((p) => ({ userId: p.user_id, weeklyPlan: p.email_weekly_plan }))
  );
}
