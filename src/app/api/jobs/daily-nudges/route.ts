import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { detectNudgeCandidate } from "@/lib/nudges/detect";
import { writeNudgeMessage } from "@/lib/nudges/message";
import { sendNudgeEmail } from "@/lib/email/send";

type MemberRow = {
  user_id: string;
  interests: string[];
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
  const { data: members } = await admin
    .from("member_profiles")
    .select("user_id, interests, users(email, status)");

  const results: { memberId: string; sent: boolean; reason?: string; error?: string }[] = [];

  for (const member of (members ?? []) as unknown as MemberRow[]) {
    const user = usersOf(member.users);
    if (!user || user.status !== "active") {
      results.push({ memberId: member.user_id, sent: false, error: "Not an active member" });
      continue;
    }

    try {
      const candidate = await detectNudgeCandidate(admin, member.user_id);
      if (!candidate) {
        results.push({ memberId: member.user_id, sent: false });
        continue;
      }

      const message = await writeNudgeMessage(candidate.reason, candidate.activity, member.interests);

      await sendNudgeEmail(user.email, message, {
        title: candidate.activity.title,
        category: candidate.activity.category,
        address: candidate.activity.address,
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

  return NextResponse.json({ results });
}
