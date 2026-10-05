import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { detectNudgeCandidate } from "@/lib/nudges/detect";
import { writeNudgeMessage } from "@/lib/nudges/message";
import { sendNudgeEmail } from "@/lib/email/send";
import { purgeOldDailyStates } from "@/lib/experience/dailyStateStore";
import { londonToday } from "@/lib/opportunities/schedule";

type MemberRow = {
  user_id: string;
  interests: string[];
  email_reminders: boolean;
  users: { email: string; status: string } | { email: string; status: string }[] | null;
};

function usersOf(users: MemberRow["users"]): { email: string; status: string } | null {
  if (!users) return null;
  return Array.isArray(users) ? (users[0] ?? null) : users;
}

// Triggered by Vercel Cron daily (see vercel.json), or manually via curl with
// the same bearer token — separate from the weekly itinerary/digest job.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const admin = createAdminClient();
  // How someone said they felt only ever shapes its own day: keep a week, then delete.
  const purgedDailyStates = await purgeOldDailyStates(admin, londonToday());
  const { data: members } = await admin
    .from("member_profiles")
    .select("user_id, interests, email_reminders, users(email, status)");

  const results: { memberId: string; sent: boolean; reason?: string; error?: string }[] = [];

  for (const member of (members ?? []) as unknown as MemberRow[]) {
    const user = usersOf(member.users);
    if (!user || user.status !== "active") {
      results.push({ memberId: member.user_id, sent: false, error: "Not an active member" });
      continue;
    }

    // They have switched reminders off: no point finding, writing or paying for one.
    if (member.email_reminders === false) {
      results.push({ memberId: member.user_id, sent: false, error: "Opted out of reminders" });
      continue;
    }

    try {
      const candidate = await detectNudgeCandidate(admin, member.user_id);
      if (!candidate) {
        results.push({ memberId: member.user_id, sent: false });
        continue;
      }

      const message = await writeNudgeMessage(
        admin,
        member.user_id,
        candidate.reason,
        candidate.activity,
        member.interests,
        candidate.person
      );

      await sendNudgeEmail(user.email, member.user_id, message, {
        title: candidate.activity.title,
        category: candidate.activity.category,
        address: candidate.activity.address,
        dateTime: candidate.activity.date_time,
        bookingUrl: candidate.activity.booking_url,
      });

      await admin.from("nudges").insert({
        member_id: member.user_id,
        activity_id: candidate.activity.id,
        reason: candidate.reason,
        message,
      });

      results.push({ memberId: member.user_id, sent: true, reason: candidate.reason });
    } catch (err) {
      results.push({ memberId: member.user_id, sent: false, error: err instanceof Error ? err.message : "Nudge failed" });
    }
  }

  return NextResponse.json({ results, purgedDailyStates });
}
