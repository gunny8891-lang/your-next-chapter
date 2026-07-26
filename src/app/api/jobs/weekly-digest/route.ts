import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { generateAndSaveItinerary, getCurrentWeekStart } from "@/lib/itinerary/generateAndSave";
import { formatCost, formatTime } from "@/lib/itinerary/format";
import { sendWeeklyDigestEmail } from "@/lib/email/send";
import type { DigestItem, DigestSurprise } from "@/lib/email/WeeklyDigestEmail";

type ActivityRow = {
  title: string;
  category: string;
  address: string | null;
  date_time: string | null;
  price_estimate: number | null;
  description?: string | null;
};

type MemberRow = {
  user_id: string;
  location_text: string | null;
  users: { email: string } | { email: string }[] | null;
};

function emailOf(users: MemberRow["users"]): string | null {
  if (!users) return null;
  return Array.isArray(users) ? (users[0]?.email ?? null) : users.email;
}

// Triggered by Vercel Cron Sunday evening (see vercel.json), or manually via
// curl with the same bearer token — regenerates each member's week and emails it.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const admin = createAdminClient();
  const { data: members } = await admin.from("member_profiles").select("user_id, location_text, users(email)");

  const results: { memberId: string; error: string | null }[] = [];

  for (const member of (members ?? []) as unknown as MemberRow[]) {
    const email = emailOf(member.users);
    if (!email) {
      results.push({ memberId: member.user_id, error: "No email on record" });
      continue;
    }

    const generated = await generateAndSaveItinerary(admin, member.user_id);
    if (generated.error || !generated.itineraryId) {
      results.push({ memberId: member.user_id, error: generated.error ?? "Generation failed" });
      continue;
    }

    const { data: itineraryItems } = await admin
      .from("itinerary_items")
      .select("day_of_week, slot, rationale_text, activities(title, category, address, date_time, price_estimate)")
      .eq("itinerary_id", generated.itineraryId);

    const items: DigestItem[] = (itineraryItems ?? [])
      .filter((row) => row.activities)
      .map((row) => {
        const activity = row.activities as unknown as ActivityRow;
        return {
          day: row.day_of_week,
          title: activity.title,
          category: activity.category,
          time: formatTime(activity.date_time, row.slot),
          location: activity.address ?? "Location TBC",
          cost: formatCost(activity.price_estimate),
          why: row.rationale_text ?? "",
        };
      });

    const { data: surpriseCard } = await admin
      .from("surprise_me_cards")
      .select("activities(title, address, price_estimate, description)")
      .eq("member_id", member.user_id)
      .eq("week_start_date", getCurrentWeekStart())
      .maybeSingle();

    const surprise: DigestSurprise = (() => {
      const activity = surpriseCard?.activities as unknown as ActivityRow | null;
      if (!activity) return null;
      return {
        title: activity.title,
        location: activity.address ?? "Location TBC",
        cost: formatCost(activity.price_estimate),
        why: activity.description ?? "",
      };
    })();

    try {
      await sendWeeklyDigestEmail(email, member.location_text?.replace("Near ", "") || "This week", items, surprise);
      results.push({ memberId: member.user_id, error: null });
    } catch (err) {
      results.push({ memberId: member.user_id, error: err instanceof Error ? err.message : "Email send failed" });
    }
  }

  return NextResponse.json({ results });
}
