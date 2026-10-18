import { NextResponse } from "next/server";
import { isCronRequest } from "@/lib/jobs/cronAuth";
import { createAdminClient } from "@/utils/supabase/admin";
import { nextLondonWeekStart } from "@/lib/opportunities/schedule";
import { planAndEmailWeekAhead } from "@/lib/email/weekAhead";

// Every member is planned and emailed one after another, each taking a few seconds, so this has the whole of its time limit.
export const maxDuration = 300;

type MemberRow = {
  user_id: string;
  location_text: string | null;
  email_weekly_plan: boolean;
  users: { email: string } | { email: string }[] | null;
};

function emailOf(users: MemberRow["users"]): string | null {
  if (!users) return null;
  return Array.isArray(users) ? (users[0]?.email ?? null) : users.email;
}

// Triggered by Vercel Cron Sunday evening (see vercel.json), or manually via
// curl with the same bearer token. It plans each member's COMING week (the one starting tomorrow) and emails it:
// planning the week that is ending would send a plan for days that have already gone.
// A member who finishes setting up after this has run is planned and emailed when they finish (see onboarding/actions.ts).
export async function GET(request: Request) {
  if (!isCronRequest(request)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const admin = createAdminClient();
  const weekStart = nextLondonWeekStart();
  const { data: members } = await admin.from("member_profiles").select("user_id, location_text, email_weekly_plan, users(email)");

  const results: { memberId: string; error: string | null }[] = [];

  for (const member of (members ?? []) as unknown as MemberRow[]) {
    const error = await planAndEmailWeekAhead(admin, { ...member, email: emailOf(member.users) }, weekStart);
    results.push({ memberId: member.user_id, error });
  }

  return NextResponse.json({ results });
}
