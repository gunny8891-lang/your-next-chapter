import type { SupabaseClient } from "@supabase/supabase-js";
import { generateAndSaveItinerary } from "@/lib/itinerary/generateAndSave";
import { addDays, getCurrentWeekStart } from "@/lib/opportunities/schedule";
import { formatCost, formatTime } from "@/lib/itinerary/format";
import { sendWeeklyDigestEmail } from "@/lib/email/send";
import type { DigestItem, DigestSurprise } from "@/lib/email/WeeklyDigestEmail";

/**
 * Planning a member's coming week and emailing it: the Sunday-evening job does it for everyone, and a member who finishes
 * setting up after that job has run is done here straight away, so they are not left a whole week without one.
 */

/** The hour (UTC) the weekly job runs on a Sunday: see vercel.json. */
export const WEEKLY_RUN_HOUR_UTC = 18;

/** Pure: whether the Sunday-evening job has already run today, so a member who has just joined would otherwise miss this week's. */
export function weeklyRunHasPassed(now: Date): boolean {
  return now.getUTCDay() === 0 && now.getUTCHours() >= WEEKLY_RUN_HOUR_UTC;
}

/** Pure: the Monday of the week ahead, as the Sunday-evening job counts it (by the UTC date, which is the Sunday it runs on). */
export function weekAheadFor(now: Date): string {
  return addDays(getCurrentWeekStart(now), 7);
}

type ActivityRow = {
  title: string;
  category: string;
  address: string | null;
  date_time: string | null;
  price_estimate: number | null;
  booking_url: string | null;
  description?: string | null;
};

export type WeekAheadMember = {
  user_id: string;
  location_text: string | null;
  email_weekly_plan: boolean | null;
  email: string | null;
};

/**
 * Plans the week for a member and emails it, unless they have switched the email off (the week is still planned in the app).
 * Returns the reason it did not work, or null. Never throws.
 */
export async function planAndEmailWeekAhead(admin: SupabaseClient, member: WeekAheadMember, weekStart: string): Promise<string | null> {
  try {
    if (!member.email) return "No email on record";

    const generated = await generateAndSaveItinerary(admin, member.user_id, { weekStart });
    if (generated.error || !generated.itineraryId) return generated.error ?? "Generation failed";

    // The week is still planned in the app; only the email is skipped for someone who has switched it off.
    if (member.email_weekly_plan === false) return null;

    const { data: itineraryItems } = await admin
      .from("itinerary_items")
      .select("day_of_week, slot, rationale_text, activities(title, category, address, date_time, price_estimate, booking_url)")
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
          bookingUrl: activity.booking_url,
        };
      });

    const { data: surpriseCard } = await admin
      .from("surprise_me_cards")
      .select("activities(title, address, price_estimate, description, booking_url)")
      .eq("member_id", member.user_id)
      .eq("week_start_date", weekStart)
      .maybeSingle();

    const surprise: DigestSurprise = (() => {
      const activity = surpriseCard?.activities as unknown as ActivityRow | null;
      if (!activity) return null;
      return {
        title: activity.title,
        location: activity.address ?? "Location TBC",
        cost: formatCost(activity.price_estimate),
        why: activity.description ?? "",
        bookingUrl: activity.booking_url,
      };
    })();

    await sendWeeklyDigestEmail(member.email, member.user_id, member.location_text?.replace("Near ", "") || "Your week", items, surprise, weekStart);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : "Week ahead failed";
  }
}

/**
 * For a member who has just finished setting up: if the Sunday-evening job has already run today, plans and emails the week
 * ahead now, since nothing else would until the Sunday after. Does nothing before the job has run (it will include them), or
 * if they already have a plan for that week (they were in the job's run, so this is a repeat). Never throws.
 */
export async function catchUpWeekAhead(admin: SupabaseClient, memberId: string, now: Date = new Date()): Promise<string | null> {
  try {
    if (!weeklyRunHasPassed(now)) return null;
    const weekStart = weekAheadFor(now);

    const { data: already } = await admin.from("itineraries").select("id").eq("member_id", memberId).eq("week_start_date", weekStart).maybeSingle();
    if (already) return null;

    const { data: profile } = await admin.from("member_profiles").select("user_id, location_text, email_weekly_plan, users(email)").eq("user_id", memberId).maybeSingle();
    if (!profile) return "No profile";
    const users = (profile as { users: { email: string } | { email: string }[] | null }).users;
    const email = Array.isArray(users) ? (users[0]?.email ?? null) : (users?.email ?? null);
    return await planAndEmailWeekAhead(admin, { user_id: memberId, location_text: profile.location_text, email_weekly_plan: profile.email_weekly_plan, email }, weekStart);
  } catch (err) {
    return err instanceof Error ? err.message : "Catch-up failed";
  }
}
